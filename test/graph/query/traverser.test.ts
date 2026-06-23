import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectGraph } from '../../../src/graph/store/ProjectGraph.js';
import { NodeType, EdgeRelation, ExportType } from '../../../src/graph/models.js';
import type { GraphNode, GraphEdge } from '../../../src/graph/models.js';
import { BeamSearchTraverser } from '../../../src/graph/query/traverser.js';

// Helper to create test nodes
function makeNode(id: string, name: string, filePath: string, opts?: Partial<GraphNode>): GraphNode {
  return {
    id,
    type: NodeType.FUNCTION,
    name,
    filePath,
    startLine: 1,
    endLine: 10,
    exportType: ExportType.NAMED,
    signature: `function ${name}() {`,
    ...opts,
  };
}

// Helper to create test edges
function makeEdge(sourceId: string, targetId: string, relation: EdgeRelation, confidence = 'EXTRACTED', sourceLine = 1): GraphEdge {
  return {
    sourceId,
    targetId,
    relation,
    sourceFile: sourceId.split('::')[0] || sourceId,
    sourceLine,
    confidence: confidence as any,
  };
}

describe('BeamSearchTraverser (TDD RED)', () => {
  let graph: ProjectGraph;
  let traverser: BeamSearchTraverser;

  beforeEach(() => {
    graph = new ProjectGraph('test-project');
    traverser = new BeamSearchTraverser((graph as any).astStore);
  });

  it('Core Beam Search: should traverse based on heuristic scoring and respect beamWidth', () => {
    // A calls B (EXTRACTED), B calls C (EXTRACTED)
    // A calls D (AMBIGUOUS), B calls E (EXTRACTED)
    graph.addNode(makeNode('a.ts::A', 'A', 'a.ts', { semantic: { domainConcepts: ['auth'] } }));
    graph.addNode(makeNode('b.ts::B', 'B', 'b.ts', { semantic: { domainConcepts: ['auth', 'crypto'] } }));
    graph.addNode(makeNode('c.ts::C', 'C', 'c.ts', { semantic: { domainConcepts: ['database'] } }));
    graph.addNode(makeNode('d.ts::D', 'D', 'd.ts', { semantic: { domainConcepts: ['ui'] } }));
    graph.addNode(makeNode('e.ts::E', 'E', 'e.ts', { semantic: { domainConcepts: ['crypto'] } }));

    graph.addEdge(makeEdge('a.ts::A', 'b.ts::B', EdgeRelation.CALLS, 'EXTRACTED'));
    graph.addEdge(makeEdge('b.ts::B', 'c.ts::C', EdgeRelation.CALLS, 'EXTRACTED'));
    graph.addEdge(makeEdge('a.ts::A', 'd.ts::D', EdgeRelation.CALLS, 'AMBIGUOUS'));
    graph.addEdge(makeEdge('b.ts::B', 'e.ts::E', EdgeRelation.CALLS, 'EXTRACTED'));

    const config = {
      maxDepth: 3,
      topologyBarrierThreshold: 10,
      beamWidth: 2, // Limit active frontier
      utilityPatterns: []
    };

    const result = traverser.traverseBeam('a.ts::A', config);
    const nodeNames = result.nodes.map(n => n.name);

    expect(nodeNames).toContain('B');
    // Since B has high score and beamWidth=2, C and E (successors of B) should be explored.
    // D should be visited or discarded depending on the beam width.
    expect(nodeNames).toContain('E'); // E has concept matching B ('crypto') and EXTRACTED edge.
    expect(nodeNames).not.toContain('D'); // D has AMBIGUOUS edge and low score, should be pruned.
  });

  it('Topology Barrier: should stop deep traversal when hitting God Nodes', () => {
    // A calls B. B has high fan-in (God Node). B calls C.
    // Traversal should not expand B's children because of topology barrier.
    graph.addNode(makeNode('a.ts::A', 'A', 'a.ts'));
    graph.addNode(makeNode('b.ts::B', 'B', 'b.ts'));
    graph.addNode(makeNode('c.ts::C', 'C', 'c.ts'));
    
    // Add extra nodes calling B to increase fan_in of B to 3
    graph.addNode(makeNode('x1.ts::X1', 'X1', 'x1.ts'));
    graph.addNode(makeNode('x2.ts::X2', 'X2', 'x2.ts'));
    graph.addNode(makeNode('x3.ts::X3', 'X3', 'x3.ts'));

    graph.addEdge(makeEdge('a.ts::A', 'b.ts::B', EdgeRelation.CALLS));
    graph.addEdge(makeEdge('b.ts::B', 'c.ts::C', EdgeRelation.CALLS));
    graph.addEdge(makeEdge('x1.ts::X1', 'b.ts::B', EdgeRelation.CALLS));
    graph.addEdge(makeEdge('x2.ts::X2', 'b.ts::B', EdgeRelation.CALLS));
    graph.addEdge(makeEdge('x3.ts::X3', 'b.ts::B', EdgeRelation.CALLS));

    const config = {
      maxDepth: 3,
      topologyBarrierThreshold: 2, // Barrier triggers if fan_in > 2
      beamWidth: 10,
      utilityPatterns: []
    };

    const result = traverser.traverseBeam('a.ts::A', config);
    const nodeNames = result.nodes.map(n => n.name);

    expect(nodeNames).toContain('B');
    expect(nodeNames).not.toContain('C'); // B's children (C) are pruned because B triggers topology barrier.
  });

  it('ACORN 2-hop Leap: should bypass Utility Nodes and grab their neighbors', () => {
    // A calls B (utility helper). B calls C (business logic).
    // B matches utility patterns.
    // Traversal from A should return C, but NOT B in the nodes list.
    graph.addNode(makeNode('a.ts::A', 'A', 'a.ts'));
    graph.addNode(makeNode('utils/helper.ts::B', 'B', 'utils/helper.ts'));
    graph.addNode(makeNode('services/business.ts::C', 'C', 'services/business.ts'));

    graph.addEdge(makeEdge('a.ts::A', 'utils/helper.ts::B', EdgeRelation.CALLS));
    graph.addEdge(makeEdge('utils/helper.ts::B', 'services/business.ts::C', EdgeRelation.CALLS));

    const config = {
      maxDepth: 3,
      topologyBarrierThreshold: 10,
      beamWidth: 5,
      utilityPatterns: ['**/utils/**'] // B matches this pattern
    };

    const result = traverser.traverseBeam('a.ts::A', config);
    const nodeNames = result.nodes.map(n => n.name);

    expect(nodeNames).not.toContain('B'); // B is a utility node, should be discarded.
    expect(nodeNames).toContain('C'); // C is B's neighbor, should be leaped to.
  });

  it('Performance Gate: should complete 100-node graph traversal under 5ms', () => {
    // Build a chain of 100 nodes
    for (let i = 0; i < 100; i++) {
      graph.addNode(makeNode(`file.ts::N${i}`, `N${i}`, 'file.ts'));
      if (i > 0) {
        graph.addEdge(makeEdge(`file.ts::N${i-1}`, `file.ts::N${i}`, EdgeRelation.CALLS));
      }
    }

    const config = {
      maxDepth: 5,
      topologyBarrierThreshold: 1000,
      beamWidth: 10,
      utilityPatterns: []
    };

    const start = performance.now();
    const result = traverser.traverseBeam('file.ts::N0', config);
    const duration = performance.now() - start;

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(5); // Must run in < 5ms
  });
});
