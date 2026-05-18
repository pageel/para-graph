import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SqliteManager } from './sqlite-manager.js';
import fs from 'fs';
import path from 'path';

vi.mock('better-sqlite3', () => {
  return {
    default: class MockDatabase {
      public executedQueries: string[] = [];
      constructor(public path: string) {
        if (path !== ':memory:') {
          fs.writeFileSync(path, '');
        }
      }
      exec(sql: string) {
        this.executedQueries.push(sql);
      }
      close() {}
    }
  };
});

import Database from 'better-sqlite3';
SqliteManager.DatabaseConstructor = Database;

describe('SqliteManager', () => {
  const testDbPath = path.join(process.cwd(), '.beads', 'graph', 'test-graph.db');
  let activeManager: SqliteManager | null = null;

  beforeEach(() => {
    activeManager = null;
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    if (activeManager) {
      try { activeManager.close(); } catch(e) {}
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should lazy load the database connection', () => {
    const manager = new SqliteManager('test-project', testDbPath);
    activeManager = manager;
    
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
    activeManager = manager;
    const db1 = manager.getConnection();
    const db2 = manager.getConnection();
    
    expect(db1).toBe(db2);
    manager.close();
  });

  it('should resolve default path if no path is provided', () => {
    const manager = new SqliteManager('my-test-project');
    activeManager = manager;
    const defaultPath = path.join(process.cwd(), '.beads', 'graph', 'my-test-project.db');
    
    try {
      expect(manager.getDbPath()).toBe(defaultPath);
    } finally {
      manager.close();
    }
  });

  it('should initialize schema with correct tables and FTS5 triggers', () => {
    const manager = new SqliteManager('test-project', testDbPath);
    activeManager = manager;
    manager.initSchema();
    const db = manager.getConnection() as any;
    
    expect(db.executedQueries.length).toBeGreaterThan(0);
    
    const allSql = db.executedQueries.join('\n');
    
    // Check nodes table
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS nodes');
    expect(allSql).toContain('semantic TEXT DEFAULT NULL');
    
    // Check edges table
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS edges');
    
    // Check memory events table
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS memory_events');
    
    // Check FTS5 virtual table
    expect(allSql).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS fts_memory_events USING fts5');
    
    // Check Triggers for sync
    expect(allSql).toContain('CREATE TRIGGER IF NOT EXISTS memory_events_ai AFTER INSERT ON memory_events');
    expect(allSql).toContain('CREATE TRIGGER IF NOT EXISTS memory_events_ad AFTER DELETE ON memory_events');
    expect(allSql).toContain('CREATE TRIGGER IF NOT EXISTS memory_events_au AFTER UPDATE ON memory_events');
    
    manager.close();
  });

  it('should add metrics column to project_snapshots on initSchema', () => {
    const manager = new SqliteManager('test-project', testDbPath);
    activeManager = manager;
    manager.initSchema();
    const db = manager.getConnection() as any;
    
    const allSql = db.executedQueries.join('\n');
    expect(allSql).toContain('metrics TEXT DEFAULT NULL');
  });
});
