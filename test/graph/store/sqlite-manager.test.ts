import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteManager } from '../../../src/graph/store/sqlite-manager';
import Database from 'better-sqlite3';

SqliteManager.DatabaseConstructor = Database;

describe('SqliteManager', () => {
  let dbManager: SqliteManager;

  beforeEach(() => {
    dbManager = new SqliteManager('test', ':memory:');
    dbManager.initSchema();
  });

  afterEach(() => {
    dbManager.close();
  });

  describe('Schema initialization', () => {
    it('creates project_snapshots table', () => {
      const db = dbManager.getConnection();
      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_snapshots'");
      const result = stmt.get();
      expect(result).toBeDefined();
      expect(result?.name).toBe('project_snapshots');
    });
  });
});
