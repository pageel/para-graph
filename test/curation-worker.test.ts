import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { join } from 'node:path';
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { CurationWorker } from '../src/graph/curation-worker.js';
import { ProjectGraph } from '../src/graph/store/ProjectGraph.js';

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
    if (existsSync(workspaceRoot)) {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Cleanup
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
  });
});
