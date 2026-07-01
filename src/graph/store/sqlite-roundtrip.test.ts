import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteManager } from './sqlite-manager.js';
import { SqliteGraphRepository } from './sqlite-repository.js';

/**
 * Field manifest: ALL fields that MUST survive the SQLite round-trip.
 * When adding a new column to the `nodes` table, ADD IT HERE.
 * If you forget, the schema freshness test will remind you.
 */
export const PERSISTED_FIELDS = [
  'id',
  'name',
  'type',
  'semantic',
  'filePath',
  'createdAt',
  'updatedAt'
] as const;

// Helper to convert snake_case to camelCase
// @para-doc [#csa-sqlite-roundtrip-guard]
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

describe('SQLite Round-trip Field Integrity', () => {
  let manager: SqliteManager;
  let repo: SqliteGraphRepository;

  beforeEach(() => {
    // Use :memory: database to isolate test runs on a real SQLite engine
    manager = new SqliteManager('roundtrip-test', ':memory:');
    manager.initSchema();
    repo = new SqliteGraphRepository(manager);
  });

  afterEach(() => {
    manager.close();
  });

  it('should preserve ALL persisted fields through insertNode -> getAllNodes', () => {
    const input = {
      id: 'src/auth.ts::login',
      name: 'login',
      type: 'function',
      semantic: { summary: 'Authenticates user', complexity: 'medium' },
      filePath: 'src/auth.ts',
      createdAt: 1000,
      updatedAt: 2000
    };

    repo.insertNode(input);
    const nodes = Array.from(repo.getAllNodes());
    expect(nodes.length).toBe(1);
    
    const output = nodes[0];
    
    // Assert every persisted field individually for precise failure messages
    for (const field of PERSISTED_FIELDS) {
      expect(output[field]).toEqual(input[field]);
    }
  });

  it('should preserve fields through SqliteManager.persistGraph', () => {
    const nodeInput = {
      id: 'src/utils.ts::formatDate',
      name: 'formatDate',
      type: 'function',
      semantic: { summary: 'Formats date objects', complexity: 'low' },
      filePath: 'src/utils.ts',
      createdAt: 3000,
      updatedAt: 4000
    };

    const edgeInput = {
      sourceId: 'src/auth.ts::login',
      targetId: 'src/utils.ts::formatDate',
      relation: 'CALLS',
      sourceFile: 'src/auth.ts',
      sourceLine: 12
    };

    // Need to insert parent node first to avoid Foreign Key constraint violation
    const parentNode = {
      id: 'src/auth.ts::login',
      name: 'login',
      type: 'function',
      semantic: null,
      filePath: 'src/auth.ts',
      createdAt: 1000,
      updatedAt: 2000
    };

    manager.persistGraph([parentNode, nodeInput], [edgeInput]);

    const nodes = Array.from(repo.getAllNodes());
    // Find our target node
    const output = nodes.find(n => n.id === nodeInput.id);
    expect(output).toBeDefined();

    for (const field of PERSISTED_FIELDS) {
      expect(output![field]).toEqual(nodeInput[field]);
    }
  });

  it('should handle null/undefined fields safely', () => {
    const input = {
      id: 'src/config.ts',
      name: 'config',
      type: 'file',
      semantic: undefined, // Will be stored as null, should map back to undefined
      filePath: undefined, // Will be stored as null, maps back to null
      createdAt: 5000,
      updatedAt: 6000
    };

    repo.insertNode(input);
    const nodes = Array.from(repo.getAllNodes());
    expect(nodes.length).toBe(1);
    
    const output = nodes[0];
    
    expect(output.id).toBe(input.id);
    expect(output.name).toBe(input.name);
    expect(output.type).toBe(input.type);
    expect(output.semantic).toBeUndefined();
    expect(output.filePath).toBeNull();
    expect(output.createdAt).toBe(input.createdAt);
    expect(output.updatedAt).toBe(input.updatedAt);
  });

  it('should map snake_case file_path and other formats to camelCase', () => {
    const rawJsonlNode = {
      id: 'src/db.ts::connect',
      name: 'connect',
      type: 'function',
      semantic: { summary: 'DB Connection' },
      file_path: 'src/db.ts', // snake_case key from JSONL format
      created_at: 7000,
      updated_at: 8000
    };

    repo.insertNode(rawJsonlNode);
    const nodes = Array.from(repo.getAllNodes());
    const output = nodes[0];

    expect(output.id).toBe(rawJsonlNode.id);
    expect(output.filePath).toBe(rawJsonlNode.file_path);
    expect(output.createdAt).toBe(rawJsonlNode.created_at);
    expect(output.updatedAt).toBe(rawJsonlNode.updated_at);
  });

  it('should match nodes table schema columns against PERSISTED_FIELDS manifest', () => {
    const db = manager.getConnection();
    const columnsInfo = db.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>;
    
    // Map columns from snake_case database schema to camelCase typescript model keys
    const schemaFields = columnsInfo.map(col => toCamelCase(col.name));
    
    // Check that every column in the SQLite schema is defined in the manifest
    for (const schemaField of schemaFields) {
      expect(PERSISTED_FIELDS).toContain(schemaField);
    }

    // Double check manifest length matches schema columns length
    expect(PERSISTED_FIELDS.length).toBe(schemaFields.length);
  });
});
