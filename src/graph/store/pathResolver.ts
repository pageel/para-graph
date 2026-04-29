import { resolve } from 'node:path';

/**
 * Resolve the graph storage directory for a project.
 *
 * Supports two namespaces:
 * - Standard: `projectName` → `Projects/<name>/.beads/graph/`
 * - External: `@resources/<path>` → `Resources/references/<path>/.beads/graph/`
 */
export function resolveGraphDir(workspaceRoot: string, projectName: string): string {
  if (projectName.startsWith('@resources/')) {
    const resourcePath = projectName.slice('@resources/'.length);
    return resolve(workspaceRoot, 'Resources', 'references', resourcePath, '.beads', 'graph');
  }
  return resolve(workspaceRoot, 'Projects', projectName, '.beads', 'graph');
}

/**
 * Resolve the source code directory for a project.
 *
 * Standard projects have source in `repo/` subdirectory.
 * External resources ARE the source directory (no `repo/` subfolder).
 */
export function resolveSourceDir(workspaceRoot: string, projectName: string): string {
  if (projectName.startsWith('@resources/')) {
    const resourcePath = projectName.slice('@resources/'.length);
    return resolve(workspaceRoot, 'Resources', 'references', resourcePath);
  }
  return resolve(workspaceRoot, 'Projects', projectName, 'repo');
}
