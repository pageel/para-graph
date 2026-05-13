import { describe, it, expect, vi } from 'vitest';
import { GraphStore } from '../../../src/graph/store/GraphStore.js';
import * as fs from 'node:fs';


import Database from 'better-sqlite3';
import { SqliteManager } from '../../../src/graph/store/sqlite-manager.js';
SqliteManager.DatabaseConstructor = Database;

describe('GraphStore Refactoring', () => {
  it('should initialize SqliteGraphRepository when loading a graph', () => {
    // Clear cache
    GraphStore.flushGraph('test-refactor');
    
    // Let it naturally not find the files
    
    const graph = GraphStore.getGraph(process.cwd(), 'test-refactor');
    
    // It should have instantiated a repository
    expect(graph.repository).toBeDefined();
    
    vi.restoreAllMocks();
  });

  it('should auto-convert large JSONL to DB in background without blocking', async () => {
    const testProject = 'jsonl-convert-test';
    const workspaceRoot = process.cwd();
    const graphDir = require('node:path').join(workspaceRoot, 'Projects', testProject, '.beads', 'graph');
    
    // Setup directory
    if (!fs.existsSync(graphDir)) fs.mkdirSync(graphDir, { recursive: true });
    
    GraphStore.flushGraph(testProject);
    const entitiesPath = require('node:path').join(graphDir, 'entities.jsonl');
    
    // Create duplicate IDs to test self-healing (INSERT OR REPLACE)
    const nodes = [
      { id: 'n1', name: 'Node 1', type: 'class', created_at: 100, updated_at: 100 },
      { id: 'n2', name: 'Node 2', type: 'class', created_at: 100, updated_at: 100 },
      { id: 'n1', name: 'Node 1 Updated', type: 'class', created_at: 200, updated_at: 200 }
    ];
    
    const jsonl = nodes.map(n => JSON.stringify(n)).join('\n') + '\n';
    fs.writeFileSync(entitiesPath, jsonl, 'utf-8');
    
    const dbPath = require('node:path').join(graphDir, `${testProject}.db`);
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
    
    const start = Date.now();
    const graph = GraphStore.getGraph(workspaceRoot, testProject);
    const end = Date.now();
    
    // Expect the function to return quickly (asynchronous DB insert)
    expect(end - start).toBeLessThan(500); 
    
    // Wait for the background transaction to complete
    await new Promise(r => setTimeout(r, 100));
    
    expect(graph.repository).toBeDefined();
    const nodesInDb = Array.from(graph.repository!.getAllNodes());
    
    expect(nodesInDb.length).toBe(2);
    expect(nodesInDb.find(n => n.id === 'n1')?.name).toBe('Node 1 Updated');
    
    if (fs.existsSync(entitiesPath)) fs.rmSync(entitiesPath);
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
  });

  it('should use atomic write and stop dual-write if nodes exceed 5000', () => {
    const testProject = 'atomic-write-test';
    const workspaceRoot = process.cwd();
    const graphDir = require('node:path').join(workspaceRoot, 'Projects', testProject, '.beads', 'graph');
    if (!fs.existsSync(graphDir)) fs.mkdirSync(graphDir, { recursive: true });
    
    const entitiesPath = require('node:path').join(graphDir, 'entities.jsonl');
    if (fs.existsSync(entitiesPath)) fs.rmSync(entitiesPath);
    
    // Create 5001 nodes
    const nodes = [];
    for (let i = 0; i < 5001; i++) {
      nodes.push({ id: `n${i}`, name: `Node ${i}`, type: 'class', created_at: 100, updated_at: 100 } as any);
    }
    
    GraphStore.saveEntities(workspaceRoot, testProject, nodes);
    
    // Dual write should be stopped, so entities.jsonl should not exist
    expect(fs.existsSync(entitiesPath)).toBe(false);
    
    // Test atomic write with < 5000 nodes
    const smallNodes = nodes.slice(0, 10);
    
    GraphStore.saveEntities(workspaceRoot, testProject, smallNodes);
    
    // Should use atomic write (tmp -> rename), meaning the final file exists
    expect(fs.existsSync(entitiesPath)).toBe(true);
    
    if (fs.existsSync(entitiesPath)) fs.rmSync(entitiesPath);
  });
});
