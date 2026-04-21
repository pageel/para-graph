import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectGraph } from '../src/graph/store/ProjectGraph.js';
import type { GraphNode, GraphEdge } from '../src/graph/models.js';
import { NodeType, EdgeRelation, ExportType } from '../src/graph/models.js';

describe('ProjectGraph Query Engine', () => {
  let graph: ProjectGraph;

  beforeEach(() => {
    graph = new ProjectGraph('test-project');
    
    // Add nodes
    const nodeA: GraphNode = {
      id: 'src/A.ts::A', type: NodeType.CLASS, name: 'A',
      filePath: 'src/A.ts', startLine: 1, endLine: 10, exportType: ExportType.NAMED, signature: 'class A {}'
    };
    const nodeB: GraphNode = {
      id: 'src/B.ts::B', type: NodeType.CLASS, name: 'B',
      filePath: 'src/B.ts', startLine: 1, endLine: 10, exportType: ExportType.NAMED, signature: 'class B {}',
      semantic: {
        summary: 'B class', complexity: 'low', domainConcepts: ['test'], enrichedAt: 'time', enrichedBy: 'agent'
      }
    };
    graph.addNode(nodeA);
    graph.addNode(nodeB);

    // Add edge
    const edge: GraphEdge = {
      sourceId: 'src/A.ts::A', targetId: 'src/B.ts::B', relation: EdgeRelation.CALLS, sourceFile: 'src/A.ts', sourceLine: 5
    };
    graph.addEdge(edge);
  });

  it('should get node by id', () => {
    expect(graph.getNode('src/A.ts::A')).toBeDefined();
    expect(graph.getNode('non-existent')).toBeUndefined();
  });

  it('should search by name', () => {
    const result = graph.search('a');
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].name).toBe('A');
  });

  it('should search by concept', () => {
    const result = graph.search('test');
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].name).toBe('B');
  });

  it('should filter by node type', () => {
    const result = graph.search('b', NodeType.CLASS);
    expect(result.nodes.length).toBe(1);
    
    const emptyResult = graph.search('b', NodeType.FUNCTION);
    expect(emptyResult.nodes.length).toBe(0);
  });

  it('should get connected edges', () => {
    const edgesA = graph.getConnectedEdges('src/A.ts::A');
    expect(edgesA.length).toBe(1);
    expect(edgesA[0].targetId).toBe('src/B.ts::B');

    const edgesB = graph.getConnectedEdges('src/B.ts::B');
    expect(edgesB.length).toBe(1);
    expect(edgesB[0].sourceId).toBe('src/A.ts::A');
  });
});
