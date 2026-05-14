import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteManager } from '../../../src/graph/store/sqlite-manager.js';
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

    it('migrates memory_events to include weight and archived columns safely', () => {
      const db = dbManager.getConnection();
      
      // Get table info to verify columns exist
      const columnsInfo = db.prepare("PRAGMA table_info(memory_events)").all() as any[];
      const weightCol = columnsInfo.find(c => c.name === 'weight');
      const archivedCol = columnsInfo.find(c => c.name === 'archived');
      
      expect(weightCol).toBeDefined();
      expect(weightCol.type).toBe('REAL');
      expect(weightCol.dflt_value).toBe('1.0');
      
      expect(archivedCol).toBeDefined();
      expect(archivedCol.type).toBe('INTEGER');
      expect(archivedCol.dflt_value).toBe('0');
      
      // Verify index exists
      const indexStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_events_archived'");
      const indexResult = indexStmt.get();
      expect(indexResult).toBeDefined();
      expect(indexResult?.name).toBe('idx_events_archived');
    });
  });
});

