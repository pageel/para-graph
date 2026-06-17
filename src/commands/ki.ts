import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, cpSync, readdirSync } from 'node:fs';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runKiSync(): Promise<void> {
  console.log('[KI Sync] Starting Knowledge Items synchronization...');

  // 1. Resolve templates path
  let templatesSrc = join(__dirname, '..', 'templates', 'knowledge');
  if (!existsSync(templatesSrc)) {
    // Fallback for dev mode
    templatesSrc = join(__dirname, '..', '..', 'templates', 'knowledge');
  }

  if (!existsSync(templatesSrc)) {
    console.error(`Error: Knowledge templates directory not found at: ${templatesSrc}`);
    process.exit(1);
  }

  // Find subfolders in templatesSrc (these are our KIs)
  const kiFolders = readdirSync(templatesSrc, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  if (kiFolders.length === 0) {
    console.log('[KI Sync] No Knowledge Items templates found to sync.');
    process.exit(0);
  }

  // 2. Identify target directories
  const homeDir = os.homedir();
  const targetRoots = [
    join(homeDir, '.gemini', 'antigravity', 'knowledge'),
    join(homeDir, '.gemini', 'antigravity-ide', 'knowledge')
  ];

  let syncCount = 0;

  for (const targetRoot of targetRoots) {
    // Check if the parent ~/.gemini/... folder exists (meaning that specific IDE version is used)
    const parentDir = dirname(targetRoot);
    if (!existsSync(parentDir)) {
      continue;
    }

    console.log(`[KI Sync] Syncing to: ${targetRoot}`);

    for (const kiFolder of kiFolders) {
      const srcPath = join(templatesSrc, kiFolder);
      const destPath = join(targetRoot, kiFolder);

      try {
        cpSync(srcPath, destPath, { recursive: true });
        console.log(`  - Synchronized KI: ${kiFolder}`);
        syncCount++;
      } catch (err: any) {
        console.error(`  - Failed to copy KI "${kiFolder}":`, err.message);
      }
    }
  }

  if (syncCount > 0) {
    console.log(`[KI Sync] Success: Synchronized KIs successfully.`);
  } else {
    console.log('[KI Sync] Warning: No target IDE knowledge folders were found to synchronize to.');
  }
}
