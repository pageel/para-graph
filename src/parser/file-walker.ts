/**
 * File Walker — Recursively scans a directory for TypeScript files.
 *
 * Excludes: node_modules/, dist/, .d.ts files, and symlinks (H2-3 guard).
 */

import { readdirSync, statSync, lstatSync } from 'node:fs';
import { join, extname } from 'node:path';

/** Default maximum number of files to collect (H2-3: traversal bomb guard) */
const MAX_FILES = 10_000;

/** Directories to skip during traversal */
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', 'output', 'coverage']);

/**
 * Recursively walk a directory and collect all TypeScript file paths.
 *
 * @param dirPath - Root directory to scan
 * @param maxFiles - Maximum number of files to collect (default: 10000)
 * @returns Array of absolute file paths matching *.ts or *.tsx
 */
export function walkDirectory(dirPath: string, maxFiles: number = MAX_FILES): string[] {
  const results: string[] = [];
  walk(dirPath, results, maxFiles);
  return results;
}

function walk(dir: string, results: string[], maxFiles: number): void {
  if (results.length >= maxFiles) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    // Permission denied or unreadable — skip silently
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxFiles) return;

    const fullPath = join(dir, entry);

    // H2-3: Skip symlinks to prevent traversal loops
    try {
      const lstat = lstatSync(fullPath);
      if (lstat.isSymbolicLink()) continue;
    } catch {
      continue;
    }

    try {
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry)) {
          walk(fullPath, results, maxFiles);
        }
      } else if (stat.isFile()) {
        const ext = extname(entry);
        // Include .ts and .tsx, exclude .d.ts declaration files
        if ((ext === '.ts' || ext === '.tsx') && !entry.endsWith('.d.ts')) {
          results.push(fullPath);
        }
      }
    } catch {
      // stat failed — skip
      continue;
    }
  }
}
