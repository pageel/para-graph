import { describe, it, expect, vi } from 'vitest';
import { registerTools } from '../../src/mcp/tools.js';
import { GraphStore } from '../../src/graph/store/GraphStore.js';
import { CodeGraph } from '../../src/graph/code-graph.js';
import * as pathResolver from '../../src/graph/store/pathResolver.js';
import { SqliteManager } from '../../src/graph/store/sqlite-manager.js';
import { writeFileSync } from 'node:fs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn((path) => {
      if (typeof path === 'string' && (path.includes('src/main.ts') || path.includes('src/utils/fuzzy-match.ts') || path.includes('src/utils/git-scanner.ts'))) {
        return true;
      }
      return actual.existsSync(path);
    }),
    readFileSync: vi.fn((path, options) => {
      if (typeof path === 'string' && path.includes('src/main.ts')) {
        return '// @para-doc [docs/spec.md#csa-old-anchor]\nexport function main() {}';
      }
      return actual.readFileSync(path, options);
    }),
    writeFileSync: vi.fn(),
  };
});

describe('MCP Tools: graph_expand_node', () => {
  it('should return incomplete and hint if sourceCode is <= 1 line', async () => {
    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };

    registerTools(mockServer as any, '/workspace');
    const expandNodeHandler = handlers['graph_expand_node'];
    expect(expandNodeHandler).toBeDefined();

    // Mock GraphStore and pathResolver
    const mockGraph = {
      getContextBundle: vi.fn().mockReturnValue({
        target: { id: 'node1', name: 'testNode', type: 'function', filePath: 'test.ts', startLine: 1, endLine: 1 },
        sourceCode: 'function testNode() {',
        truncated: false,
        callers: [],
        callees: [],
        imports: [],
        relatedTests: [],
        warnings: [],
        relatedMemory: []
      })
    };
    vi.spyOn(GraphStore, 'getGraph').mockReturnValue(mockGraph as any);
    vi.spyOn(pathResolver, 'resolveSourceDir').mockReturnValue('/workspace/repo');

    const result = await expandNodeHandler({ projectName: 'test', nodeId: 'node1' });
    const content = JSON.parse(result.content[0].text);

    expect(content.sourceCode).toBe('function testNode() {');
    expect(content.incomplete).toBe(true);
    expect(content.hint).toBeDefined();
    
    vi.restoreAllMocks();
  });
});

describe('MCP Tools: graph_god_nodes', () => {
  it('should return enrichableNodeCount and totalInGraph', async () => {
    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };

    registerTools(mockServer as any, '/workspace');
    const godNodesHandler = handlers['graph_god_nodes'];
    expect(godNodesHandler).toBeDefined();

    const nodes = [
      { id: 'file1', type: 'file' },
      { id: 'node1', type: 'function', semantic: {} }, // Enriched
      { id: 'node2', type: 'function' }, // Unenriched
      { id: 'node3', type: 'class' } // Unenriched
    ];
    const mockGraph = {
      getAllNodes: vi.fn().mockReturnValue(nodes),
      getNode: vi.fn().mockImplementation((id: string) => nodes.find(n => n.id === id)),
      getTopGodNodes: vi.fn().mockReturnValue([{
        id: 'node2',
        name: 'node2',
        type: 'function',
        filePath: 'test.ts',
        degree: 2,
        fanIn: 1,
        fanOut: 1,
        enriched: false
      }]),
      getAllEdges: vi.fn().mockReturnValue([
        { sourceId: 'node1', targetId: 'node2', relation: 'CALLS' },
        { sourceId: 'node2', targetId: 'node3', relation: 'CALLS' }
      ]),
      enrichmentStats: { totalEnriched: 1 }
    };
    vi.spyOn(GraphStore, 'getGraph').mockReturnValue(mockGraph as any);

    const result = await godNodesHandler({ projectName: 'test', topN: 10 });
    const content = JSON.parse(result.content[0].text);

    expect(content.totalInGraph).toBe(4);
    expect(content.enrichableNodeCount).toBe(3); // 4 total - 1 file
    expect(content.enrichmentStats.totalEnriched).toBe(1);
    
    vi.restoreAllMocks();
  });
});

describe('MCP Tools: memory_search', () => {
  it('should parse since string to timestamp and pass to searchEvents', async () => {
    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };

    registerTools(mockServer as any, '/workspace');
    const memorySearchHandler = handlers['memory_search'];

    const mockGraph = {
      searchMemory: vi.fn().mockReturnValue([])
    };
    vi.spyOn(GraphStore, 'getGraph').mockReturnValue(mockGraph as any);
    
    const isoString = '2026-05-01T00:00:00Z';
    await memorySearchHandler({ projectName: 'test', query: 'foo', limit: 10, since: isoString });

    const expectedSince = new Date(isoString).getTime();
    expect(mockGraph.searchMemory).toHaveBeenCalledWith('foo', 10, expectedSince, undefined);
    
    // Test invalid ISO string
    const resultInvalid = await memorySearchHandler({ projectName: 'test', query: 'foo', limit: 10, since: 'not-a-date' });
    expect(resultInvalid.isError).toBe(true);
    expect(resultInvalid.content[0].text).toContain('Invalid ISO 8601 timestamp');
    
    // Test includeArchived
    await memorySearchHandler({ projectName: 'test', query: 'foo', limit: 10, includeArchived: true });
    expect(mockGraph.searchMemory).toHaveBeenCalledWith('foo', 10, undefined, true);

    vi.restoreAllMocks();
  });
});

