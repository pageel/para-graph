import { describe, it, expect } from 'vitest';
import { NodeType, EdgeRelation } from '../../src/graph/models.js';

describe('Models Extension', () => {
  it('should support SPEC_ANCHOR node type', () => {
    expect(NodeType.SPEC_ANCHOR).toBe('spec_anchor');
  });

  it('should support DOCUMENTED_BY edge relation', () => {
    expect(EdgeRelation.DOCUMENTED_BY).toBe('DOCUMENTED_BY');
  });
});
