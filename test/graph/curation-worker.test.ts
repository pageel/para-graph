import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CurationWorker } from '../../src/graph/curation-worker.js';
import { ProjectGraph } from '../../src/graph/store/ProjectGraph.js';
import { GraphStore } from '../../src/graph/store/GraphStore.js';

describe('CurationWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call GraphStore.insertSnapshot after curation if stats provided', () => {
    const graph = new ProjectGraph('test-project');
    const workspaceRoot = '/mock/root';
    
    // Add mock events
    graph.pushMemoryEvent({ id: 'e1', sessionId: 's1', kind: 'observation', content: 'test', timestamp: '' });
    
    const stats = { nodes: 10, edges: 5, unresolved: 2 };
    
    const spy = vi.spyOn(GraphStore, 'insertSnapshot').mockImplementation(() => ({}) as any);
    
    CurationWorker.curate(workspaceRoot, graph, stats);
    
    expect(spy).toHaveBeenCalledWith(workspaceRoot, 'test-project', 2);
  });
});

