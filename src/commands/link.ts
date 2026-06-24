import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { GraphStore } from '../graph/store/GraphStore.js';

export function runLink(projectName: string, workspaceRoot: string): void {
  console.warn(
    `⚠️ Warning: The "link" command is deprecated and disabled in v0.17.4, and will be removed in v0.19.0. Please use the Unified CSA ID Resolution framework.`
  );
  process.exit(0);
}
