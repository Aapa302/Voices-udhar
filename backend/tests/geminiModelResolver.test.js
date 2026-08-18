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
  DEFAULT_CANDIDATE_MODELS,
} = require('../src/config/geminiModelResolver');

describe('geminiModelResolver with candidate list & automatic fallback', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
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
  });
});
