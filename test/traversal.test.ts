/**
 * Unit tests for P6: Impact & Context Queries
 *
 * Tests:
 * 1. traverseReverse — upstream (who calls this?)
 * 2. traverseReverse — downstream (what does this call?)
 * 3. traverseReverse — both directions
 * 4. traverseReverse — cycle detection (visited set)
 * 5. traverseReverse — node not found returns empty
 * 6. traverseReverse — max depth capping
 * 7. getContextBundle — full bundle with source code
 * 8. getContextBundle — stale file (source not found)
 * 9. getContextBundle — node not found throws
 * 10. getContextBundle — source truncation at 200 lines
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { resolve, join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { ProjectGraph } from '../src/graph/store/ProjectGraph.js';
import { NodeType, EdgeRelation, ExportType } from '../src/graph/models.js';
import type { GraphNode, GraphEdge } from '../src/graph/models.js';

// Helper to create test nodes
function makeNode(id: string, name: string, filePath: string, opts?: Partial<GraphNode>): GraphNode {
  return {
    id,
    type: NodeType.FUNCTION,
    name,
    filePath,
    startLine: 1,
    endLine: 10,
    exportType: ExportType.NAMED,
    signature: `function ${name}() {`,
    ...opts,
  };
}

// Helper to create test edges
function makeEdge(sourceId: string, targetId: string, relation: EdgeRelation, sourceLine = 1): GraphEdge {
  return {
    sourceId,
    targetId,
    relation,
    sourceFile: sourceId.split('::')[0] || sourceId,
    sourceLine,
  };
}

const TEST_TMP = resolve(import.meta.dirname!, '.test-traversal-output');

describe('P6: traverseReverse', () => {
  let graph: ProjectGraph;

  /**
   * Test graph structure:
   *
   *   A --CALLS--> B --CALLS--> C --CALLS--> D
   *                B --CALLS--> E
   *   F --IMPORTS_FROM--> B
   */
  beforeEach(() => {
    graph = new ProjectGraph('test-project');

    graph.addNode(makeNode('a.ts::A', 'A', 'a.ts'));
    graph.addNode(makeNode('b.ts::B', 'B', 'b.ts'));
    graph.addNode(makeNode('c.ts::C', 'C', 'c.ts'));
    graph.addNode(makeNode('d.ts::D', 'D', 'd.ts'));
    graph.addNode(makeNode('e.ts::E', 'E', 'e.ts'));
    graph.addNode(makeNode('f.ts::F', 'F', 'f.ts'));

    graph.addEdge(makeEdge('a.ts::A', 'b.ts::B', EdgeRelation.CALLS));
    graph.addEdge(makeEdge('b.ts::B', 'c.ts::C', EdgeRelation.CALLS));
    graph.addEdge(makeEdge('c.ts::C', 'd.ts::D', EdgeRelation.CALLS));
    graph.addEdge(makeEdge('b.ts::B', 'e.ts::E', EdgeRelation.CALLS));
    graph.addEdge(makeEdge('f.ts::F', 'b.ts::B', EdgeRelation.IMPORTS_FROM));
  });

  it('upstream: finds callers of B (depth=1)', () => {
    const result = graph.traverseReverse('b.ts::B', 1, 'upstream');
    const nodeNames = result.nodes.map(n => n.name);
    expect(nodeNames).toContain('A');
    expect(nodeNames).toContain('F');
    expect(nodeNames).not.toContain('C'); // downstream, not upstream
  });

  it('downstream: finds what B calls (depth=2)', () => {
    const result = graph.traverseReverse('b.ts::B', 2, 'downstream');
    const nodeNames = result.nodes.map(n => n.name);
    expect(nodeNames).toContain('C');
    expect(nodeNames).toContain('E');
    expect(nodeNames).toContain('D'); // C→D at depth 2
    expect(nodeNames).not.toContain('A'); // upstream, not downstream
  });

  it('both: finds all connected nodes', () => {
    const result = graph.traverseReverse('b.ts::B', 2, 'both');
    const nodeNames = result.nodes.map(n => n.name);
    expect(nodeNames).toContain('A');
    expect(nodeNames).toContain('C');
    expect(nodeNames).toContain('E');
    expect(nodeNames).toContain('F');
  });

  it('records paths correctly', () => {
    const result = graph.traverseReverse('b.ts::B', 2, 'downstream');
    // Each path should start with the origin node
    for (const path of result.paths) {
      expect(path[0]).toBe('b.ts::B');
    }
    // Path to D should be B → C → D
    const pathToD = result.paths.find(p => p[p.length - 1] === 'd.ts::D');
    expect(pathToD).toEqual(['b.ts::B', 'c.ts::C', 'd.ts::D']);
  });

  it('handles cycle without infinite loop', () => {
    // Add circular edge: D → A (creates A→B→C→D→A cycle)
    graph.addEdge(makeEdge('d.ts::D', 'a.ts::A', EdgeRelation.CALLS));

    const result = graph.traverseReverse('a.ts::A', 10, 'downstream');
    // Should terminate without infinite loop
    expect(result.nodes.length).toBeLessThanOrEqual(100);
    // Should visit all nodes in the cycle
    const nodeNames = result.nodes.map(n => n.name);
    expect(nodeNames).toContain('B');
    expect(nodeNames).toContain('C');
    expect(nodeNames).toContain('D');
  });

  it('returns empty for non-existent node', () => {
    const result = graph.traverseReverse('nonexistent::X', 2, 'upstream');
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.paths).toHaveLength(0);
  });

  it('respects max depth cap (depth > 5 capped to 5)', () => {
    const result = graph.traverseReverse('a.ts::A', 99, 'downstream');
    // Even with depth=99, should only go up to 5 levels
    // Our graph only has 3 levels deep from A, so all should be found
    const nodeNames = result.nodes.map(n => n.name);
    expect(nodeNames).toContain('B');
    expect(nodeNames).toContain('D');
    expect(nodeNames).toContain('E');
  });

  it('defaults to upstream direction and depth=2', () => {
    const result = graph.traverseReverse('c.ts::C');
    // upstream from C with depth=2: C←B at depth 1, C←B←A and C←B←F at depth 2
    const nodeNames = result.nodes.map(n => n.name);
    expect(nodeNames).toContain('B');
    expect(nodeNames).toContain('A');
  });
});

