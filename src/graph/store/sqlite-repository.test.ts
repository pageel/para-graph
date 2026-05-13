import { describe, it, expect, vi } from 'vitest';
import { SqliteGraphRepository } from './sqlite-repository.js';
import { SqliteManager } from './sqlite-manager.js';

// Deep mock better-sqlite3 to verify JSON serialization
const mockRun = vi.fn();
const mockIterate = vi.fn();
const mockGet = vi.fn();

vi.mock('better-sqlite3', () => {
  return {
    default: class MockDatabase {
      constructor(public path: string) {}
      close() {}
      exec() {}
      prepare(sql: string) {
        return {
          run: mockRun,
          iterate: mockIterate,
          get: mockGet
        };
      }
    }
  };
});

describe('SqliteGraphRepository', () => {
  it('should serialize semantic field to JSON on insert', () => {
    const manager = new SqliteManager('test');
    const repo = new SqliteGraphRepository(manager);
    
    const node = {
      id: 'n1',
      name: 'Test Node',
      type: 'test',
      semantic: { summary: 'A summary', complexity: 'low' },
      createdAt: 1000,
      updatedAt: 1000
    };
    
    repo.insertNode(node);
    
    // The run function should be called with stringified semantic
    expect(mockRun).toHaveBeenCalledWith(
      'n1',
      'Test Node',
      'test',
      JSON.stringify(node.semantic),
      1000,
      1000
    );
  });

  it('should deserialize semantic field from JSON on select', () => {
    const manager = new SqliteManager('test');
    const repo = new SqliteGraphRepository(manager);
    
    // Mock iterate to yield a row with JSON string
    mockIterate.mockReturnValueOnce([{
      id: 'n1',
      name: 'Test Node',
      type: 'test',
      semantic: '{"summary":"A summary","complexity":"low"}',
      created_at: 1000,
      updated_at: 1000
    }]);

    const iter = repo.getAllNodes();
    const nodes = Array.from(iter) as any[];
    
    expect(nodes.length).toBe(1);
    expect(nodes[0].semantic).toEqual({ summary: 'A summary', complexity: 'low' });
  });

  it('should delegate getRelatedSlices to repository with an IN clause', () => {
    const manager = new SqliteManager('test');
    const repo = new SqliteGraphRepository(manager);
    
    // Clear mock calls
    mockIterate.mockClear();
    mockIterate.mockReturnValueOnce([{
      id: 's1',
      topic: 'Test Topic',
      summary: 'A test slice',
      node_ids: '["n1", "n2"]',
      event_ids: '["e1"]',
      created_at: 1000
    }]);

    const iter = repo.getRelatedSlices(['n1', 'n3']);
    const slices = Array.from(iter) as any[];
    
    expect(slices.length).toBe(1);
    expect(slices[0].id).toBe('s1');
    expect(slices[0].nodeIds).toEqual(['n1', 'n2']);
  });
});
