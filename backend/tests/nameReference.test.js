const {
  isKnownFirstName,
  isKnownSurname,
  findClosestFirstName,
  findClosestSurname,
  getSuggestedNameCorrection,
} = require('../src/utils/nameReference');

describe('Gujarati Name Reference Reference Utility', () => {
  test('isKnownFirstName checks known Gujarati first names case-insensitively', () => {
    expect(isKnownFirstName('Bhavesh')).toBe(true);
    expect(isKnownFirstName('bhavesh')).toBe(true);
    expect(isKnownFirstName('Ramesh')).toBe(true);
    expect(isKnownFirstName('NonExistentFirstName123')).toBe(false);
  });

  test('isKnownSurname checks known Gujarati surnames case-insensitively', () => {
    expect(isKnownSurname('Patel')).toBe(true);
    expect(isKnownSurname('patel')).toBe(true);
    expect(isKnownSurname('Shah')).toBe(true);
    expect(isKnownSurname('NonExistentSurname123')).toBe(false);
  });

  test('findClosestFirstName finds closest match within maxDistance', () => {
    // "Rames" (distance 1 from "Ramesh")
    const match = findClosestFirstName('Rames', 2);
    expect(match).toBe('Ramesh');

    // Completely unknown string with no match within distance 2
    const noMatch = findClosestFirstName('Xyzzyqqq123', 2);
    expect(noMatch).toBeNull();
  });

  test('findClosestSurname finds closest match within maxDistance', () => {
    // "Pate" (distance 1 from "Patel")
    const match = findClosestSurname('Pate', 2);
    expect(match).toBe('Patel');

    // Completely unknown surname
    const noMatch = findClosestSurname('Zzzqqq123', 2);
    expect(noMatch).toBeNull();
  });

  test('getSuggestedNameCorrection handles first name and surname corrections', () => {
    // First name correction: "Rames" -> "Ramesh"
    expect(getSuggestedNameCorrection('Rames')).toBe('Ramesh');

    // Full name correction: "Rames Pate" -> "Ramesh Patel"
    expect(getSuggestedNameCorrection('Rames Pate')).toBe('Ramesh Patel');

    // Already correct name returns null
    expect(getSuggestedNameCorrection('Ramesh Patel')).toBeNull();

    // Completely unknown name returns null
    expect(getSuggestedNameCorrection('Xyzzyqqq123')).toBeNull();
  });
});
