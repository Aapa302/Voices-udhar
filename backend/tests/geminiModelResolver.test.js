const {
  resolveGeminiModel,
  getGeminiModelName,
  getCandidateModels,
  selectCandidateModels,
  generateWithFallback,
  parseVersion,
  compareVersions,
  isNonTransientError,
  resetCache,
  resetModelFailureCounts,
  getModelFailureCount,
  loadModelHealthFromFirestore,
  DEFAULT_CANDIDATE_MODELS,
} = require('../src/config/geminiModelResolver');
const { db } = require('../src/config/firebase');

describe('geminiModelResolver with candidate list & automatic fallback', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...originalEnv };
    if (typeof db._reset === 'function') {
      db._reset();
    }
    resetCache();
    delete global.fetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('parseVersion', () => {
    test('parses versions correctly from model names', () => {
      expect(parseVersion('gemini-1.5-flash')).toEqual([1, 5]);
      expect(parseVersion('gemini-2.5-flash')).toEqual([2, 5]);
      expect(parseVersion('gemini-2.0-flash')).toEqual([2, 0]);
      expect(parseVersion('gemini-2.5.1-pro')).toEqual([2, 5, 1]);
      expect(parseVersion('unknown-model')).toEqual([0]);
    });
  });

  describe('compareVersions', () => {
    test('compares version arrays accurately', () => {
      expect(compareVersions([2, 5], [1, 5])).toBeGreaterThan(0);
      expect(compareVersions([1, 5], [2, 5])).toBeLessThan(0);
      expect(compareVersions([2, 5], [2, 5])).toBe(0);
      expect(compareVersions([2, 5, 1], [2, 5])).toBeGreaterThan(0);
    });
  });

  describe('selectCandidateModels', () => {
    test('selects ordered candidate models (flash newest to oldest, then pro newest to oldest)', () => {
      const models = [
        { name: 'models/gemini-1.0-pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.0-flash', supportedGenerationMethods: ['embedContent'] }, // unsupported method
      ];

      const candidates = selectCandidateModels(models);
      expect(candidates).toEqual([
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-2.5-pro',
        'gemini-1.0-pro',
      ]);
    });

    test('returns default candidate models if list is empty or no model supports generateContent', () => {
      expect(selectCandidateModels([])).toEqual(DEFAULT_CANDIDATE_MODELS);
      expect(
        selectCandidateModels([
          { name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['embedContent'] },
        ])
      ).toEqual(DEFAULT_CANDIDATE_MODELS);
    });
  });

  describe('getCandidateModels & resolveGeminiModel', () => {
    test('uses default candidate list when GEMINI_API_KEY is missing', async () => {
      delete process.env.GEMINI_API_KEY;

      const candidates = await getCandidateModels();
      expect(candidates).toEqual(DEFAULT_CANDIDATE_MODELS);
    });

    test('fetches from ListModels API and caches candidate list', async () => {
      process.env.GEMINI_API_KEY = 'test-api-key';

      const mockResponse = {
        models: [
          { name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        ],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const candidates = await getCandidateModels();
      expect(candidates).toEqual(['gemini-2.5-flash', 'gemini-1.5-flash']);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Subsequent call should use cache
      const cachedCandidates = await getCandidateModels();
      expect(cachedCandidates).toEqual(['gemini-2.5-flash', 'gemini-1.5-flash']);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const primary = await resolveGeminiModel();
      expect(primary).toBe('gemini-2.5-flash');
    });

    test('falls back gracefully on API error (e.g. status 500)', async () => {
      process.env.GEMINI_API_KEY = 'test-api-key';

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const candidates = await getCandidateModels();
      expect(candidates).toEqual(DEFAULT_CANDIDATE_MODELS);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('isNonTransientError', () => {
    test('identifies non-transient client/auth/validation errors', () => {
      expect(isNonTransientError({ status: 400 })).toBe(true);
      expect(isNonTransientError({ status: 401 })).toBe(true);
      expect(isNonTransientError({ status: 403 })).toBe(true);
      expect(isNonTransientError({ status: 404 })).toBe(true);
      expect(isNonTransientError({ message: 'API_KEY_INVALID' })).toBe(true);

      // Transient errors
      expect(isNonTransientError({ status: 503 })).toBe(false);
      expect(isNonTransientError({ status: 429 })).toBe(false);
      expect(isNonTransientError({ status: 500 })).toBe(false);
      expect(isNonTransientError(new Error('Network failure'))).toBe(false);
    });
  });

  describe('generateWithFallback', () => {
    let mockGenAI;

    beforeEach(() => {
      mockGenAI = {
        getGenerativeModel: jest.fn((opts) => ({ modelName: opts.model })),
      };
    });

    test('executes successfully on primary candidate without retries', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      delete global.fetch;

      const generateFn = jest.fn().mockResolvedValue({ response: { text: () => 'OK' } });

      const result = await generateWithFallback(mockGenAI, generateFn, { retryDelayMs: 0 });

      expect(result.response.text()).toBe('OK');
      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledTimes(1);
      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledWith({ model: DEFAULT_CANDIDATE_MODELS[0] });
    });

    test('retries with next candidate model when primary fails with transient error (503)', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      const generateFn = jest
        .fn()
        .mockRejectedValueOnce({ status: 503, message: 'Service Unavailable' })
        .mockResolvedValueOnce({ response: { text: () => 'Fallback OK' } });

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await generateWithFallback(mockGenAI, generateFn, { retryDelayMs: 0 });

      expect(result.response.text()).toBe('Fallback OK');
      expect(generateFn).toHaveBeenCalledTimes(2);
      expect(mockGenAI.getGenerativeModel).toHaveBeenNthCalledWith(1, { model: DEFAULT_CANDIDATE_MODELS[0] });
      expect(mockGenAI.getGenerativeModel).toHaveBeenNthCalledWith(2, { model: DEFAULT_CANDIDATE_MODELS[1] });

      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    test('aborts retries immediately on non-transient error (401 invalid API key)', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      const authError = { status: 401, message: 'API key not valid' };
      const generateFn = jest.fn().mockRejectedValue(authError);

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(generateWithFallback(mockGenAI, generateFn, { retryDelayMs: 0 })).rejects.toEqual(authError);

      expect(generateFn).toHaveBeenCalledTimes(1);
      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });

    test('throws last error if all candidate models fail transiently', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      const error503 = { status: 503, message: 'Overloaded' };
      const generateFn = jest.fn().mockRejectedValue(error503);

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(generateWithFallback(mockGenAI, generateFn, { retryDelayMs: 0 })).rejects.toEqual(error503);

      expect(generateFn).toHaveBeenCalledTimes(DEFAULT_CANDIDATE_MODELS.length);

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    test('times out attempt when execution exceeds timeoutMs and falls back to next model', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      // First attempt hangs forever (> 50ms timeout)
      // Second attempt resolves immediately
      const generateFn = jest.fn((model) => {
        if (model.modelName === DEFAULT_CANDIDATE_MODELS[0]) {
          return new Promise((resolve) => setTimeout(() => resolve({ response: { text: () => 'Slow' } }), 200));
        }
        return Promise.resolve({ response: { text: () => 'Fast Fallback OK' } });
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const result = await generateWithFallback(mockGenAI, generateFn, { retryDelayMs: 0, timeoutMs: 50 });

      expect(result.response.text()).toBe('Fast Fallback OK');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[Gemini] Model ${DEFAULT_CANDIDATE_MODELS[0]} timed out after 0.05s, trying next candidate`)
      );

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    test('skips models with 2 or more consecutive failures and logs skipping message', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      const error503 = { status: 503, message: 'Server Overloaded' };
      const generateFnFailFirst = jest.fn((model) => {
        if (model.modelName === DEFAULT_CANDIDATE_MODELS[0]) {
          return Promise.reject(error503);
        }
        return Promise.resolve({ response: { text: () => 'Model 2 OK' } });
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // Call 1: Model 0 fails, Model 1 succeeds -> Model 0 failure count = 1
      await generateWithFallback(mockGenAI, generateFnFailFirst, { retryDelayMs: 0 });
      expect(getModelFailureCount(DEFAULT_CANDIDATE_MODELS[0])).toBe(1);

      mockGenAI.getGenerativeModel.mockClear();

      // Call 2: Model 0 fails again, Model 1 succeeds -> Model 0 failure count = 2
      await generateWithFallback(mockGenAI, generateFnFailFirst, { retryDelayMs: 0 });
      expect(getModelFailureCount(DEFAULT_CANDIDATE_MODELS[0])).toBe(2);

      mockGenAI.getGenerativeModel.mockClear();

      // Call 3: Model 0 now has 2 consecutive failures and MUST BE SKIPPED completely!
      // It should NOT be called at all, and log "Skipping ..." should be printed.
      const generateFnAllOk = jest.fn().mockResolvedValue({ response: { text: () => 'Success' } });
      const result3 = await generateWithFallback(mockGenAI, generateFnAllOk, { retryDelayMs: 0 });

      expect(result3.response.text()).toBe('Success');
      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledTimes(1);
      expect(mockGenAI.getGenerativeModel).toHaveBeenNthCalledWith(1, { model: DEFAULT_CANDIDATE_MODELS[1] });
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[Gemini] Skipping ${DEFAULT_CANDIDATE_MODELS[0]} — failed 2 consecutive times, will retry after cooldown`)
      );

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    test('resets failure count to 0 when a model succeeds once', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      const generateFnFailFirst = jest.fn((model) => {
        if (model.modelName === DEFAULT_CANDIDATE_MODELS[0]) {
          return Promise.reject({ status: 503, message: 'Transient 503' });
        }
        return Promise.resolve({ response: { text: () => 'Model 2 OK' } });
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await generateWithFallback(mockGenAI, generateFnFailFirst, { retryDelayMs: 0 });
      expect(getModelFailureCount(DEFAULT_CANDIDATE_MODELS[0])).toBe(1);
      expect(getModelFailureCount(DEFAULT_CANDIDATE_MODELS[1])).toBe(0);

      // Now Model 0 succeeds
      const generateFnFirstOk = jest.fn().mockResolvedValue({ response: { text: () => 'Model 0 Succeeded' } });
      await generateWithFallback(mockGenAI, generateFnFirstOk, { retryDelayMs: 0 });
      expect(getModelFailureCount(DEFAULT_CANDIDATE_MODELS[0])).toBe(0);

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    test('resetModelFailureCounts clears failure map and allows model to be retried', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      const error503 = { status: 503, message: 'Server Overloaded' };
      const generateFnFailFirst = jest.fn((model) => {
        if (model.modelName === DEFAULT_CANDIDATE_MODELS[0]) {
          return Promise.reject(error503);
        }
        return Promise.resolve({ response: { text: () => 'Model 2 OK' } });
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // Cause Model 0 to fail twice
      await generateWithFallback(mockGenAI, generateFnFailFirst, { retryDelayMs: 0 });
      await generateWithFallback(mockGenAI, generateFnFailFirst, { retryDelayMs: 0 });
      expect(getModelFailureCount(DEFAULT_CANDIDATE_MODELS[0])).toBe(2);

      // Reset failure counts manually (mimicking 12-hour cooldown timer)
      await resetModelFailureCounts();
      expect(getModelFailureCount(DEFAULT_CANDIDATE_MODELS[0])).toBe(0);

      // Next request should attempt Model 0 again
      mockGenAI.getGenerativeModel.mockClear();
      const generateFnAllOk = jest.fn().mockResolvedValue({ response: { text: () => 'Success' } });
      await generateWithFallback(mockGenAI, generateFnAllOk, { retryDelayMs: 0 });

      expect(mockGenAI.getGenerativeModel).toHaveBeenNthCalledWith(1, { model: DEFAULT_CANDIDATE_MODELS[0] });

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe('Firestore Persistence for Model Health', () => {
    let mockGenAI;

    beforeEach(() => {
      mockGenAI = {
        getGenerativeModel: jest.fn((opts) => ({ modelName: opts.model })),
      };
    });

    test('loads model health from Firestore on startup/initial call and logs summary', async () => {
      // Seed Firestore with failure health records
      await db.collection('geminiModelHealth').doc('gemini-3.7-flash').set({
        modelName: 'gemini-3.7-flash',
        consecutiveFailures: 3,
        lastFailureAt: new Date().toISOString(),
      });
      await db.collection('geminiModelHealth').doc('gemini-3.6-flash').set({
        modelName: 'gemini-3.6-flash',
        consecutiveFailures: 1,
        lastFailureAt: new Date().toISOString(),
      });

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await loadModelHealthFromFirestore();

      expect(getModelFailureCount('gemini-3.7-flash')).toBe(3);
      expect(getModelFailureCount('gemini-3.6-flash')).toBe(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Gemini] Loaded model health from Firestore: gemini-3.7-flash (3 failures), gemini-3.6-flash (1 failure)')
      );

      logSpy.mockRestore();
    });

    test('persists failure to Firestore only when crossing 2-failure threshold', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      const error503 = { status: 503, message: 'Transient 503' };
      const generateFnFailFirst = jest.fn((model) => {
        if (model.modelName === DEFAULT_CANDIDATE_MODELS[0]) {
          return Promise.reject(error503);
        }
        return Promise.resolve({ response: { text: () => 'Model 2 OK' } });
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // Failure 1 (1 failure, below threshold) -> no Firestore write expected
      await generateWithFallback(mockGenAI, generateFnFailFirst, { retryDelayMs: 0 });
      let docSnap = await db.collection('geminiModelHealth').doc(DEFAULT_CANDIDATE_MODELS[0]).get();
      expect(docSnap.exists).toBe(false);

      // Failure 2 (2 failures, reaches threshold) -> writes to Firestore
      await generateWithFallback(mockGenAI, generateFnFailFirst, { retryDelayMs: 0 });
      docSnap = await db.collection('geminiModelHealth').doc(DEFAULT_CANDIDATE_MODELS[0]).get();
      expect(docSnap.exists).toBe(true);
      expect(docSnap.data().consecutiveFailures).toBe(2);

      // Failure 3 (already >= 2) -> does NOT write again (avoiding excessive writes)
      const setSpy = jest.spyOn(db.collection('geminiModelHealth').doc(DEFAULT_CANDIDATE_MODELS[0]), 'set');
      await generateWithFallback(mockGenAI, generateFnFailFirst, { retryDelayMs: 0 });
      expect(setSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    test('persists success to Firestore after failures (state change)', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      // Seed model with failure count = 1 in Firestore and memory
      await db.collection('geminiModelHealth').doc(DEFAULT_CANDIDATE_MODELS[0]).set({
        modelName: DEFAULT_CANDIDATE_MODELS[0],
        consecutiveFailures: 1,
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await loadModelHealthFromFirestore();

      expect(getModelFailureCount(DEFAULT_CANDIDATE_MODELS[0])).toBe(1);

      const generateFnFirstOk = jest.fn().mockResolvedValue({ response: { text: () => 'Model 0 Succeeded' } });
      await generateWithFallback(mockGenAI, generateFnFirstOk, { retryDelayMs: 0 });

      const docSnap = await db.collection('geminiModelHealth').doc(DEFAULT_CANDIDATE_MODELS[0]).get();
      expect(docSnap.data().consecutiveFailures).toBe(0);
      expect(docSnap.data().lastSuccessAt).toBeDefined();

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    test('cooldown reset updates Firestore documents with consecutiveFailures > 0', async () => {
      await db.collection('geminiModelHealth').doc('gemini-2.5-flash').set({
        modelName: 'gemini-2.5-flash',
        consecutiveFailures: 3,
      });

      await resetModelFailureCounts();

      const docSnap = await db.collection('geminiModelHealth').doc('gemini-2.5-flash').get();
      expect(docSnap.data().consecutiveFailures).toBe(0);
    });
  });
});
