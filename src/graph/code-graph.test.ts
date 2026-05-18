import { describe, it, expect } from 'vitest';
import { CodeGraph } from './code-graph.js';
import { NodeType, EdgeRelation } from './models.js';

describe('CodeGraph.getMetadata', () => {
  it('should calculate healthScore with 30% resolution and 70% enrichment weights', () => {
    const graph = new CodeGraph();
    
    // Add 10 enrichable nodes
    for (let i = 0; i < 10; i++) {
      graph.addNode({
        id: `n${i}`,
        type: NodeType.FUNCTION,
        name: `func${i}`,
        filePath: 'test.ts',
        startLine: 1,
        endLine: 5,
        exportType: 'none' as any,
        signature: 'func()',
      });
    }

    // Enrich 5 nodes (50% enrichment -> 0.5 * 70 = 35)
    for (let i = 0; i < 5; i++) {
      graph.enrichNode(`n${i}`, {
        summary: 'desc',
        complexity: 'low',
        domainConcepts: [],
        enrichedAt: '2026-05-18T00:00:00Z',
        enrichedBy: 'agent'
      });
    }

    // Add 8 resolved edges and 2 unresolved edges (80% resolution -> 0.8 * 30 = 24)
    for (let i = 0; i < 8; i++) {
      graph.addEdge({
        sourceId: `n${i}`,
        targetId: `n${i+1}`,
        relation: EdgeRelation.CALLS,
        sourceFile: 'test.ts',
        sourceLine: 1
      });
    }
    
    graph.addEdge({
      sourceId: '?unresolved1',
      targetId: 'n0',
      relation: EdgeRelation.CALLS,
      sourceFile: 'test.ts',
      sourceLine: 1
    });
    
    graph.addEdge({
      sourceId: 'n0',
      targetId: '?unresolved2',
      relation: EdgeRelation.CALLS,
      sourceFile: 'test.ts',
      sourceLine: 1
    });

    const metadata = (graph as any).getMetadata('test-project', '0.15.4');
    
    expect(metadata.healthScore).toBe(59);
    expect(metadata.projectName).toBe('test-project');
    expect(metadata.version).toBe('0.15.4');
  });
});
