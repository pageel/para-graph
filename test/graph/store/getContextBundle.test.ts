import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectGraph } from '../../../src/graph/store/ProjectGraph.js';
import type { GraphNode, GraphEdge } from '../../../src/graph/models.js';
import { NodeType, ExportType, EdgeRelation } from '../../../src/graph/models.js';

function makeNode(id: string, name: string, filePath: string = 'src/helper.ts'): GraphNode {
  return {
    id,
    type: NodeType.FUNCTION,
    name,
    filePath,
    startLine: 1,
    endLine: 10,
    exportType: ExportType.NAMED,
    signature: `export function ${name}()`,
  };
}

function makeEdge(sourceId: string, targetId: string, relation: EdgeRelation = EdgeRelation.CALLS): GraphEdge {
  return {
    sourceId,
    targetId,
    relation,
    sourceFile: sourceId.split('::')[0],
    sourceLine: 1,
  };
}

describe('ProjectGraph.getContextBundle (Multi-seed)', () => {
  let graph: ProjectGraph;

  beforeEach(() => {
    graph = new ProjectGraph('test-project');
  });

  it('should support backward compatibility for a single string nodeId', () => {
    graph.addNode(makeNode('src/helper.ts::funcA', 'funcA'));
    graph.addNode(makeNode('src/helper.ts::funcB', 'funcB'));
    graph.addEdge(makeEdge('src/helper.ts::funcA', 'src/helper.ts::funcB'));

    const bundle = graph.getContextBundle('src/helper.ts::funcA', process.cwd(), true);
    expect(bundle.target.id).toBe('src/helper.ts::funcA');
    expect(bundle.callees).toHaveLength(1);
    expect(bundle.callees[0].id).toBe('src/helper.ts::funcB');
  });

  it('should retrieve unified context for multiple seed nodeIds without duplicates', () => {
    // Setup seed nodes
    graph.addNode(makeNode('src/a.ts::funcA', 'funcA', 'src/a.ts'));
    graph.addNode(makeNode('src/b.ts::funcB', 'funcB', 'src/b.ts'));

    // Setup callers & callees for A
    graph.addNode(makeNode('src/caller1.ts::c1', 'c1', 'src/caller1.ts'));
    graph.addNode(makeNode('src/callee1.ts::e1', 'e1', 'src/callee1.ts'));
    graph.addEdge(makeEdge('src/caller1.ts::c1', 'src/a.ts::funcA'));
    graph.addEdge(makeEdge('src/a.ts::funcA', 'src/callee1.ts::e1'));

    // Setup callers & callees for B (c1 is shared caller)
    graph.addNode(makeNode('src/callee2.ts::e2', 'e2', 'src/callee2.ts'));
    graph.addEdge(makeEdge('src/caller1.ts::c1', 'src/b.ts::funcB')); // Shared caller
    graph.addEdge(makeEdge('src/b.ts::funcB', 'src/callee2.ts::e2'));

    // Retrieve bundle
    const bundle = graph.getContextBundle(['src/a.ts::funcA', 'src/b.ts::funcB'], process.cwd(), true);

    // Target should represent the first seed node
    expect(bundle.target.id).toBe('src/a.ts::funcA');

    // Callers should be deduplicated (only one c1)
    expect(bundle.callers).toHaveLength(1);
    expect(bundle.callers.map(c => c.id)).toContain('src/caller1.ts::c1');

    // Callees should be combined from both A and B
    expect(bundle.callees).toHaveLength(2);
    expect(bundle.callees.map(c => c.id)).toContain('src/callee1.ts::e1');
    expect(bundle.callees.map(c => c.id)).toContain('src/callee2.ts::e2');
  });

  it('should enforce per-seed limit of 20 nodes and global limit of 50 nodes', () => {
    // 1. Setup seed A and 25 callers to trigger per-seed limit (20)
    graph.addNode(makeNode('src/a.ts::funcA', 'funcA', 'src/a.ts'));
    for (let i = 0; i < 25; i++) {
      const callerId = `src/caller_a_${i}.ts::c${i}`;
      graph.addNode(makeNode(callerId, `c${i}`, `src/caller_a_${i}.ts`));
      graph.addEdge(makeEdge(callerId, 'src/a.ts::funcA'));
    }

    // 2. Setup seed B and 35 callers to trigger global limit (50)
    graph.addNode(makeNode('src/b.ts::funcB', 'funcB', 'src/b.ts'));
    for (let i = 0; i < 35; i++) {
      const callerId = `src/caller_b_${i}.ts::cb${i}`;
      graph.addNode(makeNode(callerId, `cb${i}`, `src/caller_b_${i}.ts`));
      graph.addEdge(makeEdge(callerId, 'src/b.ts::funcB'));
    }

    // Retrieve bundle
    const bundle = graph.getContextBundle(['src/a.ts::funcA', 'src/b.ts::funcB'], process.cwd(), true);

    // Total callers + callees returned should be capped globally
    // We expect:
    // Seed A callers capped at 20.
    // Seed B callers capped at 20.
    // Total callers from A and B combined is 40 (since 20 + 20 = 40 <= 50, so no global cap hit yet, but individual caps were applied).
    expect(bundle.callers.length).toBe(40);

    // 3. Now verify global cap by adding seed C with another 30 callers
    graph.addNode(makeNode('src/c.ts::funcC', 'funcC', 'src/c.ts'));
    for (let i = 0; i < 30; i++) {
      const callerId = `src/caller_c_${i}.ts::cc${i}`;
      graph.addNode(makeNode(callerId, `cc${i}`, `src/caller_c_${i}.ts`));
      graph.addEdge(makeEdge(callerId, 'src/c.ts::funcC'));
    }

    const largeBundle = graph.getContextBundle(
      ['src/a.ts::funcA', 'src/b.ts::funcB', 'src/c.ts::funcC'],
      process.cwd(),
      true
    );

    // Global cap of 50 must be enforced (combined callers should be pruned to 50 max)
    expect(largeBundle.callers.length).toBe(50);
  });
});
