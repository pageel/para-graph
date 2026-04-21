/**
 * Unit tests for para-graph core functionality.
 *
 * Tests:
 * 1. Parse simple class → verify node count
 * 2. Parse import chain → verify IMPORTS_FROM edge
 * 3. Parse function calls → verify CALLS edge
 * 4. Export JSONL → read back → verify data integrity (H3-1)
 * 5. [P2] Semantic field round-trip (write with semantic → import → verify)
 * 6. [P2] Backward compat — P1 output (no semantic) still loads correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolve, join, dirname } from 'node:path';
import { readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CodeGraph } from '../src/graph/code-graph.js';
import { TreeSitterParser } from '../src/parser/tree-sitter-parser.js';
import { exportToJsonl } from '../src/graph/jsonl-exporter.js';
import { importFromJsonl } from '../src/graph/jsonl-importer.js';
import { NodeType, EdgeRelation, ExportType } from '../src/graph/models.js';
import type { SemanticAttributes, GraphNode } from '../src/graph/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, 'fixtures');
const TEST_OUTPUT_DIR = resolve(__dirname, '.test-output');

describe('para-graph', () => {
  let graph: CodeGraph;
  let parser: TreeSitterParser;

  beforeEach(() => {
    graph = new CodeGraph();
    parser = new TreeSitterParser(FIXTURES_DIR);
  });

  describe('Test 1: Simple class parsing', () => {
    it('should extract class and method nodes from simple-class.ts', () => {
      const filePath = join(FIXTURES_DIR, 'simple-class.ts');
      parser.parseFile(filePath, graph);

      const stats = graph.getStats();
      // Expect: 1 FILE + 1 CLASS + 2 METHODs = 4 nodes
      expect(stats.nodeCount).toBeGreaterThanOrEqual(4);

      // Verify the class node exists
      const nodes = graph.getAllNodes();
      const classNode = nodes.find((n) => n.type === NodeType.CLASS && n.name === 'Calculator');
      expect(classNode).toBeDefined();
      expect(classNode?.filePath).toBe('simple-class.ts');

      // Verify method nodes
      const methods = nodes.filter((n) => n.type === NodeType.FUNCTION);
      expect(methods.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Test 2: Import chain', () => {
    it('should create IMPORTS_FROM edge for import statements', () => {
      const filePath = join(FIXTURES_DIR, 'import-chain.ts');
      parser.parseFile(filePath, graph);

      const edges = graph.getAllEdges();
      const importEdge = edges.find((e) => e.relation === EdgeRelation.IMPORTS_FROM);
      expect(importEdge).toBeDefined();
      expect(importEdge?.targetId).toContain('./simple-class');
    });
  });

  describe('Test 3: Function calls', () => {
    it('should create CALLS edge for function calls', () => {
      const filePath = join(FIXTURES_DIR, 'function-calls.ts');
      parser.parseFile(filePath, graph);

      const edges = graph.getAllEdges();
      const callEdge = edges.find(
        (e) => e.relation === EdgeRelation.CALLS && e.targetId === 'greet',
      );
      expect(callEdge).toBeDefined();

      // Verify arrow function node was captured
      const nodes = graph.getAllNodes();
      const arrowFn = nodes.find((n) => n.name === 'run');
      expect(arrowFn).toBeDefined();
    });
  });

  describe('Test 4: JSONL export round-trip (H3-1)', () => {
    it('should export and read back identical data', () => {
      // Parse all fixtures
      const files = [
        join(FIXTURES_DIR, 'simple-class.ts'),
        join(FIXTURES_DIR, 'import-chain.ts'),
        join(FIXTURES_DIR, 'function-calls.ts'),
      ];
      for (const f of files) {
        parser.parseFile(f, graph);
      }

      // Clean test output
      if (existsSync(TEST_OUTPUT_DIR)) {
        rmSync(TEST_OUTPUT_DIR, { recursive: true });
      }
      mkdirSync(TEST_OUTPUT_DIR, { recursive: true });

      // Export
      exportToJsonl(graph, TEST_OUTPUT_DIR);

      // Read back entities
      const entitiesContent = readFileSync(join(TEST_OUTPUT_DIR, 'entities.jsonl'), 'utf-8');
      const entityLines = entitiesContent.trim().split('\n');
      const parsedNodes = entityLines.map((line: string) => JSON.parse(line));

      expect(parsedNodes.length).toBe(graph.getAllNodes().length);

      // Read back relations
      const relationsContent = readFileSync(join(TEST_OUTPUT_DIR, 'relations.jsonl'), 'utf-8');
      const relationLines = relationsContent.trim().split('\n');
      const parsedEdges = relationLines.map((line: string) => JSON.parse(line));

      expect(parsedEdges.length).toBe(graph.getAllEdges().length);

      // Read back metadata
      const metadataContent = readFileSync(join(TEST_OUTPUT_DIR, 'metadata.json'), 'utf-8');
      const metadata = JSON.parse(metadataContent);
      expect(metadata.version).toBe('0.1.0');
      expect(metadata.nodeCount).toBe(graph.getStats().nodeCount);
      expect(metadata.edgeCount).toBe(graph.getStats().edgeCount);

      // Cleanup
      rmSync(TEST_OUTPUT_DIR, { recursive: true });
    });
  });

  // --- P2: Semantic Enrichment Tests ---

  describe('Test 5: [P2] Semantic field round-trip', () => {
    it('should preserve semantic data through export → import cycle', () => {
      const semantic: SemanticAttributes = {
        summary: 'In-memory graph storage with dual indexing',
        complexity: 'medium',
        domainConcepts: ['graph', 'indexing', 'code-analysis'],
        enrichedAt: '2026-04-21T10:00:00Z',
        enrichedBy: 'agent',
      };

      // Create a node with semantic data
      const enrichedNode: GraphNode = {
        id: 'test.ts::TestClass',
        type: NodeType.CLASS,
        name: 'TestClass',
        filePath: 'test.ts',
        startLine: 1,
        endLine: 10,
        exportType: ExportType.NAMED,
        signature: 'export class TestClass',
        semantic,
      };

      graph.addNode(enrichedNode);

      // Export
      const outputDir = join(TEST_OUTPUT_DIR, 'semantic-roundtrip');
      if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });
      mkdirSync(outputDir, { recursive: true });
      exportToJsonl(graph, outputDir);

      // Import back
      const imported = importFromJsonl(outputDir);
      const importedNodes = imported.getAllNodes();

      expect(importedNodes.length).toBe(1);
      expect(importedNodes[0].semantic).toBeDefined();
      expect(importedNodes[0].semantic?.summary).toBe(semantic.summary);
      expect(importedNodes[0].semantic?.complexity).toBe('medium');
      expect(importedNodes[0].semantic?.domainConcepts).toEqual(['graph', 'indexing', 'code-analysis']);
      expect(importedNodes[0].semantic?.enrichedBy).toBe('agent');

      // Cleanup
      rmSync(outputDir, { recursive: true });
    });
  });

  describe('Test 6: [P2] Backward compat — P1 output loads correctly', () => {
    it('should load JSONL without semantic field (P1 format)', () => {
      // Create P1-style JSONL (no semantic field)
      const outputDir = join(TEST_OUTPUT_DIR, 'p1-compat');
      if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });
      mkdirSync(outputDir, { recursive: true });

      const p1Node = {
        id: 'legacy.ts::LegacyFn',
        type: 'function',
        name: 'LegacyFn',
        filePath: 'legacy.ts',
        startLine: 1,
        endLine: 5,
        exportType: 'named',
        signature: 'export function LegacyFn()',
      };

      writeFileSync(join(outputDir, 'entities.jsonl'), JSON.stringify(p1Node) + '\n', 'utf-8');
      writeFileSync(join(outputDir, 'relations.jsonl'), '', 'utf-8');

      // Import P1 output
      const imported = importFromJsonl(outputDir);
      const nodes = imported.getAllNodes();

      expect(nodes.length).toBe(1);
      expect(nodes[0].name).toBe('LegacyFn');
      expect(nodes[0].semantic).toBeUndefined();

      // Cleanup
      rmSync(outputDir, { recursive: true });
    });
  });
});
