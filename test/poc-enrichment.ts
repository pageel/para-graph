/**
 * POC Script — Verify Agent-driven enrichment end-to-end.
 *
 * Steps:
 * 1. Import existing graph from ./output
 * 2. Enrich top-5 nodes with semantic data
 * 3. Export enriched graph back to ./output
 * 4. Re-import and verify semantic field present
 */

import { importFromJsonl } from '../src/graph/jsonl-importer.js';
import { exportToJsonl } from '../src/graph/jsonl-exporter.js';
import type { SemanticAttributes } from '../src/graph/models.js';

// Step 1: Import
const graph = importFromJsonl('./output');
const stats = graph.getStats();
console.log(`[POC] Loaded graph: ${stats.nodeCount} nodes, ${stats.edgeCount} edges`);

// Step 2: Enrich top-5 nodes
const enrichments: [string, SemanticAttributes][] = [
  ['graph/code-graph.ts::CodeGraph', {
    summary: 'In-memory graph storage with dual indexing by ID and file path for fast entity lookup',
    complexity: 'medium', domainConcepts: ['graph', 'indexing', 'code-analysis'],
    enrichedAt: new Date().toISOString(), enrichedBy: 'agent',
  }],
  ['parser/tree-sitter-parser.ts::TreeSitterParser', {
    summary: 'AST parser using Tree-sitter to extract code entities and relationships from TypeScript files',
    complexity: 'high', domainConcepts: ['ast', 'parsing', 'tree-sitter', 'typescript'],
    enrichedAt: new Date().toISOString(), enrichedBy: 'agent',
  }],
  ['mcp/tools.ts::registerTools', {
    summary: 'Registers MCP tools for graph querying and semantic enrichment on the MCP server',
    complexity: 'high', domainConcepts: ['mcp', 'tools', 'enrichment', 'query'],
    enrichedAt: new Date().toISOString(), enrichedBy: 'agent',
  }],
  ['index.ts::main', {
    summary: 'CLI entry point that orchestrates file scanning, graph construction, and JSONL export',
    complexity: 'medium', domainConcepts: ['cli', 'orchestration', 'pipeline'],
    enrichedAt: new Date().toISOString(), enrichedBy: 'agent',
  }],
  ['graph/jsonl-importer.ts::importFromJsonl', {
    summary: 'Reconstructs CodeGraph from JSONL files with round-trip safety for semantic data',
    complexity: 'low', domainConcepts: ['serialization', 'jsonl', 'import'],
    enrichedAt: new Date().toISOString(), enrichedBy: 'agent',
  }],
];

let enriched = 0;
for (const [nodeId, semantic] of enrichments) {
  const node = graph.getNode(nodeId);
  if (node) {
    node.semantic = semantic;
    enriched++;
    console.log(`[POC] ✅ Enriched: ${nodeId}`);
  } else {
    console.warn(`[POC] ❌ Not found: ${nodeId}`);
  }
}

// Step 3: Export
exportToJsonl(graph, './output');
console.log(`[POC] Exported ${enriched} enriched nodes to ./output`);

// Step 4: Verify round-trip
const verified = importFromJsonl('./output');
const enrichedNodes = verified.getAllNodes().filter((n) => n.semantic !== undefined);
console.log(`[POC] Verified: ${enrichedNodes.length} nodes have semantic field`);

if (enrichedNodes.length === enriched) {
  console.log('[POC] ✅ POC PASSED — semantic enrichment round-trip successful');
} else {
  console.error('[POC] ❌ POC FAILED — expected', enriched, 'enriched nodes, got', enrichedNodes.length);
  process.exit(1);
}
