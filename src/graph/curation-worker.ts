import { randomUUID } from 'node:crypto';
import { writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryEvent, SemanticSlice } from './models.js';
import type { ProjectGraph } from './store/ProjectGraph.js';

import { GraphStore } from './store/GraphStore.js';
import { resolveProjectPath } from './store/pathResolver.js';

export interface CurationResult {
  slicesCreated: number;
  eventsProcessed: number;
}

export interface GraphStats {
  nodes: number;
  edges: number;
  unresolved: number;
}

export class CurationWorker {
  /**
   * Curate un-grouped memory events into Semantic Slices using heuristics.
   * v1 uses a simple session-based clustering approach.
   */
  public static curate(workspaceRoot: string, graph: ProjectGraph, stats?: GraphStats): CurationResult {
    const allEvents = graph.getAllMemoryEvents();
    const existingSlices = graph.getMemorySlices();

    // 1. Find curated event IDs
    const curatedEventIds = new Set<string>();
    for (const slice of existingSlices) {
      for (const id of slice.eventIds) {
        curatedEventIds.add(id);
      }
    }

    // 2. Get uncurated events, apply hard limit of 1000
    const uncuratedEvents = allEvents.filter(e => !curatedEventIds.has(e.id));
    const eventsToProcess = uncuratedEvents.slice(0, 1000);

    if (eventsToProcess.length === 0) {
      return { slicesCreated: 0, eventsProcessed: 0 };
    }

    // 3. Simple Heuristic Clustering (v1)
    // Group by session ID for simple clustering
    const groups = new Map<string, MemoryEvent[]>();
    for (const event of eventsToProcess) {
      const key = event.sessionId || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(event);
    }

    let slicesCreated = 0;

    for (const [sessionId, events] of groups.entries()) {
      if (events.length === 0) continue;

      // Extract nodeIds from metadata if available
      const nodeIds = new Set<string>();
      const topic = `Session ${sessionId.substring(0, 8)} Operations`;
      
      for (const e of events) {
        if (e.metadata?.nodeId) {
          nodeIds.add(e.metadata.nodeId as string);
        } else if (e.metadata?.nodeIds && Array.isArray(e.metadata.nodeIds)) {
          for (const id of e.metadata.nodeIds) {
            nodeIds.add(String(id));
          }
        }
      }

      // Generate a simple summary based on event kinds
      const kinds = new Set(events.map(e => e.kind));
      const summary = `Session curation containing ${events.length} events of types: ${Array.from(kinds).join(', ')}`;

      const slice: SemanticSlice = {
        id: randomUUID(),
        topic,
        summary,
        nodeIds: Array.from(nodeIds),
        eventIds: events.map(e => e.id),
        createdAt: new Date().toISOString(),
      };

      graph.addMemorySlice(slice);
      slicesCreated++;
    }

    if (stats) {
      GraphStore.insertSnapshot(workspaceRoot, graph.projectName, stats.unresolved);
    }

    // Cache God Nodes (QW-1)
    const godNodes = graph.getTopGodNodes(50);
    GraphStore.setCustomMetadata(workspaceRoot, graph.projectName, 'god_nodes_cache', godNodes);

    if (slicesCreated > 0 || eventsToProcess.length > 0) {
      const projectDir = resolveProjectPath(workspaceRoot, graph.projectName);
      const graphDir = join(projectDir, '.beads', 'graph');
      const summaryPath = join(graphDir, 'memory-log.md');
      const tempPath = summaryPath + '.tmp';

      const slices = graph.getMemorySlices();
      let mdContent = `# Memory Summary: ${graph.projectName}\n\n`;
      mdContent += `> Last curated: ${new Date().toISOString()}\n\n`;
      mdContent += `## Context Window Summary\n\n`;
      
      if (slices.length === 0) {
        mdContent += `*No memory slices curated yet.*\n`;
      } else {
        // Show newest slices first
        const sortedSlices = [...slices].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        for (const slice of sortedSlices.slice(0, 50)) { // limit to last 50 for brevity
          mdContent += `- **${slice.topic}** (${slice.eventIds.length} events)\n  ${slice.summary}\n`;
        }
      }

      try {
        mkdirSync(graphDir, { recursive: true });
        writeFileSync(tempPath, mdContent);
        renameSync(tempPath, summaryPath);

        const legacyPath = join(projectDir, 'memory_summary.md');
        if (existsSync(legacyPath)) {
          unlinkSync(legacyPath);
        }
      } catch (err) {
        console.warn(`[CurationWorker] Failed to write memory_summary.md for ${graph.projectName}:`, err);
      }
    }

    return {
      slicesCreated,
      eventsProcessed: eventsToProcess.length,
    };
  }
}
