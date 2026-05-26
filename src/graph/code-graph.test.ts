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

  it('should exclude test files and external edges from healthScore calculation', () => {
    const graph = new CodeGraph();
    
    // Add 10 normal functions
    for (let i = 0; i < 10; i++) {
      graph.addNode({
        id: `n${i}`,
        type: NodeType.FUNCTION,
        name: `func${i}`,
        filePath: 'src/main.ts',
        startLine: 1,
        endLine: 5,
        exportType: 'none' as any,
        signature: 'func()',
      });
    }

    // Add 2 functions inside a test file (should be ignored in denominator)
    graph.addNode({
      id: 'test_n1',
      type: NodeType.FUNCTION,
      name: 'testFunc1',
      filePath: 'test/main.test.ts',
      startLine: 1,
      endLine: 5,
      exportType: 'none' as any,
      signature: 'testFunc()',
    });
    graph.addNode({
      id: 'test_n2',
      type: NodeType.FUNCTION,
      name: 'testFunc2',
      filePath: 'src/fixtures/sample.ts',
      startLine: 1,
      endLine: 5,
      exportType: 'none' as any,
      signature: 'testFunc()',
    });

    // normal nodes = 10. Enrich 5 nodes (5/10 = 50% enrichment -> 35 points)
    for (let i = 0; i < 5; i++) {
      graph.enrichNode(`n${i}`, {
        summary: 'desc',
        complexity: 'low',
        domainConcepts: [],
        enrichedAt: '2026-05-18T00:00:00Z',
        enrichedBy: 'agent'
      });
    }

    // Add 8 internal resolved edges and 2 unresolved edges (80% internal resolution -> 24 points)
    for (let i = 0; i < 8; i++) {
      graph.addEdge({
        sourceId: `n${i}`,
        targetId: `n${i+1}`,
        relation: EdgeRelation.CALLS,
        sourceFile: 'src/main.ts',
        sourceLine: 1
      });
    }
    graph.addEdge({
      sourceId: '?unresolved1',
      targetId: 'n0',
      relation: EdgeRelation.CALLS,
      sourceFile: 'src/main.ts',
      sourceLine: 1
    });
    graph.addEdge({
      sourceId: 'n0',
      targetId: '?unresolved2',
      relation: EdgeRelation.CALLS,
      sourceFile: 'src/main.ts',
      sourceLine: 1
    });

    // Add 5 EXTERNAL confidence edges (should be completely excluded from resolution rate)
    for (let i = 0; i < 5; i++) {
      graph.addEdge({
        sourceId: `n${i}`,
        targetId: `externalPack::func${i}`,
        relation: EdgeRelation.CALLS,
        sourceFile: 'src/main.ts',
        sourceLine: 1,
        confidence: 'EXTERNAL' as any
      });
    }

    const metadata = (graph as any).getMetadata('test-project', '0.15.8');
    
    // normal nodes = 10. total test nodes = 2 (ignored). total enrichable = 10.
    // internal edges = 10 (8 resolved, 2 unresolved). external edges = 5 (ignored).
    // enrichmentRate = 5/10 = 0.5. resolutionRate = 8/10 = 0.8.
    // healthScore = (0.5 * 70) + (0.8 * 30) = 35 + 24 = 59.
    expect(metadata.healthScore).toBe(59);
    expect(metadata.resolution.externalEdges).toBe(5);
    expect(metadata.resolution.totalEdges).toBe(15);
  });
});
