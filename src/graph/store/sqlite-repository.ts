import { SqliteManager } from './sqlite-manager.js';

export class SqliteGraphRepository {
  constructor(private manager: SqliteManager) {}

  public insertNode(node: any): void {
    const db = this.manager.getConnection();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO nodes (id, name, type, semantic, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      node.id,
      node.name,
      node.type,
      node.semantic ? JSON.stringify(node.semantic) : null,
      node.createdAt || node.created_at,
      node.updatedAt || node.updated_at
    );
  }

  public *getAllNodes(): IterableIterator<any> {
    const db = this.manager.getConnection();
    const stmt = db.prepare(`SELECT * FROM nodes`);
    for (const row of stmt.iterate()) {
      const node = row as any;
      yield {
        id: node.id,
        name: node.name,
        type: node.type,
        semantic: node.semantic ? JSON.parse(node.semantic) : undefined,
        createdAt: node.created_at,
        updatedAt: node.updated_at
      };
    }
  }
}
