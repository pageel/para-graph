import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CurationWorker } from '../../src/graph/curation-worker.js';
import { ProjectGraph } from '../../src/graph/store/ProjectGraph.js';
import { GraphStore } from '../../src/graph/store/GraphStore.js';
import * as fs from 'node:fs';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs') as any;
  return {
    ...actual,
    writeFileSync: vi.fn(),
    renameSync: vi.fn()
  };
});

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
    
    graph.pushMemoryEvent({ id: 'e1', sessionId: 's1', kind: 'observation', content: 'test', timestamp: '' });
    
    const stats = { nodes: 10, edges: 5, unresolved: 2 };
    
    const spy = vi.spyOn(GraphStore, 'insertSnapshot').mockImplementation(() => ({}) as any);
    
    CurationWorker.curate(workspaceRoot, graph, stats);
    
    expect(spy).toHaveBeenCalledWith(workspaceRoot, 'test-project', 2);
  });

  it('should write memory_summary.md atomically to project directory', () => {
    const writeSpy = vi.mocked(fs.writeFileSync);
    const renameSpy = vi.mocked(fs.renameSync);

    const graph = new ProjectGraph('test-project');
    const workspaceRoot = '/mock/root';
    
    // Add multiple events to force a summary slice
    for (let i = 0; i < 50; i++) {
      graph.pushMemoryEvent({ 
        id: `e${i}`, sessionId: 's1', kind: 'observation', 
        content: `test event ${i}`, timestamp: '' 
      });
    }

    CurationWorker.curate(workspaceRoot, graph);
    
    const slices = graph.getMemorySlices();
    expect(slices.length).toBeGreaterThan(0);

    const projectDir = '/mock/root/Projects/test-project';
    const tmpPath = `${projectDir}/memory_summary.md.tmp`;
    const finalPath = `${projectDir}/memory_summary.md`;

    // Verify it writes to .tmp first, then renames
    expect(writeSpy).toHaveBeenCalledWith(tmpPath, expect.stringContaining('## Context Window Summary'));
    expect(renameSpy).toHaveBeenCalledWith(tmpPath, finalPath);
  });
});
