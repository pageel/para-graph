import { describe, it, expect } from 'vitest';
import { CodeGraph } from '../../src/graph/code-graph.js';
import { NodeType, ExportType, isTestNode } from '../../src/graph/models.js';

describe('Graph Metrics & Path Compatibility', () => {
  it('should correctly classify core/extra enriched nodes', () => {
    const graph = new CodeGraph();
    
    // Core nodes
    graph.addNode({ id: 'src/a.ts::A', name: 'A', type: NodeType.FUNCTION, filePath: 'src/a.ts', startLine: 1, endLine: 5, exportType: ExportType.NONE, signature: '' });
    graph.addNode({ id: 'src/b.ts::B', name: 'B', type: NodeType.FUNCTION, filePath: 'src/b.ts', startLine: 1, endLine: 5, exportType: ExportType.NONE, signature: '' });
    // Test node
    graph.addNode({ id: 'test/a.test.ts::Test', name: 'Test', type: NodeType.FUNCTION, filePath: 'test/a.test.ts', startLine: 1, endLine: 5, exportType: ExportType.NONE, signature: '' });
    
    // Enrich all 3 nodes
    graph.enrichNode('src/a.ts::A', { summary: 'A', complexity: 'low', domainConcepts: [], enrichedAt: '', enrichedBy: 'agent' });
    graph.enrichNode('src/b.ts::B', { summary: 'B', complexity: 'low', domainConcepts: [], enrichedAt: '', enrichedBy: 'agent' });
    graph.enrichNode('test/a.test.ts::Test', { summary: 'Test', complexity: 'low', domainConcepts: [], enrichedAt: '', enrichedBy: 'agent' });
    
    const meta = graph.getMetadata('test-project', '1.0.0');
    expect(meta.enrichableNodeCount).toBe(2);
    expect(meta.enrichment?.coreEnriched).toBe(2);
    expect(meta.enrichment?.extraEnriched).toBe(1);
    expect(meta.enrichment?.totalEnriched).toBe(3);
    expect(meta.healthScore).toBe(100);
  });

  it('should resolve isTestNode accurately on both Windows and POSIX paths', () => {
    // POSIX paths
    expect(isTestNode('test/a.test.ts')).toBe(true);
    expect(isTestNode('src/test/a.ts')).toBe(false);
    expect(isTestNode('src/fixtures/mock.ts')).toBe(true);
    expect(isTestNode('test/fixtures/python/sample.py')).toBe(true);
    
    // Windows paths (backslashes)
    expect(isTestNode('test\\a.test.ts')).toBe(true);
    expect(isTestNode('src\\test\\a.ts')).toBe(false);
    expect(isTestNode('src\\fixtures\\mock.ts')).toBe(true);
    expect(isTestNode('test\\fixtures\\python\\sample.py')).toBe(true);
  });

  it('should handle zero enrichableNodeCount gracefully (Zero Denominator Boundary)', () => {
    const graph = new CodeGraph();
    // Only file node (not enrichable) and test node (not enrichable)
    graph.addNode({ id: 'src/a.ts', name: 'src/a.ts', type: NodeType.FILE, filePath: 'src/a.ts', startLine: 1, endLine: 50, exportType: ExportType.NONE, signature: '' });
    graph.addNode({ id: 'test/a.test.ts::Test', name: 'Test', type: NodeType.FUNCTION, filePath: 'test/a.test.ts', startLine: 1, endLine: 5, exportType: ExportType.NONE, signature: '' });

    const meta = graph.getMetadata('test-empty', '1.0.0');
    expect(meta.enrichableNodeCount).toBe(0);
    expect(meta.healthScore).toBe(100); // 100% health for no core files to enrich
  });
});
