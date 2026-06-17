// @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-build-integration]
import { findWorkspaceRoot } from '../utils/workspace.js';
import { GraphStore } from '../graph/store/GraphStore.js';
import { SqliteManager } from '../graph/store/sqlite-manager.js';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProjectInsight } from '../graph/models.js';

export interface AuditCsaOptions {
  projectPath: string;
}

export function runAudit({ projectPath }: AuditCsaOptions): void {
  const wsRoot = findWorkspaceRoot();
  if (!wsRoot) {
    console.error('Error: Could not auto-detect workspace root.');
    process.exit(1);
  }

  const normalizedTarget = projectPath.replace(/\\/g, '/');
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
    const auditResult = dbManager.runCsaAudit();

    console.log(`\n=== CSA COMPLIANCE AUDIT REPORT: ${projectName} ===`);
    console.log(`Total CSA Anchors:  ${auditResult.totalAnchors}`);
    console.log(`Covered Anchors:    ${auditResult.coveredAnchors}`);
    console.log(`Coverage Rate:      ${auditResult.coverageRate.toFixed(2)}%`);
    console.log(`Dangling Edges:     ${auditResult.danglingEdges.length}`);
    
    // If total anchors is 0, CSA is opt-out (0 total edges/anchors -> exit code 0)
    // Meaning the project does not apply CSA, we handle gracefully
    if (auditResult.totalAnchors === 0 && auditResult.danglingEdges.length === 0) {
      console.log('\n[CSA Audit] No CSA anchors or undocumented elements found. CSA is strictly Opt-In. Exit code 0.');
      dbManager.close();
      process.exit(0);
    }

    if (auditResult.danglingEdges.length > 0) {
      console.error('\n[CSA Audit] Dangling Edges Detected:');
      for (const edge of auditResult.danglingEdges) {
        console.error(`  - Source node "${edge.sourceId}" links to missing anchor "${edge.targetId}" in ${edge.sourceFile}:${edge.sourceLine}`);
      }
    }

    // Record warning as a "risk" insight
    if (auditResult.coverageRate < 90.00 || auditResult.danglingEdges.length > 0) {
      const graph = GraphStore.getGraph(wsRoot, projectName);
      
      const insightId = `ins-${randomUUID()}`;
      let description = '';
      if (auditResult.coverageRate < 90.00) {
        description += `CSA coverage rate is ${auditResult.coverageRate.toFixed(2)}%, which is below the 90.00% requirement. `;
      }
      if (auditResult.danglingEdges.length > 0) {
        description += `Found ${auditResult.danglingEdges.length} dangling spec links: ${auditResult.danglingEdges.map(e => e.targetId).join(', ')}.`;
      }

      const driftInsight: ProjectInsight = {
        id: insightId,
        category: 'risk',
        domain: 'csa-compliance',
        title: `CSA Audit Failure: Coverage ${auditResult.coverageRate.toFixed(2)}%`,
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

    if (auditResult.coverageRate < 90.00) {
      console.error(`\n[CSA Audit] Fail: Coverage ${auditResult.coverageRate.toFixed(2)}% < 90.00%`);
      dbManager.close();
      process.exit(1);
    }

    console.log('\n[CSA Audit] Success: CSA coverage requirement passed (>90.00%).');
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
