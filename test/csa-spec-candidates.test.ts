import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { registerTools } from '../src/mcp/tools.js';
import { GraphStore } from '../src/graph/store/GraphStore.js';
import { NodeType, ExportType, EdgeRelation } from '../src/graph/models.js';
import { SqliteManager } from '../src/graph/store/sqlite-manager.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('CSA Spec Candidates & suggestedAnchorId', () => {
  const sandboxDir = join(process.cwd(), 'test-sandbox-candidates');

  beforeAll(() => {
    mkdirSync(sandboxDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(sandboxDir, { recursive: true, force: true });
  });

  it('should classify candidates correctly and calculate projectedRate', async () => {
    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };

    registerTools(mockServer as any, sandboxDir);
    const candidatesHandler = handlers['graph_spec_candidates'];
    expect(candidatesHandler).toBeDefined();

    // Create a mock graph containing covered and uncovered nodes
    const mockNodes = [
      // 1. Covered node
      {
        id: 'src/graph/store/sqlite-manager.ts::SqliteManager',
        name: 'SqliteManager',
        type: NodeType.CLASS,
        filePath: 'src/graph/store/sqlite-manager.ts',
        startLine: 10,
        endLine: 200,
        exportType: ExportType.NAMED,
        signature: 'export class SqliteManager',
      },
      // 2. Uncovered Category A (Public class, exported)
      {
        id: 'src/mcp/tools.ts::McpToolsHelper',
        name: 'McpToolsHelper',
        type: NodeType.CLASS,
        filePath: 'src/mcp/tools.ts',
        startLine: 1,
        endLine: 50,
        exportType: ExportType.NAMED,
        signature: 'export class McpToolsHelper',
      },
      // 3. Uncovered Category B (Non-exported, low complexity, low degree)
      {
        id: 'src/parser/csa-parser.ts::internalHelper',
        name: 'internalHelper',
        type: NodeType.FUNCTION,
        filePath: 'src/parser/csa-parser.ts',
        startLine: 12,
        endLine: 15,
        exportType: ExportType.NONE,
        signature: 'function internalHelper()',
        semantic: { complexity: 'low' },
      },
      // 4. Covered spec anchor
      {
        id: 'csa-store-sqlite-manager',
        name: 'csa-store-sqlite-manager',
        type: NodeType.SPEC_ANCHOR,
        filePath: 'artifacts/specs/spec-sample.md',
      }
    ];

    const mockEdges = [
      // SqliteManager is covered by csa-store-sqlite-manager
      {
        sourceId: 'src/graph/store/sqlite-manager.ts::SqliteManager',
        targetId: 'csa-store-sqlite-manager',
        relation: EdgeRelation.DOCUMENTED_BY,
        sourceFile: 'src/graph/store/sqlite-manager.ts',
      }
    ];

    // Mock GraphStore.getGraph
    const mockGraph = {
      getAllNodes: () => mockNodes,
      getAllEdges: () => mockEdges,
      getNode: (id: string) => mockNodes.find(n => n.id === id),
      repository: null,
      close: () => {},
    };

    const getGraphSpy = vi.spyOn(GraphStore, 'getGraph').mockReturnValue(mockGraph as any);

    // Mock SqliteManager
    const dbPath = join(sandboxDir, 'candidates-test.db');
    const manager = new SqliteManager('mock-proj', dbPath);
    manager.initSchema();
    manager.persistGraph(mockNodes, mockEdges);

    const rawDb = manager.getConnection();
    const mockManagerConstructor = vi.spyOn(SqliteManager.prototype, 'getConnection').mockReturnValue(rawDb);

    try {
      const result = await candidatesHandler({
        projectName: 'mock-proj',
        scope: 'uncovered',
        tier: 'all',
        limit: 10
      });

      const response = JSON.parse(result.content[0].text);
      console.log('response:', response);
      expect(response.candidates).toBeDefined();
      expect(response.candidates).toHaveLength(2); // McpToolsHelper, internalHelper

      // Check Category A candidate
      const catA = response.candidates.find((c: any) => c.name === 'McpToolsHelper');
      expect(catA).toBeDefined();
      expect(catA.suggestedCategory).toBe('A');
      expect(catA.suggestedAnchorId).toBe('csa-mcp-mcp-tools-helper');
      expect(catA.weightTier).toBe('medium'); // class defaults to medium
      expect(catA.weight).toBe(2.0);

      // Check Category B candidate
      const catB = response.candidates.find((c: any) => c.name === 'internalHelper');
      expect(catB).toBeDefined();
      expect(catB.suggestedCategory).toBe('B');
      expect(catB.suggestedAnchorId).toBe('csa-parser-internal-helper');
      expect(catB.weightTier).toBe('low'); // complexity low defaults to low
      expect(catB.weight).toBe(0.5);

      // Check projected coverage Rate calculation
      expect(response.weightedCoverageImpact).toBeDefined();
      expect(response.weightedCoverageImpact.projectedRate).toBeGreaterThanOrEqual(0);

    } finally {
      manager.close();
      getGraphSpy.mockRestore();
      mockManagerConstructor.mockRestore();
    }
  });

  it('should suffix duplicate anchor IDs to ensure uniqueness', async () => {
    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };

    registerTools(mockServer as any, sandboxDir);
    const candidatesHandler = handlers['graph_spec_candidates'];

    // Setup mock graph where we suggest an anchor ID that already exists in DB
    const mockNodes = [
      {
        id: 'src/mcp/tools.ts::McpToolsHelper',
        name: 'McpToolsHelper',
        type: NodeType.CLASS,
        filePath: 'src/mcp/tools.ts',
        startLine: 1,
        endLine: 50,
        exportType: ExportType.NAMED,
        signature: 'export class McpToolsHelper',
      },
      // Conflict anchor ID already exists in DB
      {
        id: 'csa-mcp-mcp-tools-helper',
        name: 'csa-mcp-mcp-tools-helper',
        type: NodeType.SPEC_ANCHOR,
        filePath: 'artifacts/specs/spec-sample.md',
      },
      // Uncovered identical name entity in another file, which would also generate csa-mcp-mcp-tools-helper
      {
        id: 'src/mcp/other.ts::McpToolsHelper',
        name: 'McpToolsHelper',
        type: NodeType.CLASS,
        filePath: 'src/mcp/other.ts',
        startLine: 1,
        endLine: 50,
        exportType: ExportType.NAMED,
        signature: 'export class McpToolsHelper',
      }
    ];

    const mockGraph = {
      getAllNodes: () => mockNodes,
      getAllEdges: () => [],
      getNode: (id: string) => mockNodes.find(n => n.id === id),
      repository: null,
      close: () => {},
    };

    const getGraphSpy = vi.spyOn(GraphStore, 'getGraph').mockReturnValue(mockGraph as any);

    const dbPath = join(sandboxDir, 'uniqueness-test.db');
    const manager = new SqliteManager('mock-proj', dbPath);
    manager.initSchema();
    manager.persistGraph(mockNodes, []);

    const rawDb = manager.getConnection();
    const mockManagerConstructor = vi.spyOn(SqliteManager.prototype, 'getConnection').mockReturnValue(rawDb);

    try {
      const result = await candidatesHandler({
        projectName: 'mock-proj',
        scope: 'uncovered',
        tier: 'all',
        limit: 10
      });

      const response = JSON.parse(result.content[0].text);
      
      const firstCand = response.candidates.find((c: any) => c.filePath === 'src/mcp/tools.ts');
      const secondCand = response.candidates.find((c: any) => c.filePath === 'src/mcp/other.ts');

      expect(firstCand.suggestedAnchorId).toBe('csa-mcp-mcp-tools-helper-2');
      expect(firstCand.rationale).toContain('already exists');
      expect(secondCand.suggestedAnchorId).toBe('csa-mcp-mcp-tools-helper-3');
    } finally {
      manager.close();
      getGraphSpy.mockRestore();
      mockManagerConstructor.mockRestore();
    }
  });
});
