import { describe, it, expect } from 'vitest';
import { findFuzzyMatch } from '../src/utils/fuzzy-match.js';

describe('Fuzzy Match Levenshtein Matcher', () => {
  it('should find closest match within distance <= 3', () => {
    const targets = [
      'csa-parser-comments',
      'csa-parser-markdown',
      'csa-db-schema'
    ];

    // Distance 1: typo
    expect(findFuzzyMatch('csa-parser-comment', targets)).toBe('csa-parser-comments');
    
    // Distance 2: typo
    expect(findFuzzyMatch('csa-db-schem', targets)).toBe('csa-db-schema');

    // Distance 3: typo
    expect(findFuzzyMatch('csa-db-sche', targets)).toBe('csa-db-schema');

    // Distance 4: exceeds threshold, should return null
    expect(findFuzzyMatch('csa-db-sc', targets)).toBeNull();
  });

  it('should return null if target list is empty', () => {
    expect(findFuzzyMatch('foo', [])).toBeNull();
  });
});
