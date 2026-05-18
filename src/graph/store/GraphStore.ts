import { resolve, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync, renameSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ProjectGraph } from './ProjectGraph.js';
import { resolveGraphDir } from './pathResolver.js';
import { SqliteManager } from './sqlite-manager.js';
import { SqliteGraphRepository } from './sqlite-repository.js';
import type { GraphNode, GraphEdge, AddEdgesResult, GraphMetadata, MemoryEvent, SemanticSlice, ProjectSnapshot } from '../models.js';

export class GraphStore {
  private static readonly MAX_CAPACITY = 3;
  private static readonly cache = new Map<string, ProjectGraph>();
  private static readonly mtimeCache = new Map<string, number>();
  private static readonly lastCheckTime = new Map<string, number>();

  /**
   * Get the graph for a specific project.
   * If it's in the cache, moves it to the end (most recently used).
   * If not, loads it from disk and adds it to cache.
   */
  public static getGraph(workspaceRoot: string, projectName: string): ProjectGraph {
    if (this.cache.has(projectName)) {
      // TTL Throttle: Only check disk every 1000ms
      const now = Date.now();
      const lastCheck = this.lastCheckTime.get(projectName) || 0;
      if (now - lastCheck >= 1000) {
        this.lastCheckTime.set(projectName, now);
        const graphDir = resolveGraphDir(workspaceRoot, projectName);
        const entitiesPath = join(graphDir, 'entities.jsonl');
        
        if (existsSync(entitiesPath)) {
          try {
            const currentMtime = statSync(entitiesPath).mtimeMs;
            const cachedMtime = this.mtimeCache.get(projectName) || 0;
            
            if (currentMtime > cachedMtime) {
              // File has been updated on disk -> Evict and reload
              this.flushGraph(projectName);
              // Fall through to loadFromDisk below
            } else {
              // Move to end (most recently used)
              const graph = this.cache.get(projectName)!;
              this.cache.delete(projectName);
              this.cache.set(projectName, graph);
              return graph;
            }
          } catch (e) {
            // Ignore stat errors, fallback to cache below
          }
        }
        
        // If we reach here and it's still in cache (wasn't flushed), return it
        if (this.cache.has(projectName)) {
          const graph = this.cache.get(projectName)!;
          this.cache.delete(projectName);
          this.cache.set(projectName, graph);
          return graph;
        }
      } else {
        // Within TTL, move to end and return
        const graph = this.cache.get(projectName)!;
        this.cache.delete(projectName);
        this.cache.set(projectName, graph);
        return graph;
      }
    }

    // Cache Miss -> Load from disk
    const graph = this.loadFromDisk(workspaceRoot, projectName);

    // Evict if over capacity
    if (this.cache.size >= this.MAX_CAPACITY) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.flushGraph(firstKey);
      }
    }

    // Set initial mtime on load
    const graphDir = resolveGraphDir(workspaceRoot, projectName);
    const entitiesPath = join(graphDir, 'entities.jsonl');
    if (existsSync(entitiesPath)) {
      try {
        this.mtimeCache.set(projectName, statSync(entitiesPath).mtimeMs);
        this.lastCheckTime.set(projectName, Date.now());
      } catch (e) {
        this.mtimeCache.set(projectName, 0);
      }
    }

    this.cache.set(projectName, graph);
    return graph;
  }

  public static flushGraph(projectName: string): void {
    const graph = this.cache.get(projectName);
    if (graph) {
      // Async Deferred Close: Wait 5s before closing DB to prevent crashing concurrent MCP queries
      setTimeout(() => {
        try {
          graph.close();
        } catch (e) {}
      }, 5000).unref();
      this.cache.delete(projectName);
    }
  }

  private static loadFromDisk(workspaceRoot: string, projectName: string): ProjectGraph {
    const graph = new ProjectGraph(projectName);
    const graphDir = resolveGraphDir(workspaceRoot, projectName);

    // Initialize SQLite storage
    try {
      const dbPath = join(graphDir, `${projectName}.db`);
      const manager = new SqliteManager(projectName, dbPath);
      manager.initSchema();
      graph.repository = new SqliteGraphRepository(manager);
    } catch (e) {
      console.warn(`[GraphStore] SQLite initialization failed, falling back to in-memory:`, e);
    }

    let rawEntities: string[] = [];

    // Load entities
    const entitiesPath = join(graphDir, 'entities.jsonl');
    if (existsSync(entitiesPath)) {
      const content = readFileSync(entitiesPath, 'utf-8').trim();
      if (content.length > 0) {
        rawEntities = content.split(/\r?\n/);
        rawEntities.forEach(line => {
          graph.addNode(JSON.parse(line) as GraphNode);
        });
      }
    }

    // Load relations
    const relationsPath = join(graphDir, 'relations.jsonl');
    if (existsSync(relationsPath)) {
      const content = readFileSync(relationsPath, 'utf-8').trim();
      if (content.length > 0) {
        content.split(/\r?\n/).forEach(line => {
          graph.addEdge(JSON.parse(line) as GraphEdge);
        });
      }
    }

    // Load enrichment stats from metadata.json (P-Tracker v0.11.1)
    const metadataPath = join(graphDir, 'metadata.json');
    if (existsSync(metadataPath)) {
      try {
        const raw = JSON.parse(readFileSync(metadataPath, 'utf-8')) as GraphMetadata;
        if (raw.enrichment) {
          graph.setEnrichmentStats(raw.enrichment);
        }
      } catch {
        // Backward compat — old metadata.json without enrichment field is fine
      }
    }

    // Load memory events (P11)
    const memoryEventsPath = join(graphDir, 'memory-events.jsonl');
    if (existsSync(memoryEventsPath)) {
      const content = readFileSync(memoryEventsPath, 'utf-8').trim();
      if (content.length > 0) {
        content.split(/\r?\n/).forEach(line => {
          graph.pushMemoryEvent(JSON.parse(line) as MemoryEvent);
        });
      }
    }

    // Load memory slices (P11)
    const memorySlicesPath = join(graphDir, 'memory-slices.jsonl');
    if (existsSync(memorySlicesPath)) {
      const content = readFileSync(memorySlicesPath, 'utf-8').trim();
      if (content.length > 0) {
        content.split(/\r?\n/).forEach(line => {
          graph.addMemorySlice(JSON.parse(line) as SemanticSlice);
        });
      }
    }

    // Background sync to SQLite (Self-Healing / Auto-Convert)
    // Use setImmediate + unref so this doesn't block process exit (Vitest)
    if (graph.repository && rawEntities.length > 0) {
      const timer = setTimeout(() => {
        try {
          const db = (graph.repository as any).manager.getConnection();
          const insertAll = db.transaction(() => {
            rawEntities.forEach(line => {
              graph.repository!.insertNode(JSON.parse(line));
            });
          });
          insertAll();
        } catch (e) {
          console.error(`[GraphStore] Error auto-converting JSONL to SQLite for project ${projectName}:`, e);
        }
      }, 0);
      timer.unref();
    }

    return graph;
  }

  public static saveEntities(workspaceRoot: string, projectName: string, entities: GraphNode[]): void {
    const graphDir = resolveGraphDir(workspaceRoot, projectName);
    const entitiesPath = join(graphDir, 'entities.jsonl');
    
    // Stop dual-write if nodes > 5000 to save I/O
    if (entities.length <= 5000) {
      const content = entities.map(n => JSON.stringify(n)).join('\n') + '\n';
      const tmpPath = entitiesPath + '.tmp';
      writeFileSync(tmpPath, content, 'utf-8');
      renameSync(tmpPath, entitiesPath);
    } else {
      if (existsSync(entitiesPath)) {
        try {
          require('node:fs').rmSync(entitiesPath);
        } catch (e) {}
      }
    }
    
    // Also update the cache if it exists
    if (this.cache.has(projectName)) {
      const graph = this.cache.get(projectName)!;
      for (const entity of entities) {
        graph.updateNode(entity);
      }
    }
    
    // Update mtimeCache directly to avoid OS delay false-positives
    this.mtimeCache.set(projectName, Date.now());
    this.lastCheckTime.set(projectName, Date.now());
  }

  /**
   * Batch inject edges into a project's graph with validation and deduplication.
   * Proxy for ProjectGraph.addEdges() — handles load, delegate, and persist.
   *
   * @param workspaceRoot - PARA Workspace root directory
   * @param projectName - Target project name
   * @param edges - Array of edges to inject
   * @returns AddEdgesResult with added/skipped counts and error details
   */
  public static addEdges(workspaceRoot: string, projectName: string, edges: GraphEdge[]): AddEdgesResult {
    const graph = this.getGraph(workspaceRoot, projectName);
    const result = graph.addEdges(edges);

    // Persist all edges (existing + newly added) to disk
    if (result.added > 0) {
      this.saveRelations(workspaceRoot, projectName, graph.getAllEdges());
    }

    return result;
  }

  /**
   * Save all edges to relations.jsonl (mirrors saveEntities pattern).
   * Overwrites the entire file with the current in-memory edge set.
   */
  public static saveRelations(workspaceRoot: string, projectName: string, edges: GraphEdge[]): void {
    const graphDir = resolveGraphDir(workspaceRoot, projectName);
    const relationsPath = join(graphDir, 'relations.jsonl');
    
    // Stop dual-write if edges > 5000 to save I/O
    if (edges.length <= 5000) {
      const content = edges.map(e => JSON.stringify(e)).join('\n') + '\n';
      const tmpPath = relationsPath + '.tmp';
      writeFileSync(tmpPath, content, 'utf-8');
      renameSync(tmpPath, relationsPath);
    } else {
      if (existsSync(relationsPath)) {
        try {
          require('node:fs').rmSync(relationsPath);
        } catch (e) {}
      }
    }
  }

  /**
   * Save enrichment metadata to metadata.json (P-Tracker v0.11.1).
   * Merges enrichmentStats into the existing metadata structure.
   */
  public static saveMetadata(workspaceRoot: string, projectName: string): void {
    const graph = this.getGraph(workspaceRoot, projectName);
    const graphDir = resolveGraphDir(workspaceRoot, projectName);
    const metadataPath = join(graphDir, 'metadata.json');

    // Get version from package.json — fallback to 'unknown' (not a hardcoded stale version)
    let version = 'unknown';
    try {
      const packageJsonPath = resolve(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.version) version = pkg.version;
    } catch (e) {}

    const metadata = graph.getMetadata(projectName, version);

    // MERGE-SAFE FIX (v0.15.6): When in-memory edges are empty (e.g. LRU cache eviction
    // between saveGraph() calls), computed resolution may be undefined or totalEdges=0.
    // Preserve the existing resolution block from disk to prevent data loss.
    const resolutionMissing = !metadata.resolution || metadata.resolution.totalEdges === 0;
    if (resolutionMissing && existsSync(metadataPath)) {
      try {
        const existing = JSON.parse(readFileSync(metadataPath, 'utf-8'));
        if (existing.resolution && existing.resolution.totalEdges > 0) {
          metadata.resolution = existing.resolution;
        }
      } catch (e) {
        // Ignore parse errors — proceed with computed (possibly zeroed) metadata
      }
    }

    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');

    if (graph.repository) {
      try {
        const db = (graph.repository as any).manager.getConnection();
        const stmt = db.prepare(`
          UPDATE project_snapshots 
          SET metrics = ? 
          WHERE project_name = ? AND timestamp = (
            SELECT MAX(timestamp) FROM project_snapshots WHERE project_name = ?
          )
        `);
        stmt.run(JSON.stringify({ healthScore: metadata.healthScore }), projectName, projectName);
      } catch (e) {
        console.error(`[GraphStore] Failed to update project_snapshots with metrics:`, e);
      }
    }
  }


  /**
   * Save the full graph (entities + relations + metadata) to disk.
   * Used after enrichment to ensure semantic data is not lost.
   */
  public static saveGraph(workspaceRoot: string, projectName: string): void {
    const graph = this.getGraph(workspaceRoot, projectName);
    this.saveEntities(workspaceRoot, projectName, graph.getAllNodes());
    this.saveRelations(workspaceRoot, projectName, graph.getAllEdges());
    this.saveMetadata(workspaceRoot, projectName);
    this.saveMemoryEvents(workspaceRoot, projectName);
    this.saveMemorySlices(workspaceRoot, projectName);
  }

  /**
   * Save all memory events to memory-events.jsonl (P11)
   */
  public static saveMemoryEvents(workspaceRoot: string, projectName: string): void {
    const graph = this.getGraph(workspaceRoot, projectName);
    const graphDir = resolveGraphDir(workspaceRoot, projectName);
    const eventsPath = join(graphDir, 'memory-events.jsonl');
    const tmpPath = eventsPath + '.tmp';
    const events = graph.getAllMemoryEvents();
    if (events.length > 0) {
      const content = events.map(e => JSON.stringify(e)).join('\n') + '\n';
      writeFileSync(tmpPath, content, 'utf-8');
      renameSync(tmpPath, eventsPath);
    }
  }

  /**
   * Save all semantic slices to memory-slices.jsonl (P11) with atomic write
   */
  public static saveMemorySlices(workspaceRoot: string, projectName: string): void {
    const graph = this.getGraph(workspaceRoot, projectName);
    const graphDir = resolveGraphDir(workspaceRoot, projectName);
    const slicesPath = join(graphDir, 'memory-slices.jsonl');
    const tmpPath = slicesPath + '.tmp';
    const slices = graph.getMemorySlices();
    if (slices.length > 0) {
      const content = slices.map(s => JSON.stringify(s)).join('\n') + '\n';
      writeFileSync(tmpPath, content, 'utf-8');
      renameSync(tmpPath, slicesPath);
    }
  }

  /**
   * Calculate project metrics and insert a new snapshot into SQLite.
   */
  public static insertSnapshot(workspaceRoot: string, projectName: string, unresolvedCount: number): ProjectSnapshot {
    const graph = this.getGraph(workspaceRoot, projectName);
    const stats = graph.getStats();
    
    const snapshot: ProjectSnapshot = {
      id: randomUUID(),
      projectName,
      timestamp: Date.now(),
      nodesCount: stats.nodeCount,
      edgesCount: stats.edgeCount,
      unresolvedCount
    };

    if (graph.repository) {
      try {
        const db = (graph.repository as any).manager.getConnection();
        const stmt = db.prepare(`
          INSERT INTO project_snapshots (id, project_name, timestamp, nodes_count, edges_count, unresolved_count)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(snapshot.id, snapshot.projectName, snapshot.timestamp, snapshot.nodesCount, snapshot.edgesCount, snapshot.unresolvedCount);
      } catch (e) {
        console.error(`[GraphStore] Failed to insert project snapshot:`, e);
      }
    }

    return snapshot;
  }

  public static setCustomMetadata(workspaceRoot: string, projectName: string, key: string, value: any): void {
    const graph = this.getGraph(workspaceRoot, projectName);
    if (graph.repository) {
      graph.repository.setCustomMetadata(key, value);
    }
  }

  public static getCustomMetadata(workspaceRoot: string, projectName: string, key: string): any {
    const graph = this.getGraph(workspaceRoot, projectName);
    if (graph.repository) {
      return graph.repository.getCustomMetadata(key);
    }
    return undefined;
  }

  public static clearCustomMetadata(workspaceRoot: string, projectName: string, key: string): void {
    const graph = this.getGraph(workspaceRoot, projectName);
    if (graph.repository) {
      graph.repository.clearCustomMetadata(key);
    }
  }
}

