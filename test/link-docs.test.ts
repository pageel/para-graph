import { describe, it, expect, beforeEach } from 'vitest';
import { CodeGraph } from '../src/graph/code-graph.js';
import { NodeType, ExportType } from '../src/graph/models.js';
import type { SemanticAttributes, GraphNode } from '../src/graph/models.js';

describe('CodeGraph.linkDocs()', () => {
  let graph: CodeGraph;

  beforeEach(() => {
    graph = new CodeGraph();
  });

  it('should link existing enriched node and populate docAnchors', () => {
    const semantic: SemanticAttributes = {
      summary: 'Test summary',
      complexity: 'low',
      domainConcepts: ['test'],
      enrichedAt: '2026-05-28T00:00:00Z',
      enrichedBy: 'agent',
    };

    const node: GraphNode = {
      id: 'src/foo.ts::foo',
      type: NodeType.FUNCTION,
      name: 'foo',
      filePath: 'src/foo.ts',
      startLine: 10,
      endLine: 20,
      exportType: ExportType.NAMED,
      signature: 'export function foo()',
      semantic,
    };

    graph.addNode(node);

    const result = graph.linkDocs([
      { nodeId: 'src/foo.ts::foo', docPath: 'docs/guide.md#foo-section' }
    ]);

    expect(result.linked).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors.length).toBe(0);

    const updatedNode = graph.getNode('src/foo.ts::foo');
    expect(updatedNode?.semantic?.docAnchors).toEqual(['docs/guide.md#foo-section']);
  });

  it('should skip linking for non-enriched node', () => {
    const node: GraphNode = {
      id: 'src/foo.ts::foo',
      type: NodeType.FUNCTION,
      name: 'foo',
      filePath: 'src/foo.ts',
      startLine: 10,
      endLine: 20,
      exportType: ExportType.NAMED,
      signature: 'export function foo()',
    };

    graph.addNode(node);

    const result = graph.linkDocs([
      { nodeId: 'src/foo.ts::foo', docPath: 'docs/guide.md#foo-section' }
    ]);

    expect(result.linked).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors.length).toBe(0);

    const updatedNode = graph.getNode('src/foo.ts::foo');
    expect(updatedNode?.semantic?.docAnchors).toBeUndefined();
  });

  it('should report error for non-existent node', () => {
    const result = graph.linkDocs([
      { nodeId: 'nonexistent::node', docPath: 'docs/guide.md#section' }
    ]);

    expect(result.linked).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Node not found');
  });

  it('should deduplicate same docPath for the same node', () => {
    const semantic: SemanticAttributes = {
      summary: 'Test summary',
      complexity: 'low',
      domainConcepts: ['test'],
      enrichedAt: '2026-05-28T00:00:00Z',
      enrichedBy: 'agent',
      docAnchors: ['docs/guide.md#foo-section'],
    };

    const node: GraphNode = {
      id: 'src/foo.ts::foo',
      type: NodeType.FUNCTION,
      name: 'foo',
      filePath: 'src/foo.ts',
      startLine: 10,
      endLine: 20,
      exportType: ExportType.NAMED,
      signature: 'export function foo()',
      semantic,
    };

    graph.addNode(node);

    const result = graph.linkDocs([
      { nodeId: 'src/foo.ts::foo', docPath: 'docs/guide.md#foo-section' }
    ]);

    expect(result.linked).toBe(1);
    const updatedNode = graph.getNode('src/foo.ts::foo');
    expect(updatedNode?.semantic?.docAnchors).toEqual(['docs/guide.md#foo-section']);
  });

  it('should normalize Windows backslashes in docPath', () => {
    const semantic: SemanticAttributes = {
      summary: 'Test summary',
      complexity: 'low',
      domainConcepts: ['test'],
      enrichedAt: '2026-05-28T00:00:00Z',
      enrichedBy: 'agent',
    };

    const node: GraphNode = {
      id: 'src/foo.ts::foo',
      type: NodeType.FUNCTION,
      name: 'foo',
      filePath: 'src/foo.ts',
      startLine: 10,
      endLine: 20,
      exportType: ExportType.NAMED,
      signature: 'export function foo()',
      semantic,
    };

    graph.addNode(node);

    const result = graph.linkDocs([
      { nodeId: 'src/foo.ts::foo', docPath: 'docs\\arch\\db.md#section' }
    ]);

    expect(result.linked).toBe(1);
    const updatedNode = graph.getNode('src/foo.ts::foo');
    expect(updatedNode?.semantic?.docAnchors).toEqual(['docs/arch/db.md#section']);
  });
});
