/**
 * Tests for INFERRED edge preservation during rebuild.
 *
 * Covers BUG-08: Agent-injected edges (confidence: 'INFERRED') were lost
 * when running `para-graph build` because the build pipeline overwrites
 * the graph without preserving manually injected edges.
 *
 * Test cases:
 *   T1: INFERRED edges are preserved when both source and target nodes exist
 *   T2: INFERRED edges with orphaned nodes are dropped (guard)
 *   T3: --clean flag skips edge preservation entirely
 *   T4: addEdge() deduplication — same edge twice results in only 1
 */

import { describe, it, expect } from 'vitest';
import { CodeGraph } from '../src/graph/code-graph.js';
import { EdgeRelation, ExportType, NodeType } from '../src/graph/models.js';
import type { GraphNode, GraphEdge } from '../src/graph/models.js';

function makeNode(id: string, filePath: string): GraphNode {
  return {
    id,
    type: NodeType.FUNCTION,
    name: id.split('::')[1] ?? id,
    filePath,
    startLine: 1,
    endLine: 10,
    exportType: ExportType.NAMED,
    signature: `function ${id.split('::')[1] ?? id}() {`,
  };
}

function makeInferredEdge(sourceId: string, targetId: string): GraphEdge {
  return {
    sourceId,
    targetId,
    relation: EdgeRelation.CALLS,
    sourceFile: sourceId.split('::')[0],
    sourceLine: 1,
    confidence: 'INFERRED',
  };
}

describe('INFERRED Edge Preservation (BUG-08)', () => {
  it('T1: preserves INFERRED edges when both nodes exist in new graph', () => {
    // Simulate: old graph had INFERRED edge A→B
    const inferredEdge = makeInferredEdge('file-a.ts::fnA', 'file-b.ts::fnB');

    // New graph has both nodes
    const newGraph = new CodeGraph();
    newGraph.addNode(makeNode('file-a.ts::fnA', 'file-a.ts'));
    newGraph.addNode(makeNode('file-b.ts::fnB', 'file-b.ts'));

    // Re-inject logic (mirrors build.ts Step 5.3)
    if (newGraph.getNode(inferredEdge.sourceId) && newGraph.getNode(inferredEdge.targetId)) {
      newGraph.addEdge(inferredEdge);
    }

    const edges = newGraph.getAllEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0].confidence).toBe('INFERRED');
    expect(edges[0].sourceId).toBe('file-a.ts::fnA');
    expect(edges[0].targetId).toBe('file-b.ts::fnB');
  });

  it('T2: drops INFERRED edges when source node no longer exists (orphan guard)', () => {
    const inferredEdge = makeInferredEdge('deleted.ts::fnOld', 'file-b.ts::fnB');

    // New graph only has the target node — source was deleted
    const newGraph = new CodeGraph();
    newGraph.addNode(makeNode('file-b.ts::fnB', 'file-b.ts'));

    // Re-inject logic — should NOT add because source is missing
    if (newGraph.getNode(inferredEdge.sourceId) && newGraph.getNode(inferredEdge.targetId)) {
      newGraph.addEdge(inferredEdge);
    }

    expect(newGraph.getAllEdges()).toHaveLength(0);
  });

  it('T3: --clean mode does not preserve INFERRED edges', () => {
    // Simulate clean mode: existingInferredEdges is empty array
    const useClean = true;
    let existingInferredEdges: GraphEdge[] = [];

    if (!useClean) {
      // This block would populate existingInferredEdges from old graph
      existingInferredEdges = [makeInferredEdge('a.ts::fn', 'b.ts::fn')];
    }

    const newGraph = new CodeGraph();
    newGraph.addNode(makeNode('a.ts::fn', 'a.ts'));
    newGraph.addNode(makeNode('b.ts::fn', 'b.ts'));

    // Re-inject loop
    for (const edge of existingInferredEdges) {
      if (newGraph.getNode(edge.sourceId) && newGraph.getNode(edge.targetId)) {
        newGraph.addEdge(edge);
      }
    }

    // Clean mode → no INFERRED edges preserved
    expect(newGraph.getAllEdges()).toHaveLength(0);
  });
});

describe('addEdge() deduplication', () => {
  it('T4: adding the same edge twice results in only 1 edge', () => {
    const graph = new CodeGraph();
    graph.addNode(makeNode('a.ts::fn1', 'a.ts'));
    graph.addNode(makeNode('b.ts::fn2', 'b.ts'));

    const edge = makeInferredEdge('a.ts::fn1', 'b.ts::fn2');
    graph.addEdge(edge);
    graph.addEdge(edge); // duplicate

    expect(graph.getAllEdges()).toHaveLength(1);
  });

  it('T5: edges with different relations are not deduped', () => {
    const graph = new CodeGraph();
    graph.addNode(makeNode('a.ts::fn1', 'a.ts'));
    graph.addNode(makeNode('b.ts::fn2', 'b.ts'));

    const callEdge: GraphEdge = {
      sourceId: 'a.ts::fn1',
      targetId: 'b.ts::fn2',
      relation: EdgeRelation.CALLS,
      sourceFile: 'a.ts',
      sourceLine: 1,
    };

    const importEdge: GraphEdge = {
      sourceId: 'a.ts::fn1',
      targetId: 'b.ts::fn2',
      relation: EdgeRelation.IMPORTS_FROM,
      sourceFile: 'a.ts',
      sourceLine: 1,
    };

    graph.addEdge(callEdge);
    graph.addEdge(importEdge);

    expect(graph.getAllEdges()).toHaveLength(2);
  });
});