describe('P6: getContextBundle', () => {
  let graph: ProjectGraph;

  beforeEach(() => {
    graph = new ProjectGraph('test-project');

    // Clean up test output
    rmSync(TEST_TMP, { recursive: true, force: true });
    mkdirSync(TEST_TMP, { recursive: true });

    // Create a test source file
    const sourceContent = [
      '// file header',
      'export function greet(name: string): string {',
      '  return `Hello, ${name}!`;',
      '}',
      '',
      'export function farewell(name: string): string {',
      '  return `Goodbye, ${name}!`;',
      '}',
    ].join('\n');
    writeFileSync(join(TEST_TMP, 'greeter.ts'), sourceContent);

    // Create test file
    const testContent = [
      'import { greet } from "./greeter";',
      'test("greet works", () => {',
      '  expect(greet("World")).toBe("Hello, World!");',
      '});',
    ].join('\n');
    mkdirSync(join(TEST_TMP, 'test'), { recursive: true });
    writeFileSync(join(TEST_TMP, 'test', 'greeter.test.ts'), testContent);

    // Build graph
    graph.addNode(makeNode('greeter.ts::greet', 'greet', 'greeter.ts', { startLine: 2, endLine: 4 }));
    graph.addNode(makeNode('greeter.ts::farewell', 'farewell', 'greeter.ts', { startLine: 6, endLine: 8 }));
    graph.addNode(makeNode('app.ts::main', 'main', 'app.ts', { startLine: 1, endLine: 5 }));
    graph.addNode(makeNode('test/greeter.test.ts::greet works', 'greet works', 'test/greeter.test.ts'));

    // File nodes for imports
    graph.addNode(makeNode('greeter.ts', 'greeter.ts', 'greeter.ts', { type: NodeType.FILE, startLine: 1, endLine: 8 }));
    graph.addNode(makeNode('app.ts', 'app.ts', 'app.ts', { type: NodeType.FILE }));

    // Edges
    graph.addEdge(makeEdge('app.ts::main', 'greeter.ts::greet', EdgeRelation.CALLS));
    graph.addEdge(makeEdge('greeter.ts::greet', 'greeter.ts::farewell', EdgeRelation.CALLS));
    graph.addEdge(makeEdge('app.ts', './greeter', EdgeRelation.IMPORTS_FROM));
  });

  it('returns full context bundle for greet()', () => {
    const bundle = graph.getContextBundle('greeter.ts::greet', TEST_TMP);

    expect(bundle.target.name).toBe('greet');
    expect(bundle.sourceCode).toContain('export function greet');
    expect(bundle.sourceCode).toContain('Hello');
    expect(bundle.truncated).toBe(false);
    expect(bundle.callers).toHaveLength(1);
    expect(bundle.callers[0].name).toBe('main');
    expect(bundle.callees).toHaveLength(1);
    expect(bundle.callees[0].name).toBe('farewell');
    expect(bundle.relatedTests).toHaveLength(1);
    expect(bundle.relatedTests[0].name).toBe('greet works');
    expect(bundle.warnings).toHaveLength(0);
  });

  it('handles stale file gracefully', () => {
    const bundle = graph.getContextBundle('app.ts::main', TEST_TMP);

    expect(bundle.target.name).toBe('main');
    expect(bundle.sourceCode).toBeNull();
    expect(bundle.warnings.length).toBeGreaterThan(0);
    expect(bundle.warnings[0]).toContain('not found');
  });

  it('throws for non-existent node', () => {
    expect(() => {
      graph.getContextBundle('nonexistent::X', TEST_TMP);
    }).toThrow('Node not found');
  });

  it('truncates source code exceeding 200 lines', () => {
    // Create a large file
    const bigLines = Array.from({ length: 300 }, (_, i) => `// line ${i + 1}`);
    writeFileSync(join(TEST_TMP, 'big.ts'), bigLines.join('\n'));

    graph.addNode(makeNode('big.ts::bigFn', 'bigFn', 'big.ts', { startLine: 1, endLine: 300 }));

    const bundle = graph.getContextBundle('big.ts::bigFn', TEST_TMP);

    expect(bundle.truncated).toBe(true);
    expect(bundle.sourceCode).not.toBeNull();
    expect(bundle.sourceCode!.split('\n').length).toBe(200);
    expect(bundle.warnings.some(w => w.includes('truncated'))).toBe(true);
  });

  // Cleanup
  afterAll(() => {
    rmSync(TEST_TMP, { recursive: true, force: true });
  });
});
