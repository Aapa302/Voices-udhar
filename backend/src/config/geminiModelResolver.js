const { db } = require('./firebase');

const DEFAULT_CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

let cachedCandidateModels = null;
let isHealthLoaded = false;

// Map of modelName -> number of consecutive failures during this server session
const modelFailureCounts = new Map();

// 12-hour cooldown interval to reset all model failure counts
const COOLDOWN_RESET_INTERVAL_MS = 12 * 60 * 60 * 1000;

async function loadModelHealthFromFirestore() {
  if (isHealthLoaded) return;
  try {
    const snapshot = await db.collection('geminiModelHealth').get();
    if (!snapshot || snapshot.empty) {
      console.log('[Gemini] Loaded model health from Firestore: (no failure history found)');
    } else {
      const summaryItems = [];
      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        const modelName = doc.id || data.modelName;
        const failures = data.consecutiveFailures || 0;
        modelFailureCounts.set(modelName, failures);
        summaryItems.push(`${modelName} (${failures} failure${failures === 1 ? '' : 's'})`);
      });
      console.log(`[Gemini] Loaded model health from Firestore: ${summaryItems.join(', ')}`);
    }
    isHealthLoaded = true;
  } catch (err) {
    console.warn(`[Gemini] Failed to load model health from Firestore: ${err.message}`);
  }
}

async function resetModelFailureCounts() {
  modelFailureCounts.clear();
  console.log('[Gemini] All model failure counts reset (cooldown timer / cache reset)');

  try {
    const snapshot = await db.collection('geminiModelHealth').get();
    if (snapshot && !snapshot.empty) {
      const batch = db.batch();
      let hasUpdates = false;
      snapshot.forEach((doc) => {
        if ((doc.data().consecutiveFailures || 0) > 0) {
          batch.set(db.collection('geminiModelHealth').doc(doc.id), { consecutiveFailures: 0 }, { merge: true });
          hasUpdates = true;
        }
      });
      if (hasUpdates) {
        await batch.commit();
        console.log('[Gemini] Model health failure counts reset in Firestore (cooldown)');
      }
    }
  } catch (err) {
    console.warn(`[Gemini] Failed to reset model health in Firestore: ${err.message}`);
  }
}

const cooldownTimer = setInterval(() => {
  resetModelFailureCounts();
}, COOLDOWN_RESET_INTERVAL_MS);

if (cooldownTimer && typeof cooldownTimer.unref === 'function') {
  cooldownTimer.unref();
}

async function recordModelSuccess(modelName) {
  if (!modelName) return;
  const prev = modelFailureCounts.get(modelName) || 0;
  modelFailureCounts.set(modelName, 0);

  // State change criteria: success after failures
  if (prev > 0) {
    try {
      const nowISO = new Date().toISOString();
      await db.collection('geminiModelHealth').doc(modelName).set(
        {
          modelName,
          consecutiveFailures: 0,
          lastSuccessAt: nowISO,
        },
        { merge: true }
      );
      console.log(`[Gemini] Firestore model health updated successfully for ${modelName}: consecutiveFailures=0`);
    } catch (err) {
      console.error(`[Gemini] Firestore model health update FAILED for ${modelName}: ${err.message}`);
    }
  }
}

async function recordModelFailure(modelName) {
  if (!modelName) return;
  const prev = modelFailureCounts.get(modelName) || 0;
  const current = prev + 1;
  modelFailureCounts.set(modelName, current);
  console.log(`[Gemini] ${modelName} failure count now: ${current}`);

  try {
    const nowISO = new Date().toISOString();
    await db.collection('geminiModelHealth').doc(modelName).set(
      {
        modelName,
        consecutiveFailures: current,
        lastFailureAt: nowISO,
      },
      { merge: true }
    );
    console.log(`[Gemini] Firestore model health updated successfully for ${modelName}: consecutiveFailures=${current}`);
  } catch (err) {
    console.error(`[Gemini] Firestore model health update FAILED for ${modelName}: ${err.message}`);
  }
}

function getModelFailureCount(modelName) {
  return modelFailureCounts.get(modelName) || 0;
}

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
 * Selects an ordered list of candidate Gemini models from ListModels API response.
 * Ordered by: Flash models (newest to oldest), then Pro models (newest to oldest), then others.
 */
