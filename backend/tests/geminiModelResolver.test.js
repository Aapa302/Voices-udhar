const {
  resolveGeminiModel,
  getGeminiModelName,
  selectBestModel,
  parseVersion,
  compareVersions,
  resetCache,
  DEFAULT_FALLBACK_MODEL,
} = require('../src/config/geminiModelResolver');

describe('geminiModelResolver', () => {
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

  describe('selectBestModel', () => {
    test('selects highest version flash model that supports generateContent', () => {
      const models = [
        { name: 'models/gemini-1.0-pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.0-flash', supportedGenerationMethods: ['embedContent'] }, // unsupported method
      ];

      const selected = selectBestModel(models);
      expect(selected).toBe('gemini-2.5-flash');
    });

    test('falls back to highest pro model if no flash model supports generateContent', () => {
      const models = [
        { name: 'models/gemini-1.0-pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['embedContent'] },
      ];

      const selected = selectBestModel(models);
      expect(selected).toBe('gemini-2.5-pro');
    });

    test('returns null if models array is empty or no model supports generateContent', () => {
      expect(selectBestModel([])).toBeNull();
      expect(
        selectBestModel([
          { name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['embedContent'] },
        ])
      ).toBeNull();
    });
  });

  describe('resolveGeminiModel & getGeminiModelName', () => {
    test('uses fallback model when GEMINI_API_KEY is missing', async () => {
      delete process.env.GEMINI_API_KEY;

      const model = await resolveGeminiModel();
      expect(model).toBe(DEFAULT_FALLBACK_MODEL);
    });

    test('fetches from ListModels API and caches the result', async () => {
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

      const model = await resolveGeminiModel();
      expect(model).toBe('gemini-2.5-flash');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models?key=test-api-key'
      );

      // Second call should return cached value without fetching again
      const cachedModel = await getGeminiModelName();
      expect(cachedModel).toBe('gemini-2.5-flash');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('falls back gracefully on API error (e.g. 403 or network failure)', async () => {
      process.env.GEMINI_API_KEY = 'invalid-key';

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const model = await resolveGeminiModel();
      expect(model).toBe(DEFAULT_FALLBACK_MODEL);

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
