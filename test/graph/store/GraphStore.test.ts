import { describe, it, expect, vi } from 'vitest';
import { GraphStore } from '../../../src/graph/store/GraphStore.js';
import * as fs from 'node:fs';

vi.mock('better-sqlite3', () => {
  return {
    default: class MockDatabase {
      constructor(public path: string) {}
      close() {}
      exec() {}
      prepare(sql: string) {
        return {
          run: vi.fn(),
          iterate: vi.fn().mockReturnValue([]),
          get: vi.fn()
        };
      }
    }
  };
});

describe('GraphStore Refactoring', () => {
  it('should initialize SqliteGraphRepository when loading a graph', () => {
    // Clear cache
    GraphStore.flushGraph('test-refactor');
    
    // Let it naturally not find the files
    
    const graph = GraphStore.getGraph(process.cwd(), 'test-refactor');
    
    // It should have instantiated a repository
    expect(graph.repository).toBeDefined();
    
    vi.restoreAllMocks();
  });
});
