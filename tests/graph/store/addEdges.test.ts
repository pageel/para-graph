/**
 * Unit tests for ProjectGraph.addEdges() and GraphStore.addEdges()/saveRelations()
 *
 * P7: Agentic Bash Edge Resolution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectGraph } from '../../../src/graph/store/ProjectGraph.js';
import { GraphStore } from '../../../src/graph/store/GraphStore.js';
import type { GraphNode, GraphEdge } from '../../../src/graph/models.js';
import { NodeType, ExportType, EdgeRelation } from '../../../src/graph/models.js';

// --- Helpers ---

function makeNode(id: string, name: string): GraphNode {
  return {
    id,
    type: NodeType.FUNCTION,
    name,
    filePath: id.split('::')[0],
    startLine: 1,
    endLine: 10,
    exportType: ExportType.NAMED,
    signature: `function ${name}()`,
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

// --- ProjectGraph.addEdges ---

describe('ProjectGraph.addEdges', () => {
  let graph: ProjectGraph;

  beforeEach(() => {
    graph = new ProjectGraph('test-project');
    graph.addNode(makeNode('a.sh::funcA', 'funcA'));
    graph.addNode(makeNode('b.sh::funcB', 'funcB'));
    graph.addNode(makeNode('c.sh::funcC', 'funcC'));
  });

  it('should add valid edges and return correct count', () => {
    const edges = [
      makeEdge('a.sh::funcA', 'b.sh::funcB'),
      makeEdge('b.sh::funcB', 'c.sh::funcC'),
    ];

    const result = graph.addEdges(edges);

    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(graph.getAllEdges()).toHaveLength(2);
  });

  it('should reject edges when source node does not exist', () => {
    const edges = [makeEdge('nonexistent::foo', 'b.sh::funcB')];

    const result = graph.addEdges(edges);

    expect(result.added).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('sourceId');
    expect(result.errors[0].reason).toContain('not found');
  });

  it('should reject edges when target node does not exist', () => {
    const edges = [makeEdge('a.sh::funcA', 'nonexistent::bar')];

    const result = graph.addEdges(edges);

    expect(result.added).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('targetId');
  });

  it('should reject edges when both nodes do not exist', () => {
    const edges = [makeEdge('x::x', 'y::y')];

    const result = graph.addEdges(edges);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('sourceId');
    expect(result.errors[0].reason).toContain('targetId');
  });

  it('should skip duplicate edges (same sourceId + targetId + relation)', () => {
    const edge = makeEdge('a.sh::funcA', 'b.sh::funcB');

    // Add first time
    graph.addEdges([edge]);
    // Add again — should skip
    const result = graph.addEdges([edge]);

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(graph.getAllEdges()).toHaveLength(1);
  });

  it('should allow same source+target pair with different relation types', () => {
    const callEdge = makeEdge('a.sh::funcA', 'b.sh::funcB', EdgeRelation.CALLS);
    const importEdge = makeEdge('a.sh::funcA', 'b.sh::funcB', EdgeRelation.IMPORTS_FROM);

    const result = graph.addEdges([callEdge, importEdge]);

    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(graph.getAllEdges()).toHaveLength(2);
  });

  it('should handle mixed valid, invalid, and duplicate edges', () => {
    // Pre-seed one edge
    graph.addEdges([makeEdge('a.sh::funcA', 'b.sh::funcB')]);

    const edges = [
      makeEdge('a.sh::funcA', 'b.sh::funcB'),         // duplicate → skip
      makeEdge('b.sh::funcB', 'c.sh::funcC'),         // valid → add
      makeEdge('nonexistent::x', 'c.sh::funcC'),      // invalid → error
    ];

    const result = graph.addEdges(edges);

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(graph.getAllEdges()).toHaveLength(2);
  });
});

// --- GraphStore.saveRelations ---

describe('GraphStore.saveRelations', () => {
  it('should write edges to relations.jsonl', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    // Use a temp directory inside the repo (cleaned up after)
    const tmpDir = path.join(process.cwd(), '.test-tmp');
    const graphDir = path.join(tmpDir, 'Projects', 'test-project', '.beads', 'graph');
    fs.mkdirSync(graphDir, { recursive: true });

    const edges = [
      makeEdge('a.sh::funcA', 'b.sh::funcB'),
      makeEdge('b.sh::funcB', 'c.sh::funcC'),
    ];

    GraphStore.saveRelations(tmpDir, 'test-project', edges);

    const relationsPath = path.join(graphDir, 'relations.jsonl');
    expect(fs.existsSync(relationsPath)).toBe(true);

    const content = fs.readFileSync(relationsPath, 'utf-8').trim();
    const lines = content.split('\n');
    expect(lines).toHaveLength(2);

    const parsed0 = JSON.parse(lines[0]);
    expect(parsed0.sourceId).toBe('a.sh::funcA');
    expect(parsed0.targetId).toBe('b.sh::funcB');
    expect(parsed0.relation).toBe('CALLS');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
