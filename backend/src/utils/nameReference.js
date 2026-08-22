const fs = require('fs');
const path = require('path');

/**
 * Calculates Levenshtein distance between two strings.
 */
function levenshteinDistance(a, b) {
  if (!a || !b) return (a || b || '').length;
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

const knownFirstNames = new Set();
const firstNamesList = []; // Array of original casing

const knownSurnames = new Set();
const surnamesList = []; // Array of original casing

function loadReferenceFiles() {
  try {
    const firstNamesPath = path.join(__dirname, '../../gujarati_first_names.csv');
    if (fs.existsSync(firstNamesPath)) {
      const content = fs.readFileSync(firstNamesPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) { // skip header FirstName,Gender
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',');
        const firstName = parts[0] ? parts[0].trim() : '';
        if (firstName) {
          const lower = firstName.toLowerCase();
          if (!knownFirstNames.has(lower)) {
            knownFirstNames.add(lower);
            firstNamesList.push(firstName);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Warning: Failed to load gujarati_first_names.csv:', err.message);
  }

  try {
    const surnamesPath = path.join(__dirname, '../../gujarati_surnames.csv');
    if (fs.existsSync(surnamesPath)) {
      const content = fs.readFileSync(surnamesPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) { // skip header Surname
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',');
        const surname = parts[0] ? parts[0].trim() : '';
        if (surname) {
          const lower = surname.toLowerCase();
          if (!knownSurnames.has(lower)) {
            knownSurnames.add(lower);
            surnamesList.push(surname);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Warning: Failed to load gujarati_surnames.csv:', err.message);
  }
}

// Load CSVs on module init
loadReferenceFiles();

/**
 * Checks (case-insensitive) if a given word matches an entry in known first names list.
 */
function isKnownFirstName(name) {
  if (!name || typeof name !== 'string') return false;
  return knownFirstNames.has(name.trim().toLowerCase());
}

/**
 * Checks (case-insensitive) if a given word matches an entry in known surnames list.
 */
function isKnownSurname(name) {
  if (!name || typeof name !== 'string') return false;
  return knownSurnames.has(name.trim().toLowerCase());
}

/**
 * Uses Levenshtein distance check against known first names list and returns the closest match if within maxDistance,
 * or null if no close match found.
 */
function findClosestFirstName(transcribedName, maxDistance = 2) {
  if (!transcribedName || typeof transcribedName !== 'string') return null;
  const clean = transcribedName.trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();

  // If already known, return original casing match or clean
  if (knownFirstNames.has(lower)) {
    const exact = firstNamesList.find((fn) => fn.toLowerCase() === lower);
    return exact || clean;
  }

  let bestMatch = null;
  let minDistance = Infinity;

  for (const fn of firstNamesList) {
    const fnLower = fn.toLowerCase();
    const dist = levenshteinDistance(lower, fnLower);
    if (dist <= maxDistance && dist < minDistance) {
      minDistance = dist;
      bestMatch = fn;
    }
  }

  return bestMatch;
}

/**
 * Uses Levenshtein distance check against known surnames list and returns the closest match if within maxDistance,
 * or null if no close match found.
 */
function findClosestSurname(transcribedName, maxDistance = 2) {
  if (!transcribedName || typeof transcribedName !== 'string') return null;
  const clean = transcribedName.trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();

  if (knownSurnames.has(lower)) {
    const exact = surnamesList.find((sn) => sn.toLowerCase() === lower);
    return exact || clean;
  }

  let bestMatch = null;
  let minDistance = Infinity;

  for (const sn of surnamesList) {
    const snLower = sn.toLowerCase();
    const dist = levenshteinDistance(lower, snLower);
    if (dist <= maxDistance && dist < minDistance) {
      minDistance = dist;
      bestMatch = sn;
    }
  }

  return bestMatch;
}

/**
 * Checks transcribed customer name against known first names and surnames reference lists.
 * Handles single names (first name only) or multi-word names (first name + middle parts + surname).
 * Returns suggested correction string if close match found, or null.
 */
function getSuggestedNameCorrection(customerName) {
  if (!customerName || typeof customerName !== 'string') return null;
  const clean = customerName.trim();
  if (!clean) return null;

  const parts = clean.split(/\s+/);

  if (parts.length === 1) {
    const firstName = parts[0];
    if (!isKnownFirstName(firstName)) {
      const correctedFirst = findClosestFirstName(firstName, 2);
      if (correctedFirst && correctedFirst.toLowerCase() !== firstName.toLowerCase()) {
        return correctedFirst;
      }
    }
    return null;
  }

  const firstPart = parts[0];
  const lastPart = parts[parts.length - 1];
  const middleParts = parts.slice(1, -1);

  let correctedFirstName = null;
  if (!isKnownFirstName(firstPart)) {
    correctedFirstName = findClosestFirstName(firstPart, 2);
  }

  let correctedSurname = null;
  if (!isKnownSurname(lastPart)) {
    correctedSurname = findClosestSurname(lastPart, 2);
  }

  if (correctedFirstName || correctedSurname) {
    const finalFirst = correctedFirstName || firstPart;
    const finalSurname = correctedSurname || lastPart;
    const suggested = [finalFirst, ...middleParts, finalSurname].join(' ').trim();
    if (suggested.toLowerCase() !== clean.toLowerCase()) {
      return suggested;
    }
  }

  return null;
}

module.exports = {
  isKnownFirstName,
  isKnownSurname,
  findClosestFirstName,
  findClosestSurname,
  getSuggestedNameCorrection,
  levenshteinDistance,
};
