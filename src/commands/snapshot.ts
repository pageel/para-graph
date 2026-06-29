import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { findWorkspaceRoot } from '../utils/workspace.js';
import { resolveSourceDir, resolveGraphDir } from '../graph/store/pathResolver.js';
import { SqliteManager } from '../graph/store/sqlite-manager.js';
import { scanDirectory } from '../utils/file-scanner.js';

// @para-doc [#csa-cli-snapshot]
export function runProjectSnapshot(projectName: string): void {
  const wsRoot = findWorkspaceRoot();
  if (!wsRoot) {
    console.error('❌ Error: Could not auto-detect workspace root.');
    process.exit(1);
  }

  try {
    const rootDir = resolveSourceDir(wsRoot, projectName);
    const graphDir = resolveGraphDir(wsRoot, projectName);
    const dbPath = join(graphDir, `${projectName}.db`);
    const dbManager = new SqliteManager(projectName, dbPath);

    dbManager.initSchema();

    const isRepoSubdir = basename(rootDir) === 'repo';
    const excludePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/test-output/**',
      '**/*.log'
    ];

    if (!isRepoSubdir) {
      excludePatterns.push(
        '.beads/**',
        'artifacts/**',
        'sessions/**',
        'docs/**'
      );
    }

    const filePaths = scanDirectory(rootDir, { excludePatterns, rootDir });
    const snapshotId = `snap-${randomUUID()}`;
    const filesToInsert: Array<{ filePath: string; size: number; hash: string }> = [];

    for (const fullPath of filePaths) {
      try {
        const stats = statSync(fullPath);
        const content = readFileSync(fullPath);
        const hash = createHash('sha256').update(content).digest('hex');
        const relativePath = relative(rootDir, fullPath).replace(/\\/g, '/');
        filesToInsert.push({
          filePath: relativePath,
          size: stats.size,
          hash
        });
      } catch (e) {
        // Ignore unreadable files
      }
    }

    const db = dbManager.getConnection();
    const rows = db.prepare('SELECT file_path as filePath FROM protected_files').all() as Array<{ filePath: string }>;
    const protectedFilePaths = new Set(rows.map(r => r.filePath));

    const presentFiles = new Set(filesToInsert.map(f => f.filePath));
    const warnings: string[] = [];
    for (const protectedPath of protectedFilePaths) {
      if (!presentFiles.has(protectedPath)) {
        warnings.push(`Protected file is missing: ${protectedPath}`);
      }
    }

    dbManager.insertSnapshot(snapshotId, filesToInsert);
    dbManager.close();

    console.log(JSON.stringify({
      success: true,
      snapshotId,
      totalFiles: filesToInsert.length,
      totalSize: filesToInsert.reduce((sum, f) => sum + f.size, 0),
      warnings
    }, null, 2));

    if (warnings.length > 0) {
      console.warn('\n⚠️  Warnings:');
      for (const warn of warnings) {
        console.warn(`  - ${warn}`);
      }
    }
  } catch (err: any) {
    console.error('❌ Error taking snapshot:', err.message);
    process.exit(1);
  }
}

export function runProjectDiff(projectName: string, sourceSnapshotId: string, targetSnapshotId: string): void {
  const wsRoot = findWorkspaceRoot();
  if (!wsRoot) {
    console.error('❌ Error: Could not auto-detect workspace root.');
    process.exit(1);
  }

  try {
    const graphDir = resolveGraphDir(wsRoot, projectName);
    const dbPath = join(graphDir, `${projectName}.db`);
    const dbManager = new SqliteManager(projectName, dbPath);

    dbManager.initSchema();
    const diff = dbManager.compareSnapshots(sourceSnapshotId, targetSnapshotId);
    dbManager.close();

    console.log(JSON.stringify(diff, null, 2));
  } catch (err: any) {
    console.error('❌ Error comparing snapshots:', err.message);
    process.exit(1);
  }
}
