import { describe, it, expect } from 'vitest';
import { fuseRankedLists } from '../../../src/graph/query/rrf.js';

describe('RRF Score Fusion Engine', () => {
  it('should fuse two ranked lists and sort items by RRF score descending', () => {
    // List 1: A, B, C
    // List 2: B, A, D
    const list1 = ['A', 'B', 'C'];
    const list2 = ['B', 'A', 'D'];

    const result = fuseRankedLists(
      [list1, list2],
      (item) => item,
      { k: 60 }
    );

    expect(result).toBeDefined();
    expect(result.length).toBe(4);

    // Item A scores: 1/(60+1) [from list1] + 1/(60+2) [from list2] = 1/61 + 1/62 = 0.016393 + 0.016129 = 0.032522
    // Item B scores: 1/(60+2) [from list1] + 1/(60+1) [from list2] = 1/62 + 1/61 = 0.032522
    // Item C scores: 1/(60+3) [from list1] = 1/63 = 0.015873
    // Item D scores: 1/(60+3) [from list2] = 1/63 = 0.015873
    
    // Order of A and B can be tied but they should be at the top
    const top2 = result.slice(0, 2).map(r => r.item);
    expect(top2).toContain('A');
    expect(top2).toContain('B');
    
    const bottom2 = result.slice(2, 4).map(r => r.item);
    expect(bottom2).toContain('C');
    expect(bottom2).toContain('D');

    // Verify ranks mapping
    const aResult = result.find(r => r.item === 'A')!;
    expect(aResult.ranks).toEqual([0, 1]); // Index 0 in list1, Index 1 in list2

    const cResult = result.find(r => r.item === 'C')!;
    expect(cResult.ranks).toEqual([2, -1]); // Index 2 in list1, not in list2
  });

  it('should handle custom smoothing constant k', () => {
    const list1 = ['A', 'B'];
    const list2 = ['B', 'C'];

    const result = fuseRankedLists(
      [list1, list2],
      (item) => item,
      { k: 2 } // Custom small k
    );

    // A: 1/(2+1) + 0 = 1/3 = 0.333
    // B: 1/(2+2) + 1/(2+1) = 1/4 + 1/3 = 0.583
    // C: 0 + 1/(2+2) = 1/4 = 0.25
    expect(result[0].item).toBe('B');
    expect(result[1].item).toBe('A');
    expect(result[2].item).toBe('C');
  });

  it('should handle empty ranked lists gracefully', () => {
    const result = fuseRankedLists([], (item: string) => item);
    expect(result).toEqual([]);

    const result2 = fuseRankedLists([[], []], (item: string) => item);
    expect(result2).toEqual([]);
  });

  it('should handle a single ranked list', () => {
    const list = ['A', 'B', 'C'];
    const result = fuseRankedLists([list], (item) => item);

    expect(result.length).toBe(3);
    expect(result[0].item).toBe('A');
    expect(result[1].item).toBe('B');
    expect(result[2].item).toBe('C');
    expect(result[0].ranks).toEqual([0]);
  });
});
