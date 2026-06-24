import { describe, it, expect, beforeEach } from 'vitest';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodeGraph } from '../src/graph/code-graph.js';
import { TreeSitterParser } from '../src/parser/tree-sitter-parser.js';
import { EdgeRelation } from '../src/graph/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

describe('CSA ID Resolution - AST Parser Comments Extraction', () => {
  let graph: CodeGraph;
  let parser: TreeSitterParser;

  beforeEach(() => {
    graph = new CodeGraph();
    parser = new TreeSitterParser(FIXTURES_DIR);
  });

  it('should parse both short and long @para-doc comments and add correct DOCUMENTED_BY edges', () => {
    const filePath = join(FIXTURES_DIR, 'csa-short-syntax.ts');
    parser.parseFile(filePath, graph);

    const edges = graph.getAllEdges().filter(e => e.relation === EdgeRelation.DOCUMENTED_BY);
    
    // We expect 6 edges: 3 from short syntax, 3 from long syntax
    expect(edges).toHaveLength(6);

    // Verify Short Syntax edges
    const shortFileEdge = edges.find(e => e.targetId === 'csa-short-file-level');
    expect(shortFileEdge).toBeDefined();
    expect(shortFileEdge?.sourceId).toBe('csa-short-syntax.ts');

    const shortClassEdge = edges.find(e => e.targetId === 'csa-short-class-level');
    expect(shortClassEdge).toBeDefined();
    expect(shortClassEdge?.sourceId).toBe('csa-short-syntax.ts::ShortProcessor');

    const shortMethodEdge = edges.find(e => e.targetId === 'csa-short-method-level');
    expect(shortMethodEdge).toBeDefined();
    expect(shortMethodEdge?.sourceId).toBe('csa-short-syntax.ts::ShortProcessor.run');

    // Verify Long Syntax edges (still resolved to short IDs after stripping filepath)
    const longFileEdge = edges.find(e => e.targetId === 'csa-long-file-level');
    expect(longFileEdge).toBeDefined();
    expect(longFileEdge?.sourceId).toBe('csa-short-syntax.ts');

    const longClassEdge = edges.find(e => e.targetId === 'csa-long-class-level');
    expect(longClassEdge).toBeDefined();
    expect(longClassEdge?.sourceId).toBe('csa-short-syntax.ts::ShortProcessor');

    const longMethodEdge = edges.find(e => e.targetId === 'csa-long-method-level');
    expect(longMethodEdge).toBeDefined();
    expect(longMethodEdge?.sourceId).toBe('csa-short-syntax.ts::ShortProcessor.run');
  });
});
