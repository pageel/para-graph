import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { join } from 'node:path';
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CurationWorker } from '../src/graph/curation-worker.js';
import { ProjectGraph } from '../src/graph/store/ProjectGraph.js';
import { GraphStore } from '../src/graph/store/GraphStore.js';
import { EdgeRelation, NodeType } from '../src/graph/models.js';

describe('CurationWorker', () => {
  const workspaceRoot = join(__dirname, 'fixtures', 'curation-workspace');
  const projectName = 'test-project';
  const projectDir = join(workspaceRoot, 'Projects', projectName);
  const graphDir = join(projectDir, '.beads', 'graph');

  beforeEach(() => {
    // Setup workspace directory structure
    mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    GraphStore.flushGraph(projectName);
    if (existsSync(workspaceRoot)) {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Cleanup
    GraphStore.flushGraph(projectName);
    if (existsSync(workspaceRoot)) {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('curate should write memory-log.md to .beads/graph/ and not memory_summary.md to project root', () => {
    const graph = new ProjectGraph(projectName);
    // Add a mock event to trigger curation
    graph.pushMemoryEvent({
      id: 'event-1',
      kind: 'test',
      sessionId: 'test-session',
      content: 'test content',
      timestamp: new Date().toISOString(),
      weight: 1,
      metadata: {}
    });

    CurationWorker.curate(workspaceRoot, graph);

    // Verify correct location
    const expectedPath = join(graphDir, 'memory-log.md');
    expect(existsSync(expectedPath)).toBe(true);

    // Verify incorrect location
    const incorrectPath = join(projectDir, 'memory_summary.md');
    expect(existsSync(incorrectPath)).toBe(false);
    
    graph.close();
  });

  it('curate should delete legacy memory_summary.md if it exists', () => {
    const graph = new ProjectGraph(projectName);
    graph.pushMemoryEvent({
      id: 'event-2',
      kind: 'test',
      sessionId: 'test-session',
      content: 'test content',
      timestamp: new Date().toISOString(),
      weight: 1,
      metadata: {}
    });

    // Create a legacy file
    const legacyPath = join(projectDir, 'memory_summary.md');
    writeFileSync(legacyPath, 'legacy content');

    CurationWorker.curate(workspaceRoot, graph);

    // Verify it was deleted
    expect(existsSync(legacyPath)).toBe(false);
    
    graph.close();
  });

  it('ProjectGraph.getTopGodNodes should return correct sorted array', () => {
    const graph = new ProjectGraph(projectName);
    graph.addNode({ id: 'f1', name: 'f1', type: NodeType.FUNCTION, filePath: 'f1.ts', startLine: 1, endLine: 2, exportType: 'none' as any, signature: '' });
    graph.addNode({ id: 'f2', name: 'f2', type: NodeType.FUNCTION, filePath: 'f2.ts', startLine: 1, endLine: 2, exportType: 'none' as any, signature: '' });
    graph.addNode({ id: 'f3', name: 'f3', type: NodeType.FUNCTION, filePath: 'f3.ts', startLine: 1, endLine: 2, exportType: 'none' as any, signature: '' });
    
    // f1 -> f2, f3 -> f2, f2 -> f3
    graph.addEdge({ sourceId: 'f1', targetId: 'f2', relation: EdgeRelation.CALLS, sourceFile: 'f1.ts', sourceLine: 1 });
    graph.addEdge({ sourceId: 'f3', targetId: 'f2', relation: EdgeRelation.CALLS, sourceFile: 'f3.ts', sourceLine: 1 });
    graph.addEdge({ sourceId: 'f2', targetId: 'f3', relation: EdgeRelation.CALLS, sourceFile: 'f2.ts', sourceLine: 1 });

    const top = graph.getTopGodNodes(2);
    expect(top.length).toBe(2);
    expect(top[0].id).toBe('f2'); // fanIn: 2, fanOut: 1 => degree: 3
    expect(top[1].id).toBe('f3'); // fanIn: 1, fanOut: 1 => degree: 2
    
    graph.close();
  });

  it('curate should save god_nodes_cache via GraphStore', () => {
    const graph = GraphStore.getGraph(workspaceRoot, projectName);
    graph.pushMemoryEvent({
      id: 'event-cache',
      kind: 'test',
      sessionId: 'test-session',
      content: 'test content',
      timestamp: new Date().toISOString(),
      weight: 1,
      metadata: {}
    });
    graph.addNode({ id: 'f1', name: 'f1', type: NodeType.FUNCTION, filePath: 'f1.ts', startLine: 1, endLine: 2, exportType: 'none' as any, signature: '' });
    graph.addNode({ id: 'f2', name: 'f2', type: NodeType.FUNCTION, filePath: 'f2.ts', startLine: 1, endLine: 2, exportType: 'none' as any, signature: '' });
    graph.addNode({ id: 'f3', name: 'f3', type: NodeType.FUNCTION, filePath: 'f3.ts', startLine: 1, endLine: 2, exportType: 'none' as any, signature: '' });
    graph.addEdge({ sourceId: 'f1', targetId: 'f2', relation: EdgeRelation.CALLS, sourceFile: 'f1.ts', sourceLine: 1 });
    graph.addEdge({ sourceId: 'f3', targetId: 'f2', relation: EdgeRelation.CALLS, sourceFile: 'f3.ts', sourceLine: 1 });

    CurationWorker.curate(workspaceRoot, graph);

    // Verify cache was stored
    const cached = GraphStore.getCustomMetadata(workspaceRoot, projectName, 'god_nodes_cache');
    expect(cached).toBeDefined();
    expect(cached.length).toBeGreaterThan(0);
    expect(cached[0].id).toBe('f2');
    
    graph.close();
  });
});
