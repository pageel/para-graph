import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteManager } from '../../../src/graph/store/sqlite-manager.js';

describe('file-snapshots database integration', () => {
  let manager: SqliteManager;

  beforeEach(() => {
    // Use in-memory database for isolated unit tests
    manager = new SqliteManager('test-project', ':memory:');
    manager.initSchema();
  });

  afterEach(() => {
    manager.close();
  });

  it('should create snapshot database tables successfully', () => {
    const db = manager.getConnection();
    
    // Verify existence of new snapshot tables
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN ('file_tree_snapshots', 'file_tree_entries', 'protected_files')
    `).all() as Array<{ name: string }>;

    const tableNames = tables.map((t: { name: string }) => t.name);
    expect(tableNames).toContain('file_tree_snapshots');
    expect(tableNames).toContain('file_tree_entries');
    expect(tableNames).toContain('protected_files');
  });

  it('should seed default protected files successfully', () => {
    const db = manager.getConnection();
    const protectedFiles = db.prepare('SELECT file_path, description FROM protected_files').all() as Array<{ file_path: string, description: string }>;

    expect(protectedFiles.length).toBeGreaterThanOrEqual(4);
    const paths = protectedFiles.map((f: { file_path: string }) => f.file_path);
    expect(paths).toContain('.para-workspace.yml');
    expect(paths).toContain('.agents/rules.md');
    expect(paths).toContain('project.md');
    expect(paths).toContain('.gitignore');
  });

  it('should insert and retrieve directory snapshot correctly', () => {
    const snapshotId = 'snap-12345';
    const files = [
      { filePath: 'src/utils/file-scanner.ts', size: 1024, hash: 'hash1' },
      { filePath: 'package.json', size: 500, hash: 'hash2' }
    ];

    // Persist snapshot
    (manager as any).insertSnapshot(snapshotId, files);

    // Retrieve snapshot
    const retrieved = (manager as any).getSnapshot(snapshotId);
    expect(retrieved).not.toBeNull();
    expect(retrieved.length).toBe(2);

    const fileMap = new Map<string, any>(retrieved.map((f: any) => [f.filePath, f]));
    expect(fileMap.has('src/utils/file-scanner.ts')).toBe(true);
    
    const file = fileMap.get('src/utils/file-scanner.ts');
    expect(file).toBeDefined();
    expect(file.size).toBe(1024);
    expect(file.hash).toBe('hash1');
  });

  it('should calculate correct diff between two snapshots', () => {
    const snap1 = 'snap-1';
    const files1 = [
      { filePath: 'file-kept.txt', size: 100, hash: 'hash-kept' },
      { filePath: 'file-modified.txt', size: 200, hash: 'hash-old' },
      { filePath: 'file-deleted.txt', size: 300, hash: 'hash-deleted' }
    ];

    const snap2 = 'snap-2';
    const files2 = [
      { filePath: 'file-kept.txt', size: 100, hash: 'hash-kept' },
      { filePath: 'file-modified.txt', size: 250, hash: 'hash-new' }, // modified size and hash
      { filePath: 'file-added.txt', size: 400, hash: 'hash-added' } // added
    ];

    (manager as any).insertSnapshot(snap1, files1);
    (manager as any).insertSnapshot(snap2, files2);

    const diff = (manager as any).compareSnapshots(snap1, snap2);

    // Added files
    expect(diff.added.length).toBe(1);
    expect(diff.added[0].filePath).toBe('file-added.txt');

    // Removed files
    expect(diff.removed.length).toBe(1);
    expect(diff.removed[0].filePath).toBe('file-deleted.txt');

    // Modified files
    expect(diff.modified.length).toBe(1);
    expect(diff.modified[0].filePath).toBe('file-modified.txt');
    expect(diff.modified[0].size).toBe(250);
  });
});
