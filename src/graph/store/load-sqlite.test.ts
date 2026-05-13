import { describe, it, expect, vi, afterEach } from 'vitest';

describe('load-sqlite Dual Backend Adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('should load better-sqlite3 when Node.js < 22', async () => {
    // Mock Node version to 20.0.0
    vi.stubGlobal('process', {
      ...process,
      versions: { ...process.versions, node: '20.0.0' }
    });

    const loadSqlite = (await import('./load-sqlite.cjs')).default;
    const Database = loadSqlite();

    // Since better-sqlite3 is an external module, we can just check if its name is 'Database'
    // or instantiate it in memory.
    expect(Database.name).toBe('Database');
    
    // Test instantiating
    const db = new Database(':memory:');
    expect(typeof db.prepare).toBe('function');
    expect(typeof db.transaction).toBe('function');
    db.close();
  });

  it('should load node:sqlite when Node.js >= 22 and polyfill transaction()', async () => {
    // Mock Node version to 24.0.0
    vi.stubGlobal('process', {
      ...process,
      versions: { ...process.versions, node: '24.0.0' }
    });

    const loadSqlite = (await import('./load-sqlite.cjs')).default;
    const DatabaseSync = loadSqlite();

    // node:sqlite returns DatabaseSync
    expect(DatabaseSync.name).toBe('DatabaseSync');

    // Test instantiating
    const db = new DatabaseSync(':memory:');
    expect(typeof db.prepare).toBe('function');
    
    // Our polyfill must provide .transaction()
    expect(typeof db.transaction).toBe('function');

    // Verify transaction works
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    const insert = db.prepare('INSERT INTO test (id) VALUES (?)');
    
    const trx = db.transaction((id: number) => {
      insert.run(id);
    });

    trx(1);
    
    const row = db.prepare('SELECT * FROM test').get();
    expect(row).toEqual({ id: 1 });

    db.close();
  });
});
