// @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-build-integration]
import { findWorkspaceRoot } from '../utils/workspace.js';
import { GraphStore } from '../graph/store/GraphStore.js';
import { SqliteManager } from '../graph/store/sqlite-manager.js';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { ProjectInsight, CsaConfig } from '../graph/models.js';

export interface AuditCsaOptions {
  projectPath: string;
}

function readCsaConfig(projectMdPath: string): Partial<CsaConfig> {
  const config: Partial<CsaConfig> = {};
  if (!existsSync(projectMdPath)) return config;
  try {
    const content = readFileSync(projectMdPath, 'utf8');
    const specMatch = content.match(/spec_threshold:\s*(\d+)/);
    if (specMatch) config.specThreshold = parseInt(specMatch[1], 10);

    const docMatch = content.match(/doc_threshold:\s*(\d+)/);
    if (docMatch) config.docThreshold = parseInt(docMatch[1], 10);

    const gateMatch = content.match(/doc_gate:\s*['"]?(soft|hard|off)['"]?/);
    if (gateMatch) config.docGate = gateMatch[1] as 'soft' | 'hard' | 'off';

    const doubleBindingMatch = content.match(/double_binding:\s*(true|false)/);
    if (doubleBindingMatch) config.doubleBinding = doubleBindingMatch[1] === 'true';
  } catch {}
  return config;
}

// @para-doc [artifacts/specs/spec-2026-06-19-csa-loophole-guard.md#csa-loophole-guard]
// @para-doc [docs/guides/cli.md#csa-cli-audit]
// @para-doc [docs/strategy/strategy-csa.md#csa-tiered-gate]
export function runAudit({ projectPath }: AuditCsaOptions): void {
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

  // Initialize SqliteManager for this project
  // Default DB path: <wsRoot>/Projects/<projectName>/.beads/graph/<projectName>.db
  const dbPath = path.join(wsRoot, 'Projects', projectName, '.beads', 'graph', `${projectName}.db`);
  const dbManager = new SqliteManager(projectName, dbPath);
  
  try {
    dbManager.initSchema();
    const projectMdPath = path.join(wsRoot, 'Projects', projectName, 'project.md');
    const config = readCsaConfig(projectMdPath);
    const auditResult = dbManager.runCsaAudit(config);

    console.log(`\n=== CSA COMPLIANCE AUDIT REPORT: ${projectName} ===`);
    console.log(`Combined Health Score: ${auditResult.combinedHealth.toFixed(2)}%`);
    console.log(`Dangling Edges:        ${auditResult.danglingEdges.length}`);
    
    console.log(`\n--- Tier 1: Specs (Hard Gate) ---`);
    console.log(`  Total Anchors:  ${auditResult.specCoverage.totalAnchors}`);
    console.log(`  Covered:        ${auditResult.specCoverage.coveredAnchors}`);
    console.log(`  Coverage Rate:  ${auditResult.specCoverage.coverageRate.toFixed(2)}% (threshold: ${auditResult.specCoverage.threshold}%)`);
    console.log(`  Status:         ${auditResult.specCoverage.pass ? 'PASS' : 'FAIL'}`);

    console.log(`\n--- Tier 2: Docs (${auditResult.docCoverage.gate.toUpperCase()} Gate) ---`);
    if (auditResult.docCoverage.gate === 'off') {
      console.log(`  Status:         OFF (skipped)`);
    } else {
      console.log(`  Total Anchors:  ${auditResult.docCoverage.totalAnchors}`);
      console.log(`  Covered:        ${auditResult.docCoverage.coveredAnchors}`);
      console.log(`  Coverage Rate:  ${auditResult.docCoverage.coverageRate.toFixed(2)}% (threshold: ${auditResult.docCoverage.threshold}%)`);
      console.log(`  Status:         ${auditResult.docCoverage.pass ? 'PASS' : 'FAIL'}`);
    }

    // Record warning as a "risk" insight
    const specFail = !auditResult.specCoverage.pass;
    const docFail = auditResult.docCoverage.gate !== 'off' && !auditResult.docCoverage.pass;
    const hasDangling = auditResult.danglingEdges.length > 0;

    // If total anchors is 0, CSA is opt-out (0 total edges/anchors -> exit code 0)
    // Meaning the project does not apply CSA, we handle gracefully.
    // However, if the loophole guard failed (specFail is true), we must NOT exit with 0.
    if (auditResult.totalAnchors === 0 && auditResult.danglingEdges.length === 0 && !specFail) {
      console.log('\n[CSA Audit] No CSA anchors or undocumented elements found. CSA is strictly Opt-In. Exit code 0.');
      dbManager.close();
      process.exit(0);
    }

    if (hasDangling) {
      console.error('\n[CSA Audit] Dangling Edges Detected:');
      for (const edge of auditResult.danglingEdges) {
        console.error(`  - Source node "${edge.sourceId}" links to missing anchor "${edge.targetId}" in ${edge.sourceFile}:${edge.sourceLine}`);
      }
    }

    if (specFail || docFail || hasDangling) {
      const graph = GraphStore.getGraph(wsRoot, projectName);
      
      const insightId = `ins-${randomUUID()}`;
      let description = '';
      if (specFail) {
        description += `Tier 1 Spec Coverage is ${auditResult.specCoverage.coverageRate.toFixed(2)}%, which is below the ${auditResult.specCoverage.threshold}% requirement. `;
      }
      if (docFail) {
        description += `Tier 2 Doc Coverage is ${auditResult.docCoverage.coverageRate.toFixed(2)}%, which is below the ${auditResult.docCoverage.threshold}% requirement (gate: ${auditResult.docCoverage.gate}). `;
      }
      if (hasDangling) {
        description += `Found ${auditResult.danglingEdges.length} dangling spec links: ${auditResult.danglingEdges.map(e => e.targetId).join(', ')}.`;
      }

      const driftInsight: ProjectInsight = {
        id: insightId,
        category: 'risk',
        domain: 'csa-compliance',
        title: `CSA Audit Failure: Spec ${auditResult.specCoverage.coverageRate.toFixed(2)}%, Doc ${auditResult.docCoverage.coverageRate.toFixed(2)}%`,
        description,
        sourceType: 'qa',
        confidence: 'hypothesis',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      graph.pushInsight(driftInsight);
      GraphStore.saveGraph(wsRoot, projectName);
      console.log(`[CSA Audit] Saved drift audit warning to insights database as risk: ${insightId}`);
    }

    // Check Gating Exit Condition
    if (specFail) {
      console.error(`\n[CSA Audit] Fail: Tier 1 Spec Coverage ${auditResult.specCoverage.coverageRate.toFixed(2)}% < ${auditResult.specCoverage.threshold}%`);
      dbManager.close();
      process.exit(1);
    }

    if (auditResult.docCoverage.gate === 'hard' && !auditResult.docCoverage.pass) {
      console.error(`\n[CSA Audit] Fail: Tier 2 Doc Coverage ${auditResult.docCoverage.coverageRate.toFixed(2)}% < ${auditResult.docCoverage.threshold}% (hard gate)`);
      dbManager.close();
      process.exit(1);
    }

    if (auditResult.docCoverage.gate === 'soft' && !auditResult.docCoverage.pass) {
      console.warn(`\n[CSA Audit] Warning: Tier 2 Doc Coverage ${auditResult.docCoverage.coverageRate.toFixed(2)}% is below threshold of ${auditResult.docCoverage.threshold}%.`);
    }

    console.log('\n[CSA Audit] Success: CSA coverage requirement passed.');
    dbManager.close();
    process.exit(0);

  } catch (err: any) {
    if (err.message && err.message.startsWith('exit:')) {
      throw err;
    }
    console.error('[CSA Audit] Fatal error:', err.message);
    try {
      dbManager.close();
    } catch {}
    process.exit(1);
  }
}
