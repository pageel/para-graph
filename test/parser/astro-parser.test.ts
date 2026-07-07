import { describe, it, expect, beforeEach } from 'vitest';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodeGraph } from '../../src/graph/code-graph.js';
import { TreeSitterParser } from '../../src/parser/tree-sitter-parser.js';
import { getProfile } from '../../src/parser/registry.js';
import { NodeType, EdgeRelation } from '../../src/graph/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, '../fixtures');

describe('TreeSitterParser Astro Parser Support (FEAT-15)', () => {
  let graph: CodeGraph;
  let parser: TreeSitterParser;

  beforeEach(() => {
    graph = new CodeGraph();
    parser = new TreeSitterParser(FIXTURES_DIR);
  });

  it('should successfully register astro extension in registry', () => {
    const profile = getProfile('.astro');
    expect(profile).toBeDefined();
    expect(profile?.name).toBe('astro');
    expect(profile?.parserModule).toBe('');
  });

  it('should extract CSA comments from both frontmatter and HTML templates in .astro file', () => {
    const filePath = join(FIXTURES_DIR, 'csa-comments.astro');
    parser.parseFile(filePath, graph);

    const edges = graph.getAllEdges().filter(e => e.relation === EdgeRelation.DOCUMENTED_BY);
    
    // Should find csa-astro-test-suite (frontmatter) and csa-astro-html-template (HTML)
    const frontmatterEdge = edges.find(e => e.targetId === '#csa-astro-test-suite');
    expect(frontmatterEdge).toBeDefined();
    expect(frontmatterEdge?.sourceId).toBe('csa-comments.astro');

    const htmlEdge = edges.find(e => e.targetId === '#csa-astro-html-template');
    expect(htmlEdge).toBeDefined();
    expect(htmlEdge?.sourceId).toBe('csa-comments.astro');
  });

  it('should parse frontmatter TypeScript and extract imports, calls and entities with correct line alignment', () => {
    const filePath = join(FIXTURES_DIR, 'csa-comments.astro');
    parser.parseFile(filePath, graph);

    // 1. Verify Entity extraction (greet function)
    const nodes = graph.getAllNodes();
    const greetFn = nodes.find(n => n.name === 'greet' && n.type === NodeType.FUNCTION);
    expect(greetFn).toBeDefined();
    expect(greetFn?.startLine).toBe(5);
    expect(greetFn?.endLine).toBe(7);

    // 2. Verify Imports extraction
    const edges = graph.getAllEdges();
    const importEdge = edges.find(
      e => e.relation === EdgeRelation.IMPORTS_FROM && e.targetId === '../utils/helper.js'
    );
    expect(importEdge).toBeDefined();
    expect(importEdge?.sourceId).toBe('csa-comments.astro');
    expect(importEdge?.sourceLine).toBe(3);

    // 3. Verify Calls extraction
    const callEdge = edges.find(
      e => e.relation === EdgeRelation.CALLS && e.targetId === 'helper'
    );
    expect(callEdge).toBeDefined();
    expect(callEdge?.sourceId).toBe('csa-comments.astro::greet');
    expect(callEdge?.sourceLine).toBe(6);
  });
});
