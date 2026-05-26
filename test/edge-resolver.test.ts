/**
 * EdgeResolver Tests (P9 — Phase 2)
 *
 * Verifies the 4-level priority chain for resolving bare targetId
 * to full entity IDs.
 *
 * Test cases:
 *   T1: Same-file resolution → EXTRACTED
 *   T2: Unique-name resolution → INFERRED
 *   T3: Member call logger::info → INFERRED (import-hint)
 *   T4: Ambiguous "set" (multiple matches) → AMBIGUOUS, unchanged
 *   T5: Built-in console::log → skipped
 *   T6: Constructor URLSearchParams::constructor → skipped (built-in)
 *   T7: Import-hint logger::info with import ./lib/logger → INFERRED
 */

import { describe, it, expect } from 'vitest';
import { CodeGraph } from '../src/graph/code-graph.js';
import { NodeType, EdgeRelation, ExportType } from '../src/graph/models.js';
import type { GraphNode, GraphEdge } from '../src/graph/models.js';
import { resolveEdges, BUILTIN_SKIP_LIST } from '../src/graph/edge-resolver.js';

// ── Helpers ──

function makeNode(id: string, name: string, filePath: string): GraphNode {
  return {
    id,
    type: NodeType.FUNCTION,
    name,
    filePath,
    startLine: 1,
    endLine: 10,
    exportType: ExportType.NAMED,
    signature: `function ${name}()`,
  };
}

function makeCallEdge(
  sourceId: string,
  targetId: string,
  sourceFile: string,
): GraphEdge {
  return {
    sourceId,
    targetId,
    relation: EdgeRelation.CALLS,
    sourceFile,
    sourceLine: 5,
    confidence: 'EXTRACTED',
  };
}

function makeImportEdge(sourceFile: string, importSource: string): GraphEdge {
  return {
    sourceId: sourceFile,
    targetId: importSource,
    relation: EdgeRelation.IMPORTS_FROM,
    sourceFile,
    sourceLine: 1,
    confidence: 'EXTRACTED',
  };
}

