import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export class SqliteManager {
  private dbPath: string;
  private db: Database.Database | null = null;

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

  public getConnection(): Database.Database {
    if (!this.db) {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.db = new Database(this.dbPath);
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
