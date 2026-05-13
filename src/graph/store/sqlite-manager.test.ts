import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SqliteManager } from './sqlite-manager.js';
import fs from 'fs';
import path from 'path';

vi.mock('better-sqlite3', () => {
  return {
    default: class MockDatabase {
      constructor(public path: string) {
        if (path !== ':memory:') {
          fs.writeFileSync(path, '');
        }
      }
      close() {}
    }
  };
});

describe('SqliteManager', () => {
  const testDbPath = path.join(process.cwd(), '.beads', 'graph', 'test-graph.db');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should lazy load the database connection', () => {
    const manager = new SqliteManager('test-project', testDbPath);
    
    // DB file should not be created just by instantiating the manager
    expect(fs.existsSync(testDbPath)).toBe(false);

    // Call getConnection() should create/open the database
    const db = manager.getConnection();
    expect(db).toBeDefined();
    expect(fs.existsSync(testDbPath)).toBe(true);

    manager.close();
  });

  it('should return the same connection on subsequent calls', () => {
    const manager = new SqliteManager('test-project', testDbPath);
    const db1 = manager.getConnection();
    const db2 = manager.getConnection();
    
    expect(db1).toBe(db2);
    manager.close();
  });

  it('should resolve default path if no path is provided', () => {
    const manager = new SqliteManager('my-test-project');
    const defaultPath = path.join(process.cwd(), '.beads', 'graph', 'my-test-project.db');
    
    try {
      expect(manager.getDbPath()).toBe(defaultPath);
    } finally {
      manager.close();
    }
  });
});