function selectCandidateModels(models) {
  if (!Array.isArray(models) || models.length === 0) {
    return DEFAULT_CANDIDATE_MODELS;
  }

  // Filter models that support generateContent
  const generateModels = models.filter((m) => {
    const methods = m.supportedGenerationMethods || m.supported_generation_methods || [];
    return Array.isArray(methods) && methods.includes('generateContent');
  });

  if (generateModels.length === 0) {
    return DEFAULT_CANDIDATE_MODELS;
  }

  const cleanModels = generateModels.map((m) => {
    const rawName = m.name || '';
    return {
      raw: m,
      name: rawName.replace(/^models\//, ''),
    };
  });

  const flashModels = cleanModels.filter((m) => m.name.toLowerCase().includes('flash'));
  const proModels = cleanModels.filter((m) => m.name.toLowerCase().includes('pro'));
  const otherModels = cleanModels.filter(
    (m) => !m.name.toLowerCase().includes('flash') && !m.name.toLowerCase().includes('pro')
  );

  const sortDesc = (a, b) => {
    const vA = parseVersion(a.name);
    const vB = parseVersion(b.name);
    const cmp = compareVersions(vB, vA);
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name);
  };

  flashModels.sort(sortDesc);
  proModels.sort(sortDesc);
  otherModels.sort(sortDesc);

  const candidatePool = [...flashModels, ...proModels, ...otherModels].map((m) => m.name);

  // Remove duplicates while preserving order
  const uniqueCandidates = Array.from(new Set(candidatePool));

  return uniqueCandidates.length > 0 ? uniqueCandidates : DEFAULT_CANDIDATE_MODELS;
}

/**
 * Resolves and caches the ordered list of candidate models from Google ListModels REST API.
 */
async function getCandidateModels(apiKeyOverride) {
  await loadModelHealthFromFirestore();

  if (cachedCandidateModels && cachedCandidateModels.length > 0) {
    return cachedCandidateModels;
  }

  const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn(`[Gemini] GEMINI_API_KEY missing. Using default candidate models list: ${DEFAULT_CANDIDATE_MODELS.join(', ')}`);
    cachedCandidateModels = DEFAULT_CANDIDATE_MODELS;
    return cachedCandidateModels;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`ListModels HTTP error status: ${response.status}`);
    }

    const data = await response.json();
    const candidates = selectCandidateModels(data.models);

    cachedCandidateModels = candidates;
    console.log(`[Gemini] Candidate models list initialized: ${cachedCandidateModels.join(', ')}`);
    console.log(`[Gemini] Auto-detected primary model: ${cachedCandidateModels[0]}`);
  } catch (error) {
    console.warn(`[Gemini] Auto-detection failed (${error.message}). Using default candidate models list: ${DEFAULT_CANDIDATE_MODELS.join(', ')}`);
    cachedCandidateModels = DEFAULT_CANDIDATE_MODELS;
  }

  return cachedCandidateModels;
}

/**
 * Returns the primary (best) model name.
 */
async function getGeminiModelName() {
  const candidates = await getCandidateModels();
  return candidates[0];
}

/**
 * Backward compatibility function for single model resolution.
 */
async function resolveGeminiModel(apiKeyOverride) {
  const candidates = await getCandidateModels(apiKeyOverride);
  return candidates[0];
}

/**
 * Helper to determine if an error is non-transient (e.g., auth, bad request).
 * Retrying with a different model won't help non-transient errors.
 */
function isNonTransientError(error) {
  if (!error) return false;
  const status = error.status || error.statusCode;
  const message = (error.message || '').toLowerCase();

  // HTTP status codes that indicate client error / non-transient issue
  if (status && [400, 401, 403, 404].includes(Number(status))) {
    return true;
  }

  // Common non-transient error phrases
  if (
    message.includes('api_key_invalid') ||
    message.includes('invalid api key') ||
    message.includes('unauthorized') ||
    message.includes('permission denied') ||
    message.includes('invalid_argument')
  ) {
    return true;
  }

  return false;
}

/**
 * Helper for retry delay.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls Gemini API with fallback retry logic across candidate models.
 * Skips models that have failed 2+ consecutive times in this server session.
 * @param {GoogleGenerativeAI} genAI - The initialized GoogleGenerativeAI instance
 * @param {Function} generateContentFn - Async callback receiving a initialized model instance: async (model) => ...
 * @param {Object} options - Optional config { retryDelayMs, timeoutMs }
 */
