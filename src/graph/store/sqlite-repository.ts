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

  public *getRelatedSlices(nodeIds: string[]): IterableIterator<any> {
    if (!nodeIds || nodeIds.length === 0) return;
    
    const db = this.manager.getConnection();
    const placeholders = nodeIds.map(() => '?').join(',');
    
    const stmt = db.prepare(`
      SELECT DISTINCT s.*
      FROM memory_slices s, json_each(s.node_ids) AS n
      WHERE n.value IN (${placeholders})
    `);
    
    for (const row of stmt.iterate(...nodeIds)) {
      const slice = row as any;
      yield {
        id: slice.id,
        topic: slice.topic,
        summary: slice.summary,
        nodeIds: JSON.parse(slice.node_ids),
        eventIds: JSON.parse(slice.event_ids),
        createdAt: slice.created_at
      };
    }
  }
}
