import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteManager } from '../src/graph/store/sqlite-manager.js';
import { SqliteGraphRepository } from '../src/graph/store/sqlite-repository.js';
import { ProjectGraph } from '../src/graph/store/ProjectGraph.js';
import type { ProjectInsight } from '../src/graph/models.js';
import Database from 'better-sqlite3';

SqliteManager.DatabaseConstructor = Database;

describe('Project Insights Store and Search (P5)', () => {
  let dbManager: SqliteManager;
  let graph: ProjectGraph;

  beforeEach(() => {
    // 1. Setup in-memory SQLite Database
    dbManager = new SqliteManager('test-project', ':memory:');
    dbManager.initSchema();

    // 2. Setup ProjectGraph
    graph = new ProjectGraph('test-project');
    graph.repository = new SqliteGraphRepository(dbManager);
  });

  afterEach(() => {
    graph.close();
  });

  it('should push a valid insight to SQLite and retrieve it via search', () => {
    const insight: ProjectInsight = {
      id: 'ins-1',
      category: 'lesson',
      domain: 'path-handling',
      title: 'Normalize paths on Windows',
      description: 'Always replace double backslashes with forward slashes in path normalization to prevent OS bugs.',
      sourceType: 'bugfix',
      sourceSession: 'session-2026-05-28',
      relatedNodeIds: ['node-1'],
      relatedFiles: ['src/utils.ts'],
      confidence: 'validated',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    graph.pushInsight(insight);

    // Verify row exists directly in database
    const db = dbManager.getConnection();
    const row = db.prepare('SELECT * FROM project_insights WHERE id = ?').get('ins-1') as any;
    expect(row).toBeDefined();
    expect(row.title).toBe('Normalize paths on Windows');
    expect(row.category).toBe('lesson');

    // Search via ProjectGraph using FTS5 MATCH
    const results = graph.searchInsights('Windows');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('ins-1');
    expect(results[0].title).toBe('Normalize paths on Windows');
  });

  it('should filter search results by category and domain', () => {
    const i1: ProjectInsight = {
      id: 'ins-1',
      category: 'lesson',
      domain: 'path-handling',
      title: 'Normalize paths on Windows',
      description: 'Paths must be normalized.',
      sourceType: 'bugfix',
      confidence: 'hypothesis',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const i2: ProjectInsight = {
      id: 'ins-2',
      category: 'risk',
      domain: 'sqlite',
      title: 'SQLite database locking',
      description: 'Concurrent writes might fail due to database locking on Windows.',
      sourceType: 'brainstorm',
      confidence: 'hypothesis',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    graph.pushInsight(i1);
    graph.pushInsight(i2);

    // Search with category filter
    const searchCategory = graph.searchInsights('paths', { category: 'lesson' });
    expect(searchCategory.length).toBe(1);
    expect(searchCategory[0].id).toBe('ins-1');

    // Search with domain filter
    const searchDomain = graph.searchInsights('database', { domain: 'sqlite' });
    expect(searchDomain.length).toBe(1);
    expect(searchDomain[0].id).toBe('ins-2');

    // Search domain mismatch
    const searchMismatch = graph.searchInsights('database', { domain: 'path-handling' });
    expect(searchMismatch.length).toBe(0);
  });

  it('should fallback to in-memory search if SQLite repository is missing', () => {
    const inMemoryGraph = new ProjectGraph('in-memory-project');
    // Note: repository is not set

    const insight: ProjectInsight = {
      id: 'ins-memory',
      category: 'decision',
      domain: 'mcp',
      title: 'Use option 5 for semantic layer',
      description: 'Unified semantic layer is chosen to map nodes.',
      sourceType: 'brainstorm',
      confidence: 'validated',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    inMemoryGraph.pushInsight(insight);

    const results = inMemoryGraph.searchInsights('option 5');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('ins-memory');
    expect(results[0].title).toBe('Use option 5 for semantic layer');
  });
});
