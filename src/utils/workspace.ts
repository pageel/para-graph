import { resolve, parse as pathParse } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Walk up the directory tree from `startDir` looking for `.para-workspace.yml`.
 * Returns the absolute path to the workspace root, or null if not found.
 *
 * Cross-platform: uses `path.resolve()` + `path.parse()` to handle
 * Windows drive letters (e.g., C:\) and Unix root (/).
 */
export function findWorkspaceRoot(startDir?: string): string | null {
  let current = resolve(startDir ?? process.cwd());

  while (true) {
    const candidate = resolve(current, '.para-workspace.yml');
    if (existsSync(candidate)) {
      return current;
    }

    const parent = resolve(current, '..');
    // Reached filesystem root (Unix: /, Windows: C:\)
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Check if a string looks like a project name (no path separators).
 * Valid: "para-graph", "my_project", "qlnt"
 * Invalid: "./repo", "../test", "path/to/dir", "C:\Users\..."
 */
export function isProjectName(input: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(input);
}
