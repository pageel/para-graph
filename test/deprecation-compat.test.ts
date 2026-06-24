import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { registerTools } from '../src/mcp/tools.js';
import { GraphStore } from '../src/graph/store/GraphStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DIR = resolve(__dirname, '.test-output', 'deprecation-compat');

describe('Deprecation and Compatibility Tests', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('should return error indicating graph_link_docs is deprecated and disabled', async () => {
    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };

    registerTools(mockServer as any, TEST_DIR);
    const linkDocsHandler = handlers['graph_link_docs'];
    expect(linkDocsHandler).toBeDefined();

    const result = await linkDocsHandler({
      projectName: 'test',
      links: [
        { nodeId: 'node1', docPath: 'docs/test.md' }
      ]
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('graph_link_docs MCP tool is deprecated and disabled');
  });

  it('should accept docAnchors in graph_enrich and preserve it in semantic data', async () => {
    const handlers: Record<string, any> = {};
    const mockServer = {
      tool: (name: string, desc: string, schema: any, handler: any) => {
        handlers[name] = handler;
      }
    };

    registerTools(mockServer as any, TEST_DIR);
    const enrichHandler = handlers['graph_enrich'];
    expect(enrichHandler).toBeDefined();

    const mockNode = {
      id: 'node1',
      name: 'node1',
      type: 'function',
      filePath: 'src/main.ts',
      semantic: {}
    };

    const mockGraph = {
      getNode: vi.fn().mockReturnValue(mockNode),
      enrichNode: vi.fn().mockImplementation((nodeId, data) => {
        mockNode.semantic = { ...mockNode.semantic, ...data };
        return mockNode;
      }),
      enrichmentStats: { totalEnriched: 1 }
    };
    vi.spyOn(GraphStore, 'getGraph').mockReturnValue(mockGraph as any);
    vi.spyOn(GraphStore, 'saveGraph').mockImplementation(() => {});

    const result = await enrichHandler({
      projectName: 'test',
      nodeId: 'node1',
      summary: 'Test summary',
      complexity: 'low',
      domainConcepts: ['test'],
      docAnchors: ['docs/test.md']
    });

    const content = JSON.parse(result.content[0].text);
    expect(content.updatedNode.semantic.docAnchors).toContain('docs/test.md');
  });
});
