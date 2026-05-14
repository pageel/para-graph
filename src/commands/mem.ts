import { existsSync } from 'node:fs';
import { resolveGraphDir } from '../graph/store/pathResolver.js';
import { GraphStore } from '../graph/store/GraphStore.js';
import { CurationWorker } from '../graph/curation-worker.js';

export function runMem(projectName: string, workspaceRoot: string): void {
  if (!projectName) {
    console.error('❌ Error: Project name is required.');
    process.exit(1);
  }

  const graphDir = resolveGraphDir(workspaceRoot, projectName);

  if (!existsSync(graphDir)) {
    console.error(`❌ Error: Graph directory not found for project "${projectName}".`);
    console.error(`Please run "para-graph build ${projectName}" first.`);
    process.exit(1);
  }

  console.log(`🧠 Curating memory events for project: ${projectName}...`);

  const graph = GraphStore.getGraph(workspaceRoot, projectName);
  const graphStats = graph.getStats();
  const result = CurationWorker.curate(workspaceRoot, graph, {
    nodes: graphStats.nodeCount,
    edges: graphStats.edgeCount,
    unresolved: (graphStats as any).unresolvedCount || 0
  });

  if (result.slicesCreated > 0) {
    GraphStore.saveMemorySlices(workspaceRoot, projectName);
    console.log(`✅ Success: Created ${result.slicesCreated} slices from ${result.eventsProcessed} events.`);
  } else {
    console.log(`✅ No new uncurated events found.`);
  }
}
