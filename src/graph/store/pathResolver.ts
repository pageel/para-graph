import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { isProjectName } from '../../utils/workspace.js';

/**
 * Validate projectName to prevent Path Traversal and limit length.
 */
function validateProjectName(projectName: string): void {
  if (projectName.length > 100) {
    throw new Error(`Project name or path exceeds 100 characters: ${projectName}`);
  }

  if (projectName.startsWith('@resources/')) {
    const resourcePath = projectName.slice('@resources/'.length);
    if (!resourcePath) {
      throw new Error(`Invalid resource path: ${projectName}`);
    }
    const parts = resourcePath.split('/');
    if (!parts.every(part => /^[a-zA-Z0-9_-]+$/.test(part))) {
      throw new Error(`Invalid resource path: ${projectName}`);
    }
  } else if (!isProjectName(projectName)) {
    throw new Error(`Invalid project name: ${projectName}`);
  }
}

/**
 * Resolve the graph storage directory for a project.
 *
 * Supports two namespaces:
 * - Standard: `projectName` → `Projects/<name>/.beads/graph/`
 * - External: `@resources/<path>` → `Resources/references/<path>/.beads/graph/`
 */
export function resolveGraphDir(workspaceRoot: string, projectName: string): string {
  validateProjectName(projectName);
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
 * If `repo/` does not exist for a standard project, it falls back to the project root.
 */
export function resolveSourceDir(workspaceRoot: string, projectName: string): string {
  validateProjectName(projectName);
  if (projectName.startsWith('@resources/')) {
    const resourcePath = projectName.slice('@resources/'.length);
    return resolve(workspaceRoot, 'Resources', 'references', resourcePath);
  }
  
  const projectRoot = resolve(workspaceRoot, 'Projects', projectName);
  const repoDir = resolve(projectRoot, 'repo');
  
  if (existsSync(repoDir)) {
    return repoDir;
  }
  
  return projectRoot;
}

/**
 * Resolve the project root directory.
 */
export function resolveProjectPath(workspaceRoot: string, projectName: string): string {
  validateProjectName(projectName);
  if (projectName.startsWith('@resources/')) {
    const resourcePath = projectName.slice('@resources/'.length);
    return resolve(workspaceRoot, 'Resources', 'references', resourcePath);
  }
  return resolve(workspaceRoot, 'Projects', projectName);
}
