/**
 * Scope Tracking Tests (P9 — Phase 1)
 *
 * Verifies that CALLS edges use the enclosing function/method/variable
 * scope as sourceId instead of the file path.
 *
 * Test cases:
 *   S1: Call inside function → sourceId = file::functionName
 *   S2: Call inside class method → sourceId = file::ClassName.methodName
 *   S3: Call at file top-level → sourceId = filePath
 *   S4: Call inside arrow function variable → sourceId = file::varName
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { TreeSitterParser } from '../src/parser/tree-sitter-parser.js';
import { CodeGraph } from '../src/graph/code-graph.js';
import { EdgeRelation } from '../src/graph/models.js';

const TMP_DIR = join(import.meta.dirname, '__fixtures_scope__');

function setupFixture(filename: string, content: string): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const filePath = join(TMP_DIR, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function getCallEdges(graph: CodeGraph) {
  return graph.getAllEdges().filter(e => e.relation === EdgeRelation.CALLS);
}

describe('Scope Tracking — CALLS edge sourceId', () => {
  let parser: TreeSitterParser;
  let graph: CodeGraph;

  beforeEach(() => {
    parser = new TreeSitterParser(TMP_DIR);
    graph = new CodeGraph();
  });

  // Cleanup after all tests
  afterAll(() => {
    try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('S1: Call inside function → sourceId = file::functionName', () => {
    const filePath = setupFixture('s1.ts', `
function foo() {
  console.log("hello");
  bar();
}
`);
    parser.parseFile(filePath, graph);
    const calls = getCallEdges(graph);

    // bar() should have sourceId = s1.ts::foo
    const barCall = calls.find(e => e.targetId === 'bar');
    expect(barCall).toBeDefined();
    expect(barCall!.sourceId).toBe('s1.ts::foo');
  });

  it('S2: Call inside class method → sourceId = file::ClassName.methodName', () => {
    const filePath = setupFixture('s2.ts', `
class MyService {
  doWork() {
    helper();
    this.cleanup();
  }
}
`);
    parser.parseFile(filePath, graph);
    const calls = getCallEdges(graph);

    // helper() should have sourceId = s2.ts::MyService.doWork
    const helperCall = calls.find(e => e.targetId === 'helper');
    expect(helperCall).toBeDefined();
    expect(helperCall!.sourceId).toBe('s2.ts::MyService.doWork');
  });

  it('S3: Call at file top-level → sourceId = filePath', () => {
    const filePath = setupFixture('s3.ts', `
import { setup } from './config';
setup();
console.log("initialized");
`);
    parser.parseFile(filePath, graph);
    const calls = getCallEdges(graph);

    // setup() at top-level should have sourceId = s3.ts (file path)
    const setupCall = calls.find(e => e.targetId === 'setup');
    expect(setupCall).toBeDefined();
    expect(setupCall!.sourceId).toBe('s3.ts');
  });

  it('S4: Call inside arrow function variable → sourceId = file::varName', () => {
    const filePath = setupFixture('s4.ts', `
const handler = () => {
  process();
  logger.info("done");
};
`);
    parser.parseFile(filePath, graph);
    const calls = getCallEdges(graph);

    // process() should have sourceId = s4.ts::handler
    const processCall = calls.find(e => e.targetId === 'process');
    expect(processCall).toBeDefined();
    expect(processCall!.sourceId).toBe('s4.ts::handler');
  });
});
