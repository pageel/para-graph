import { resolve, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ProjectGraph } from './ProjectGraph.js';
import type { GraphNode, GraphEdge } from '../models.js';

export class GraphStore {
  private static readonly MAX_CAPACITY = 3;
  private static readonly cache = new Map<string, ProjectGraph>();

  /**
   * Get the graph for a specific project.
   * If it's in the cache, moves it to the end (most recently used).
   * If not, loads it from disk and adds it to cache.
   */
  public static getGraph(workspaceRoot: string, projectName: string): ProjectGraph {
    if (this.cache.has(projectName)) {
      // Move to end (most recently used)
      const graph = this.cache.get(projectName)!;
      this.cache.delete(projectName);
      this.cache.set(projectName, graph);
      return graph;
    }

    // Cache Miss -> Load from disk
    const graph = this.loadFromDisk(workspaceRoot, projectName);

    // Evict if over capacity
    if (this.cache.size >= this.MAX_CAPACITY) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(projectName, graph);
    return graph;
  }

  public static flushGraph(projectName: string): void {
    this.cache.delete(projectName);
  }

  private static loadFromDisk(workspaceRoot: string, projectName: string): ProjectGraph {
    const graph = new ProjectGraph(projectName);
    const graphDir = resolve(workspaceRoot, 'Projects', projectName, '.beads', 'graph');

    // Load entities
    const entitiesPath = join(graphDir, 'entities.jsonl');
    if (existsSync(entitiesPath)) {
      const content = readFileSync(entitiesPath, 'utf-8').trim();
      if (content.length > 0) {
        content.split('\n').forEach(line => {
          graph.addNode(JSON.parse(line) as GraphNode);
        });
      }
    }

    // Load relations
    const relationsPath = join(graphDir, 'relations.jsonl');
    if (existsSync(relationsPath)) {
      const content = readFileSync(relationsPath, 'utf-8').trim();
      if (content.length > 0) {
        content.split('\n').forEach(line => {
          graph.addEdge(JSON.parse(line) as GraphEdge);
        });
      }
    }

    return graph;
  }

  public static saveEntities(workspaceRoot: string, projectName: string, entities: GraphNode[]): void {
    const graphDir = resolve(workspaceRoot, 'Projects', projectName, '.beads', 'graph');
    const entitiesPath = join(graphDir, 'entities.jsonl');
    const content = entities.map(n => JSON.stringify(n)).join('\n') + '\n';
    writeFileSync(entitiesPath, content, 'utf-8');
    
    // Also update the cache if it exists
    if (this.cache.has(projectName)) {
      const graph = this.cache.get(projectName)!;
      for (const entity of entities) {
        graph.updateNode(entity);
      }
    }
  }
}
