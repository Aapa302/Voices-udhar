const DEFAULT_FALLBACK_MODEL = 'gemini-2.0-flash';
let cachedModelName = null;

/**
 * Parses version numbers from a model name string.
 * E.g., 'gemini-2.5-flash' -> [2, 5], 'gemini-1.5-pro' -> [1, 5]
 */
function parseVersion(modelName) {
  const match = modelName.match(/gemini-(\d+(?:\.\d+)*)/i) || modelName.match(/(\d+(?:\.\d+)*)/);
  if (!match) return [0];
  return match[1].split('.').map((num) => parseInt(num, 10));
}

/**
 * Compares two version arrays [major, minor, ...].
 * Returns positive if v1 > v2, negative if v1 < v2, 0 if equal.
 */
function compareVersions(v1, v2) {
  const len = Math.max(v1.length, v2.length);
  for (let i = 0; i < len; i++) {
    const num1 = v1[i] !== undefined ? v1[i] : 0;
    const num2 = v2[i] !== undefined ? v2[i] : 0;
    if (num1 !== num2) {
      return num1 - num2;
    }
  }
  return 0;
}

/**
 * Selects the best Gemini model from an array of model objects returned by ListModels API.
 */
function selectBestModel(models) {
  if (!Array.isArray(models) || models.length === 0) {
    return null;
  }

  // Filter models that support generateContent
  const generateModels = models.filter((m) => {
    const methods = m.supportedGenerationMethods || m.supported_generation_methods || [];
    return Array.isArray(methods) && methods.includes('generateContent');
  });

  if (generateModels.length === 0) {
    return null;
  }

  const cleanModels = generateModels.map((m) => {
    const rawName = m.name || '';
    return {
      raw: m,
      name: rawName.replace(/^models\//, ''),
    };
  });

  // Filter flash models & pro models
  const flashModels = cleanModels.filter((m) => m.name.toLowerCase().includes('flash'));
  const proModels = cleanModels.filter((m) => m.name.toLowerCase().includes('pro'));

  const candidatePool = flashModels.length > 0 ? flashModels : (proModels.length > 0 ? proModels : cleanModels);

  // Sort candidates by version descending
  candidatePool.sort((a, b) => {
    const vA = parseVersion(a.name);
    const vB = parseVersion(b.name);
    const cmp = compareVersions(vB, vA); // descending
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name);
  });

  return candidatePool[0].name;
}

/**
 * Resolves the Gemini model name by querying Google ListModels REST API.
 * Caches result in memory for lifetime of process.
 */
async function resolveGeminiModel(apiKeyOverride) {
  if (cachedModelName) {
    return cachedModelName;
  }

  const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn(`[Gemini] GEMINI_API_KEY missing. Falling back to default model: ${DEFAULT_FALLBACK_MODEL}`);
    cachedModelName = DEFAULT_FALLBACK_MODEL;
    return cachedModelName;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`ListModels HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const selected = selectBestModel(data.models);

    if (selected) {
      cachedModelName = selected;
      console.log(`[Gemini] Auto-detected model: ${cachedModelName}`);
    } else {
      console.warn(`[Gemini] No suitable models supporting generateContent found in ListModels response. Falling back to default model: ${DEFAULT_FALLBACK_MODEL}`);
      cachedModelName = DEFAULT_FALLBACK_MODEL;
    }
  } catch (error) {
    console.warn(`[Gemini] Auto-detection failed (${error.message}). Falling back to default model: ${DEFAULT_FALLBACK_MODEL}`);
    cachedModelName = DEFAULT_FALLBACK_MODEL;
  }

  return cachedModelName;
}

/**
 * Accessor for cached or resolved model name.
 */
async function getGeminiModelName() {
  if (cachedModelName) {
    return cachedModelName;
  }
  return await resolveGeminiModel();
}

/**
 * Resets memory cache (primarily for unit testing).
 */
function resetCache() {
  cachedModelName = null;
}

module.exports = {
  resolveGeminiModel,
  getGeminiModelName,
  selectBestModel,
  parseVersion,
  compareVersions,
  resetCache,
  DEFAULT_FALLBACK_MODEL,
};
