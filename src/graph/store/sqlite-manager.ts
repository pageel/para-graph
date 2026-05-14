import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

export class SqliteManager {
  private dbPath: string;
  private db: any | null = null;

  constructor(projectName: string, customPath?: string) {
    if (customPath) {
      this.dbPath = customPath;
    } else {
      this.dbPath = path.join(process.cwd(), '.beads', 'graph', `${projectName}.db`);
    }
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  public initSchema(): void {
    const db = this.getConnection();

    // 1. Create standard tables
    // Nodes table with JSON serialized semantic field
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        semantic TEXT DEFAULT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Edges table
    db.exec(`
      CREATE TABLE IF NOT EXISTS edges (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        source_file TEXT,
        source_line INTEGER,
        PRIMARY KEY (source_id, target_id, relation),
        FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
      )
    `);

    // Metadata table
    db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Memory events table
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT DEFAULT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Memory slices table
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_slices (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        summary TEXT NOT NULL,
        node_ids TEXT NOT NULL,
        event_ids TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // Project snapshots table
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_snapshots (
        id TEXT PRIMARY KEY,
        project_name TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        nodes_count INTEGER NOT NULL,
        edges_count INTEGER NOT NULL,
        unresolved_count INTEGER NOT NULL
      )
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_project ON project_snapshots(project_name)
    `);

    // 2. Create FTS5 virtual table
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_memory_events USING fts5(
        id UNINDEXED,
        session_id UNINDEXED,
        kind UNINDEXED,
        content,
        content='memory_events',
        content_rowid='rowid'
      )
    `);

    // 3. Create Triggers for auto-syncing memory_events to fts_memory_events
    // AFTER INSERT
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memory_events_ai AFTER INSERT ON memory_events BEGIN
        INSERT INTO fts_memory_events(rowid, id, session_id, kind, content)
        VALUES (new.rowid, new.id, new.session_id, new.kind, new.content);
      END;
    `);

    // AFTER DELETE
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memory_events_ad AFTER DELETE ON memory_events BEGIN
        INSERT INTO fts_memory_events(fts_memory_events, rowid, id, session_id, kind, content)
        VALUES ('delete', old.rowid, old.id, old.session_id, old.kind, old.content);
      END;
    `);

    // AFTER UPDATE
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memory_events_au AFTER UPDATE ON memory_events BEGIN
        INSERT INTO fts_memory_events(fts_memory_events, rowid, id, session_id, kind, content)
        VALUES ('delete', old.rowid, old.id, old.session_id, old.kind, old.content);
        INSERT INTO fts_memory_events(rowid, id, session_id, kind, content)
        VALUES (new.rowid, new.id, new.session_id, new.kind, new.content);
      END;
    `);

    // 4. Schema Migrations
    // v0.16.0: Add weight and archived to memory_events
    try {
      db.exec(`ALTER TABLE memory_events ADD COLUMN weight REAL DEFAULT 1.0;`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) {
        throw e;
      }
    }
    
    try {
      db.exec(`ALTER TABLE memory_events ADD COLUMN archived INTEGER DEFAULT 0;`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) {
        throw e;
      }
    }
    
    db.exec(`CREATE INDEX IF NOT EXISTS idx_events_archived ON memory_events(archived)`);
  }

  public static DatabaseConstructor: any = null;

  public getConnection(): any {
    if (!this.db) {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      try {
        const loadSqlite = require('./load-sqlite.cjs');
        const Database = SqliteManager.DatabaseConstructor || loadSqlite();
        this.db = new Database(this.dbPath);
      } catch (e: any) {
        throw new Error('better-sqlite3 is not available. Error: ' + e.message);
      }
    }
    return this.db;
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
