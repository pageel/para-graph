import { describe, it, expect, vi } from 'vitest';
import { registerTools } from '../../src/mcp/tools.js';
import { GraphStore } from '../../src/graph/store/GraphStore.js';
import { CodeGraph } from '../../src/graph/code-graph.js';
import * as pathResolver from '../../src/graph/store/pathResolver.js';

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
