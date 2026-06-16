import Levenshtein from 'fast-levenshtein';

// Trigger IDE index update
/**
 * Find the closest match for a search string among target candidates using Levenshtein distance.
 * Returns the best match if distance is <= maxDistance (default: 3), otherwise null.
 */
export function findFuzzyMatch(
  search: string,
  targets: string[],
  maxDistance: number = 3
): string | null {
  if (targets.length === 0) return null;

  let bestMatch: string | null = null;
  let minDistance = Infinity;

  for (const target of targets) {
    const dist = Levenshtein.get(search, target);
    if (dist < minDistance) {
      minDistance = dist;
      bestMatch = target;
    }
  }

  if (minDistance <= maxDistance) {
    return bestMatch;
  }

  return null;
}
