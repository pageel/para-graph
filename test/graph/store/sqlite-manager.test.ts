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

  describe('Schema Migration / Drift', () => {
    it('handles legacy edges table foreign key constraint on target_id', () => {
      const manager = new SqliteManager('test-migration', ':memory:');
      const db = manager.getConnection();
      db.exec('PRAGMA foreign_keys = ON;');
      db.exec(`
        CREATE TABLE nodes (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          semantic TEXT,
          created_at INTEGER,
          updated_at INTEGER
        );
      `);
      db.exec(`
        CREATE TABLE edges (
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          relation TEXT NOT NULL,
          source_file TEXT,
          source_line INTEGER,
          PRIMARY KEY (source_id, target_id, relation),
          FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
        );
      `);

      db.prepare(`
        INSERT INTO nodes (id, name, type, created_at, updated_at)
        VALUES ('node1', 'Node 1', 'file', 123, 123)
      `).run();

      expect(() => {
        db.prepare(`
          INSERT INTO edges (source_id, target_id, relation)
          VALUES ('node1', 'non_existent', 'DEPENDS_ON')
        `).run();
      }).toThrow(/FOREIGN KEY constraint failed/);

      manager.initSchema();

      db.prepare(`
        INSERT INTO edges (source_id, target_id, relation)
        VALUES ('node1', 'non_existent', 'DEPENDS_ON')
      `).run();

      manager.close();
    });

    it('migrates legacy project_snapshots table to include metrics column safely', () => {
      const manager = new SqliteManager('test-migration-snapshots', ':memory:');
      const db = manager.getConnection();

      // Pre-create legacy project_snapshots table without metrics column
      db.exec(`
        CREATE TABLE project_snapshots (
          id TEXT PRIMARY KEY,
          project_name TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          nodes_count INTEGER NOT NULL,
          edges_count INTEGER NOT NULL,
          unresolved_count INTEGER NOT NULL
        );
      `);

      // Verify that metrics column does not exist yet
      let columns = db.prepare("PRAGMA table_info(project_snapshots)").all() as any[];
      expect(columns.find(c => c.name === 'metrics')).toBeUndefined();

      // Run initSchema() which should migrate the table
      manager.initSchema();

      // Verify that metrics column was added
      columns = db.prepare("PRAGMA table_info(project_snapshots)").all() as any[];
      const metricsCol = columns.find(c => c.name === 'metrics');
      expect(metricsCol).toBeDefined();
      expect(metricsCol.type).toBe('TEXT');
      expect(metricsCol.dflt_value).toBe('NULL');

      manager.close();
    });
  });
});

