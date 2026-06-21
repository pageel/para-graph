// @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-build-integration]
import { findWorkspaceRoot } from '../utils/workspace.js';
import { SqliteManager } from '../graph/store/sqlite-manager.js';
import { findRenamedAnchorInGit } from '../utils/git-scanner.js';
import { findFuzzyMatch } from '../utils/fuzzy-match.js';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';

export interface FixCsaOptions {
  projectPath: string;
  auto?: boolean;
  dryRun?: boolean;
}

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

// @para-doc [docs/guides/cli.md#csa-cli-fix]
// @para-doc [docs/strategy/strategy-csa.md#csa-self-healing]
export async function runFix({ projectPath, auto = false, dryRun = false }: FixCsaOptions): Promise<void> {
  const wsRoot = findWorkspaceRoot();
  if (!wsRoot) {
    console.error('Error: Could not auto-detect workspace root.');
    process.exit(1);
  }

  const absoluteProjectPath = path.resolve(projectPath);
  const normalizedTarget = absoluteProjectPath.replace(/\\/g, '/');
  let projectName = 'unknown';
  const parts = normalizedTarget.split('/');
  const projectIdx = parts.lastIndexOf('Projects');
  if (projectIdx !== -1 && projectIdx < parts.length - 1) {
    projectName = parts[projectIdx + 1];
  } else {
    projectName = path.basename(normalizedTarget);
  }

  const projectRepoPath = path.join(wsRoot, 'Projects', projectName, 'repo');
  const dbPath = path.join(wsRoot, 'Projects', projectName, '.beads', 'graph', `${projectName}.db`);
  const dbManager = new SqliteManager(projectName, dbPath);

  try {
    dbManager.initSchema();
    const auditResult = dbManager.runCsaAudit();

    if (auditResult.danglingEdges.length === 0) {
      console.log('[CSA Fix] No dangling spec links found. Nothing to fix.');
      dbManager.close();
      process.exit(0);
    }

    // Get all existing anchor IDs from DB for fuzzy matching
    const db = dbManager.getConnection();
    const rows = db.prepare(`SELECT id FROM nodes WHERE type = 'spec_anchor'`).all() as Array<{ id: string }>;
    const existingAnchorIds = rows.map(r => r.id);

    console.log(`[CSA Fix] Found ${auditResult.danglingEdges.length} dangling spec links. Analyzing repairs...`);

    let fixedCount = 0;

    for (const edge of auditResult.danglingEdges) {
      const targetId = edge.targetId;
      const sourceFile = edge.sourceFile;
      const sourceLine = edge.sourceLine;
      const sourceId = edge.sourceId;

      console.log(`\nAnalyzing broken link to "${targetId}" in ${sourceFile}:${sourceLine} (node: ${sourceId})`);

      // Step 1: Git Log Rename
      let proposedTarget = findRenamedAnchorInGit(targetId, projectRepoPath);
      let method = 'Git Log Rename';

      // Step 2: Levenshtein Fuzzy Match
      if (!proposedTarget) {
        proposedTarget = findFuzzyMatch(targetId, existingAnchorIds);
        method = 'Fuzzy Match (Levenshtein)';
      }

      if (!proposedTarget) {
        console.warn(`  [Warn] No automatic fix found for "${targetId}". Please update manually.`);
        continue;
      }

      console.log(`  Proposed fix: Replace with "${proposedTarget}" (via ${method})`);

      if (dryRun) {
        console.log(`  [Dry-run] Would replace "${targetId}" with "${proposedTarget}" in ${sourceFile}:${sourceLine}`);
        continue;
      }

      let confirmed = auto;
      if (!confirmed) {
        const answer = await askQuestion(`  Apply this fix? (y/N): `);
        confirmed = answer.trim().toLowerCase() === 'y';
      }

      if (confirmed) {
        const fullSourcePath = path.resolve(projectRepoPath, sourceFile);
        if (!fs.existsSync(fullSourcePath)) {
          console.error(`  Error: Source file does not exist: ${fullSourcePath}`);
          continue;
        }

        try {
          const content = fs.readFileSync(fullSourcePath, 'utf-8');
          const lines = content.split(/\r?\n/);
          
          if (sourceLine > 0 && sourceLine <= lines.length) {
            const originalLine = lines[sourceLine - 1];
            if (originalLine.includes(targetId)) {
              lines[sourceLine - 1] = originalLine.replace(targetId, proposedTarget);
              
              // Write back to file
              const hasCRLF = content.includes('\r\n');
              fs.writeFileSync(fullSourcePath, lines.join(hasCRLF ? '\r\n' : '\n'), 'utf-8');
              console.log(`  [Success] Fixed reference in ${sourceFile}:${sourceLine}`);
              fixedCount++;
            } else {
              console.error(`  Error: Could not find target anchor "${targetId}" at line ${sourceLine} in ${sourceFile}.`);
            }
          } else {
            console.error(`  Error: Line number ${sourceLine} out of bounds for ${sourceFile} (total lines: ${lines.length}).`);
          }
        } catch (e: any) {
          console.error(`  Error: Failed to write fix to ${sourceFile}: ${e.message}`);
        }
      } else {
        console.log(`  Fix skipped.`);
      }
    }

    console.log(`\n[CSA Fix] Finished. Applied ${fixedCount} fixes.`);
    dbManager.close();
    process.exit(0);

  } catch (err: any) {
    if (err.message && err.message.startsWith('exit:')) {
      throw err;
    }
    console.error('[CSA Fix] Fatal error:', err.message);
    try {
      dbManager.close();
    } catch {}
    process.exit(1);
  }
}
