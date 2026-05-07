import { describe, it, expect } from 'vitest';
import { CodeGraph } from '../src/graph/code-graph.js';
import { NodeType, EdgeRelation, ExportType } from '../src/graph/models.js';

function makeNode(id: string) {
  return {
    id, type: NodeType.FUNCTION, name: id, filePath: 'test.ts',
    startLine: 1, endLine: 5, exportType: ExportType.NAMED, signature: 'fn'
  };
}

describe('Topology Calculator', () => {
  it('AC4: fanIn and fanOut correctly count directed edges', () => {
    const graph = new CodeGraph();
    // A -> B -> C
    // A -> C
    graph.addNode(makeNode('A'));
    graph.addNode(makeNode('B'));
    graph.addNode(makeNode('C'));
    
    graph.addEdge({ sourceId: 'A', targetId: 'B', relation: EdgeRelation.CALLS, sourceFile: 'test.ts', sourceLine: 1 });
    graph.addEdge({ sourceId: 'B', targetId: 'C', relation: EdgeRelation.CALLS, sourceFile: 'test.ts', sourceLine: 2 });
    graph.addEdge({ sourceId: 'A', targetId: 'C', relation: EdgeRelation.CALLS, sourceFile: 'test.ts', sourceLine: 3 });

    expect(graph.fanOut('A')).toBe(2); // Calls B, C
    expect(graph.fanIn('A')).toBe(0);

    expect(graph.fanIn('C')).toBe(2);  // Called by A, B
    expect(graph.fanOut('C')).toBe(0);

    expect(graph.fanIn('B')).toBe(1);  // Called by A
    expect(graph.fanOut('B')).toBe(1); // Calls C
  });

  it('AC3: detectGodNodes finds nodes with degree >= threshold', () => {
    const graph = new CodeGraph();
    graph.addNode(makeNode('GodNode'));
    graph.addNode(makeNode('SmallNode'));
    for (let i = 1; i <= 6; i++) {
      graph.addNode(makeNode(`Node${i}`));
      // GodNode calls 6 other nodes (fanOut = 6, degree = 6)
      graph.addEdge({ sourceId: 'GodNode', targetId: `Node${i}`, relation: EdgeRelation.CALLS, sourceFile: 'test.ts', sourceLine: 1 });
    }
    // SmallNode calls 2 other nodes (fanOut = 2, degree = 2)
    graph.addEdge({ sourceId: 'SmallNode', targetId: 'Node1', relation: EdgeRelation.CALLS, sourceFile: 'test.ts', sourceLine: 1 });
    graph.addEdge({ sourceId: 'SmallNode', targetId: 'Node2', relation: EdgeRelation.CALLS, sourceFile: 'test.ts', sourceLine: 1 });

    const gods = graph.detectGodNodes(3);
    expect(gods.length).toBe(3);
    expect(gods[0].id).toBe('GodNode');
    expect(gods[0].degree).toBe(6);
    // Next highest is SmallNode, Node1, Node2 (degree 2)
    expect(gods[1].degree).toBe(2);
  });
});