async function generateWithFallback(genAI, generateContentFn, options = {}) {
  await loadModelHealthFromFirestore();

  const candidatesStart = Date.now();
  const rawCandidates = await getCandidateModels();
  const candidatesDuration = Date.now() - candidatesStart;
  const retryDelayMs = options.retryDelayMs !== undefined ? options.retryDelayMs : 500;
  const attemptTimeoutMs = options.timeoutMs !== undefined ? options.timeoutMs : 6000;
  let lastError = null;

  // Filter candidates to skip models with 1+ consecutive failures
  let candidatesToAttempt = rawCandidates.filter((model) => (modelFailureCounts.get(model) || 0) < 1);

  // If ALL candidates have failed 1+ times, reset failure counts so we don't permanently block requests
  if (candidatesToAttempt.length === 0) {
    console.warn('[Gemini] All candidate models have 1+ consecutive failures. Resetting failure counts to retry candidate list.');
    await resetModelFailureCounts();
    candidatesToAttempt = [...rawCandidates];
  }

  // Log skipped models
  for (const modelName of rawCandidates) {
    const failures = modelFailureCounts.get(modelName) || 0;
    if (failures >= 1) {
      console.log(`[Gemini] Skipping ${modelName} — failed ${failures} consecutive time${failures === 1 ? '' : 's'}, will retry after cooldown`);
    }
  }

  console.log(`[Gemini Candidate Resolution] Duration: ${candidatesDuration}ms | Active candidate models: [${candidatesToAttempt.join(', ')}]`);

  for (let i = 0; i < candidatesToAttempt.length; i++) {
    const modelName = candidatesToAttempt[i];
    const attemptStart = Date.now();
    const attemptStartISO = new Date(attemptStart).toISOString();
    console.log(`[Gemini Call Attempt ${i + 1}/${candidatesToAttempt.length}] Started at ${attemptStartISO} | Model: ${modelName} | Timeout: ${attemptTimeoutMs / 1000}s`);

    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      let timer = null;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const timeoutErr = new Error(`Model ${modelName} timed out after ${attemptTimeoutMs / 1000}s`);
          timeoutErr.isTimeout = true;
          reject(timeoutErr);
        }, attemptTimeoutMs);
      });

      const result = await Promise.race([
        generateContentFn(model),
        timeoutPromise,
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });

      const attemptDuration = Date.now() - attemptStart;
      const attemptEndISO = new Date().toISOString();

      await recordModelSuccess(modelName);

      if (i === 0) {
        console.log(`[Gemini Call Attempt 1 Success] Finished at ${attemptEndISO} | Model: ${modelName} | Duration: ${attemptDuration}ms | First model succeeded, no fallback models attempted.`);
      } else {
        console.warn(`[Gemini Call Fallback Success] Finished at ${attemptEndISO} | Model: ${modelName} (Attempt ${i + 1}) | Duration: ${attemptDuration}ms | Note: ${i} previous model attempt(s) failed before this model succeeded.`);
      }

      return result;
    } catch (error) {
      const attemptDuration = Date.now() - attemptStart;
      const attemptEndISO = new Date().toISOString();
      lastError = error;
      await recordModelFailure(modelName);

      if (error.isTimeout) {
        console.warn(`[Gemini] Model ${modelName} timed out after ${attemptTimeoutMs / 1000}s, trying next candidate`);
      } else {
        console.warn(`[Gemini Call Attempt ${i + 1} Failed] Finished at ${attemptEndISO} | Model: ${modelName} | Duration: ${attemptDuration}ms | Error: ${error.message || error}`);
      }

      if (isNonTransientError(error)) {
        console.warn(`[Gemini] Non-transient error encountered on ${modelName}. Aborting model retries.`);
        throw error;
      }

      if (i < candidatesToAttempt.length - 1) {
        console.log(`[Gemini Retry] Retrying request with next fallback model candidate (${candidatesToAttempt[i + 1]})...`);
        if (retryDelayMs > 0) {
          await sleep(retryDelayMs);
        }
      }
    }
  }

  console.error(`[Gemini] All candidate models (${candidatesToAttempt.join(', ')}) failed.`);
  throw lastError || new Error('All Gemini candidate models failed to process request');
}

/**
 * Resets memory cache and failure counts (primarily for unit testing).
 */
function resetCache() {
  cachedCandidateModels = null;
  isHealthLoaded = false;
  modelFailureCounts.clear();
}

module.exports = {
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
  recordModelSuccess,
  recordModelFailure,
  loadModelHealthFromFirestore,
  DEFAULT_CANDIDATE_MODELS,
};
