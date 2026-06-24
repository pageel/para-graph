import { describe, it, expect, beforeEach } from 'vitest';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodeGraph } from '../src/graph/code-graph.js';
import { TreeSitterParser } from '../src/parser/tree-sitter-parser.js';
import { EdgeRelation } from '../src/graph/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

describe('TreeSitterParser CSA comments extraction', () => {
  let graph: CodeGraph;
  let parser: TreeSitterParser;

  beforeEach(() => {
    graph = new CodeGraph();
    parser = new TreeSitterParser(FIXTURES_DIR);
  });

  it('should parse para-doc comments and add DOCUMENTED_BY edges', () => {
    const filePath = join(FIXTURES_DIR, 'csa-comments.ts');
    parser.parseFile(filePath, graph);

    const edges = graph.getAllEdges().filter(e => e.relation === EdgeRelation.DOCUMENTED_BY);
    expect(edges).toHaveLength(6);

    // 0. Spec anchor file-level edge
    const specEdge = edges.find(e => e.targetId === 'csa-test/fixtures/csa-comments.ts');
    expect(specEdge).toBeDefined();
    expect(specEdge?.sourceId).toBe('csa-comments.ts');

    // 1. File-level edge
    const fileEdge = edges.find(e => e.targetId === 'csa-file-level');
    expect(fileEdge).toBeDefined();
    expect(fileEdge?.sourceId).toBe('csa-comments.ts');

    // 2. Class-level edge (spec-anchor spec)
    const classSpecEdge = edges.find(e => e.targetId === 'csa-OrderProcessor');
    expect(classSpecEdge).toBeDefined();
    expect(classSpecEdge?.sourceId).toBe('csa-comments.ts::OrderProcessor');

    // 3. Class-level edge (doc spec)
    const classEdge = edges.find(e => e.targetId === 'csa-class-level');
    expect(classEdge).toBeDefined();
    expect(classEdge?.sourceId).toBe('csa-comments.ts::OrderProcessor');

    // 4. Method-level edge (spec-anchor spec)
    const methodSpecEdge = edges.find(e => e.targetId === 'csa-OrderProcessor.process');
    expect(methodSpecEdge).toBeDefined();
    expect(methodSpecEdge?.sourceId).toBe('csa-comments.ts::OrderProcessor.process');

    // 5. Method-level edge (doc spec)
    const methodEdge = edges.find(e => e.targetId === 'csa-method-level');
    expect(methodEdge).toBeDefined();
    expect(methodEdge?.sourceId).toBe('csa-comments.ts::OrderProcessor.process');
  });
});
