import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { TreeSitterParser } from '../src/parser/tree-sitter-parser.js';
import { CodeGraph } from '../src/graph/code-graph.js';
import { NodeType } from '../src/graph/models.js';

describe('TreeSitterParser AST Bounds', () => {
  let parser: TreeSitterParser;
  let graph: CodeGraph;
  const rootDir = join(__dirname, '..');

  beforeEach(() => {
    parser = new TreeSitterParser(rootDir);
    graph = new CodeGraph();
  });

  it('should extract correct endLine for functions, methods, and classes', () => {
    const filePath = join(rootDir, 'test/fixtures/ast-bounds.ts');
    parser.parseFile(filePath, graph);

    const nodes = graph.getAllNodes();

    const clazz = nodes.find(n => n.name === 'BoundsTest' && n.type === NodeType.CLASS);
    expect(clazz).toBeDefined();
    // Class BoundsTest should span from line 1 to 7
    expect(clazz!.startLine).toBe(1);
    expect(clazz!.endLine).toBeGreaterThan(clazz!.startLine);
    expect(clazz!.endLine).toBe(7);

    const method = nodes.find(n => n.name === 'BoundsTest.multiLineMethod' && n.type === NodeType.FUNCTION);
    expect(method).toBeDefined();
    // multiLineMethod spans from line 2 to 6
    expect(method!.startLine).toBe(2);
    expect(method!.endLine).toBeGreaterThan(method!.startLine);
    expect(method!.endLine).toBe(6);

    const arrowFn = nodes.find(n => n.name === 'arrowFunction' && n.type === NodeType.FUNCTION);
    expect(arrowFn).toBeDefined();
    // arrowFunction spans from line 9 to 12
    expect(arrowFn!.startLine).toBe(9);
    expect(arrowFn!.endLine).toBeGreaterThan(arrowFn!.startLine);
    expect(arrowFn!.endLine).toBe(12);

    const stdFn = nodes.find(n => n.name === 'standardFunction' && n.type === NodeType.FUNCTION);
    expect(stdFn).toBeDefined();
    // standardFunction spans from line 14 to 17
    expect(stdFn!.startLine).toBe(14);
    expect(stdFn!.endLine).toBeGreaterThan(stdFn!.startLine);
    expect(stdFn!.endLine).toBe(17);
  });
});