describe('MCP Tools: insight_validate', () => {
  it('should validate an existing insight and update its confidence', async () => {
    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };

    registerTools(mockServer as any, '/workspace');
    const validateHandler = handlers['insight_validate'];
    expect(validateHandler).toBeDefined();

    const mockInsight = {
      id: 'ins-1',
      category: 'lesson',
      domain: 'parser',
      title: 'Mock title',
      description: 'Mock desc',
      sourceType: 'bugfix',
      confidence: 'hypothesis',
      createdAt: 12345,
      updatedAt: 12345
    };

    const mockGraph = {
      getInsight: vi.fn().mockReturnValue(mockInsight),
      pushInsight: vi.fn()
    };
    vi.spyOn(GraphStore, 'getGraph').mockReturnValue(mockGraph as any);
    vi.spyOn(GraphStore, 'saveGraph').mockImplementation(() => {});

    const result = await validateHandler({
      projectName: 'test',
      insightId: 'ins-1',
      confidence: 'validated'
    });

    const content = JSON.parse(result.content[0].text);
    expect(content.success).toBe(true);
    expect(content.insight.confidence).toBe('validated');
    expect(content.insight.validatedAt).toBeDefined();
    expect(mockGraph.pushInsight).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('should return error if insight is not found', async () => {
    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };

    registerTools(mockServer as any, '/workspace');
    const validateHandler = handlers['insight_validate'];

    const mockGraph = {
      getInsight: vi.fn().mockReturnValue(null),
      pushInsight: vi.fn()
    };
    vi.spyOn(GraphStore, 'getGraph').mockReturnValue(mockGraph as any);

    const result = await validateHandler({
      projectName: 'test',
      insightId: 'ins-nonexistent',
      confidence: 'validated'
    });

    expect(result.isError).toBe(true);
    const content = JSON.parse(result.content[0].text);
    expect(content.error).toContain('not found');

    vi.restoreAllMocks();
  });
});

describe('MCP Tools: graph_audit_csa', () => {
  it('should return csa audit results', async () => {
    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };

    registerTools(mockServer as any, '/workspace');
    const auditCsaHandler = handlers['graph_audit_csa'];
    expect(auditCsaHandler).toBeDefined();

    const mockAuditResult = {
      totalAnchors: 10,
      coveredAnchors: 9,
      coverageRate: 90.0,
      danglingEdges: []
    };

    const initSchemaSpy = vi.spyOn(SqliteManager.prototype, 'initSchema').mockImplementation(() => {});
    const runCsaAuditSpy = vi.spyOn(SqliteManager.prototype, 'runCsaAudit').mockReturnValue(mockAuditResult as any);
    const closeSpy = vi.spyOn(SqliteManager.prototype, 'close').mockImplementation(() => {});

    const result = await auditCsaHandler({ projectName: 'test-project' });
    const content = JSON.parse(result.content[0].text);

    expect(content.totalAnchors).toBe(10);
    expect(content.coverageRate).toBe(90.0);
    expect(initSchemaSpy).toHaveBeenCalled();
    expect(runCsaAuditSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

describe('MCP Tools: graph_fix_csa', () => {
  it('should run csa self-healing fix', async () => {
    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };

    registerTools(mockServer as any, '/workspace');
    const fixCsaHandler = handlers['graph_fix_csa'];
    expect(fixCsaHandler).toBeDefined();

    const mockAuditResult = {
      totalAnchors: 10,
      coveredAnchors: 8,
      coverageRate: 80.0,
      danglingEdges: [
        {
          sourceId: 'src/main.ts::main',
          targetId: 'csa-old-anchor',
          relation: 'documented_by',
          sourceFile: 'src/main.ts',
          sourceLine: 1
        }
      ]
    };

    const initSchemaSpy = vi.spyOn(SqliteManager.prototype, 'initSchema').mockImplementation(() => {});
    const runCsaAuditSpy = vi.spyOn(SqliteManager.prototype, 'runCsaAudit').mockReturnValue(mockAuditResult as any);
    const closeSpy = vi.spyOn(SqliteManager.prototype, 'close').mockImplementation(() => {});

    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([{ id: 'csa-new-anchor' }])
      })
    };
    vi.spyOn(SqliteManager.prototype, 'getConnection').mockReturnValue(mockDb as any);

    const result = await fixCsaHandler({ projectName: 'test-project', dryRun: false });
    const content = JSON.parse(result.content[0].text);

    expect(content.success).toBe(true);
    expect(content.fixedCount).toBe(1);
    expect(content.repairsApplied[0].oldAnchor).toBe('csa-old-anchor');
    expect(content.repairsApplied[0].newAnchor).toBe('csa-new-anchor');
    expect(writeFileSync).toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
