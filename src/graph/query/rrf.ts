// @para-doc [artifacts/specs/spec-2026-06-18-rrf-multiseed.md#csa-src/graph/query/rrf.ts]
import type { FusedResult, RrfConfig } from '../models.js';

// @para-doc [artifacts/specs/spec-2026-06-18-rrf-multiseed.md#csa-rrf-scorer]
export function fuseRankedLists<T>(
  rankedLists: T[][],
  getKey: (item: T) => string,
  config: RrfConfig = { k: 60 }
): FusedResult<T>[] {
  if (!rankedLists || rankedLists.length === 0) {
    return [];
  }

  // Filter out empty lists, but if all are empty return empty
  const activeLists = rankedLists.filter(list => list && list.length > 0);
  if (activeLists.length === 0) {
    return [];
  }

  const scoreMap = new Map<string, { item: T; score: number; ranks: number[] }>();

  for (let listIdx = 0; listIdx < rankedLists.length; listIdx++) {
    const list = rankedLists[listIdx];
    if (!list) continue;
    
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const key = getKey(item);
      const existing = scoreMap.get(key);
      const rrfScore = 1 / (config.k + rank + 1); // rank is 0-indexed, paper uses 1-indexed

      if (existing) {
        existing.score += rrfScore;
        existing.ranks[listIdx] = rank;
      } else {
        const ranks = new Array(rankedLists.length).fill(-1);
        ranks[listIdx] = rank;
        scoreMap.set(key, { item, score: rrfScore, ranks });
      }
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map(({ item, score, ranks }) => ({ item, score, ranks }));
}