describe('EdgeResolver — resolveEdges()', () => {

  it('T1: Same-file resolution → EXTRACTED', () => {
    const graph = new CodeGraph();

    // File with two functions: caller and callee
    graph.addNode(makeNode('src/utils.ts::doWork', 'doWork', 'src/utils.ts'));
    graph.addNode(makeNode('src/utils.ts::helper', 'helper', 'src/utils.ts'));

    // doWork calls "helper" (bare name, same file)
    graph.addEdge(makeCallEdge('src/utils.ts::doWork', 'helper', 'src/utils.ts'));

    const result = resolveEdges(graph);

    const edge = graph.getAllEdges().find(e => e.relation === EdgeRelation.CALLS);
    expect(edge!.targetId).toBe('src/utils.ts::helper');
    expect(edge!.confidence).toBe('EXTRACTED');
    expect(result.resolved).toBe(1);
  });

  it('T2: Unique-name resolution → INFERRED', () => {
    const graph = new CodeGraph();

    // Function in file A
    graph.addNode(makeNode('src/a.ts::caller', 'caller', 'src/a.ts'));
    // Unique function in file B
    graph.addNode(makeNode('src/b.ts::uniqueHelper', 'uniqueHelper', 'src/b.ts'));

    // caller calls "uniqueHelper" — only one entity with that name
    graph.addEdge(makeCallEdge('src/a.ts::caller', 'uniqueHelper', 'src/a.ts'));

    const result = resolveEdges(graph);

    const edge = graph.getAllEdges().find(e => e.relation === EdgeRelation.CALLS);
    expect(edge!.targetId).toBe('src/b.ts::uniqueHelper');
    expect(edge!.confidence).toBe('INFERRED');
    expect(result.resolved).toBe(1);
  });

  it('T3: Member call logger::info → resolved via import-hint', () => {
    const graph = new CodeGraph();

    graph.addNode(makeNode('src/app.ts::main', 'main', 'src/app.ts'));
    graph.addNode(makeNode('src/lib/logger.ts::info', 'info', 'src/lib/logger.ts'));

    // app.ts imports from './lib/logger'
    graph.addEdge(makeImportEdge('src/app.ts', './lib/logger'));
    // main calls logger::info
    graph.addEdge(makeCallEdge('src/app.ts::main', 'logger::info', 'src/app.ts'));

    const result = resolveEdges(graph);

    const callEdge = graph.getAllEdges().find(
      e => e.relation === EdgeRelation.CALLS
    );
    expect(callEdge!.targetId).toBe('src/lib/logger.ts::info');
    expect(callEdge!.confidence).toBe('INFERRED');
    expect(result.resolved).toBe(1);
  });

  it('T4: Ambiguous "set" (multiple matches) → AMBIGUOUS, unchanged', () => {
    const graph = new CodeGraph();

    graph.addNode(makeNode('src/caller.ts::fn', 'fn', 'src/caller.ts'));
    // Multiple entities named "set" across different files
    graph.addNode(makeNode('src/a.ts::set', 'set', 'src/a.ts'));
    graph.addNode(makeNode('src/b.ts::set', 'set', 'src/b.ts'));
    graph.addNode(makeNode('src/c.ts::set', 'set', 'src/c.ts'));

    graph.addEdge(makeCallEdge('src/caller.ts::fn', 'set', 'src/caller.ts'));

    const result = resolveEdges(graph);

    const edge = graph.getAllEdges().find(e => e.relation === EdgeRelation.CALLS);
    expect(edge!.targetId).toBe('set'); // unchanged
    expect(edge!.confidence).toBe('AMBIGUOUS');
    expect(result.unresolved).toBe(1);
  });

  it('T5: Built-in console::log → skipped entirely', () => {
    const graph = new CodeGraph();

    graph.addNode(makeNode('src/app.ts::main', 'main', 'src/app.ts'));
    graph.addEdge(makeCallEdge('src/app.ts::main', 'console::log', 'src/app.ts'));

    const result = resolveEdges(graph);

    // console is in skip list — edge should not be counted in total
    expect(result.total).toBe(0);
    // targetId remains unchanged
    const edge = graph.getAllEdges().find(e => e.relation === EdgeRelation.CALLS);
    expect(edge!.targetId).toBe('console::log');
  });

  it('T6: Constructor URLSearchParams::constructor → skipped (built-in)', () => {
    const graph = new CodeGraph();

    graph.addNode(makeNode('src/api.ts::fetch', 'fetch', 'src/api.ts'));
    graph.addEdge(makeCallEdge('src/api.ts::fetch', 'URLSearchParams::constructor', 'src/api.ts'));

    const result = resolveEdges(graph);

    expect(result.total).toBe(0); // skipped
    const edge = graph.getAllEdges().find(e => e.relation === EdgeRelation.CALLS);
    expect(edge!.targetId).toBe('URLSearchParams::constructor');
  });

  it('T7: Import-hint with matching basename → INFERRED', () => {
    const graph = new CodeGraph();

    graph.addNode(makeNode('src/handler.ts::handle', 'handle', 'src/handler.ts'));
    graph.addNode(makeNode('src/services/auth.ts::verify', 'verify', 'src/services/auth.ts'));

    // handler imports from '../services/auth'
    graph.addEdge(makeImportEdge('src/handler.ts', '../services/auth'));
    // handler calls auth::verify
    graph.addEdge(makeCallEdge('src/handler.ts::handle', 'auth::verify', 'src/handler.ts'));

    const result = resolveEdges(graph);

    const callEdge = graph.getAllEdges().find(e => e.relation === EdgeRelation.CALLS);
    expect(callEdge!.targetId).toBe('src/services/auth.ts::verify');
    expect(callEdge!.confidence).toBe('INFERRED');
    expect(result.resolved).toBe(1);
  });

  it('T8: External package call fs::readFile → EXTERNAL, unchanged', () => {
    const graph = new CodeGraph();

    graph.addNode(makeNode('src/app.ts::main', 'main', 'src/app.ts'));
    // caller calls fs::readFile — fs does not exist in graph nodes
    graph.addEdge(makeCallEdge('src/app.ts::main', 'fs::readFile', 'src/app.ts'));

    const result = resolveEdges(graph);

    const edge = graph.getAllEdges().find(e => e.relation === EdgeRelation.CALLS);
    expect(edge!.targetId).toBe('fs::readFile'); // unchanged
    expect(edge!.confidence).toBe('EXTERNAL');
    expect(result.external).toBe(1);
    expect(result.unresolved).toBe(0); // EXTERNAL is not counted as unresolved
  });

  it('BUILTIN_SKIP_LIST has ≥ 20 entries', () => {
    expect(BUILTIN_SKIP_LIST.size).toBeGreaterThanOrEqual(20);
  });
});
