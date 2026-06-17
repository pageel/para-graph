import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { TreeSitterParser } from '../src/parser/tree-sitter-parser.js';
import { walkDirectory } from '../src/parser/file-walker.js';
import { CodeGraph } from '../src/graph/code-graph.js';
import { SqliteManager } from '../src/graph/store/sqlite-manager.js';
import { createServer } from '../src/mcp/server.js';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find workspace root (parent of Projects/para-graph)
const workspaceRoot = path.resolve(__dirname, '../../../..');
const projectName = 'para-graph';

async function runBenchmarks() {
  console.log('====================================================');
  console.log('         PARA-GRAPH PERFORMANCE BENCHMARKS          ');
  console.log('====================================================');
  console.log(`Workspace Root: ${workspaceRoot}`);
  console.log(`Project Name:   ${projectName}`);
  console.log('----------------------------------------------------\n');

  // ==========================================
  // 1. L1 AST Parser Benchmark
  // ==========================================
  console.log('Running 1. L1 AST Parser Benchmark...');
  const srcDir = path.resolve(__dirname, '../src');
  const parser = new TreeSitterParser(srcDir);
  const files = walkDirectory(srcDir);
  
  const parseStart = performance.now();
  let parsedCount = 0;
  for (const file of files) {
    const graph = new CodeGraph();
    try {
      parser.parseFile(file, graph);
      parsedCount++;
    } catch (e: any) {
      // Skip parsing errors
    }
  }
  const parseDuration = performance.now() - parseStart;
  const parseRate = (parsedCount / (parseDuration / 1000)).toFixed(2);
  const avgParseTime = (parseDuration / parsedCount).toFixed(2);
  console.log(`Parsed ${parsedCount} files in ${parseDuration.toFixed(2)}ms`);
  console.log(`Parser Speed: ${parseRate} files/sec (avg: ${avgParseTime}ms/file)\n`);

  // ==========================================
  // 2. SQLite Database Insertion Benchmark
  // ==========================================
  console.log('Running 2. SQLite Database Insertion Benchmark...');
  const graphDir = path.join(workspaceRoot, 'Projects', projectName, '.beads', 'graph');
  const entitiesPath = path.join(graphDir, 'entities.jsonl');
  const relationsPath = path.join(graphDir, 'relations.jsonl');

  if (!fs.existsSync(entitiesPath) || !fs.existsSync(relationsPath)) {
    console.error(`❌ Error: entities.jsonl or relations.jsonl not found at ${graphDir}`);
    process.exit(1);
  }

  // Set SqliteManager DatabaseConstructor
  SqliteManager.DatabaseConstructor = Database;
  const tempDbManager = new SqliteManager('benchmark-temp', ':memory:');
  const db = tempDbManager.getConnection();
  db.exec('PRAGMA foreign_keys = ON;');
  tempDbManager.initSchema();

  // Load nodes from JSONL file
  const nodes: any[] = [];
  const nodeStream = readline.createInterface({
    input: fs.createReadStream(entitiesPath),
    crlfDelay: Infinity
  });
  for await (const line of nodeStream) {
    if (line.trim()) nodes.push(JSON.parse(line));
  }

  // Load edges from JSONL file
  const edges: any[] = [];
  const edgeStream = readline.createInterface({
    input: fs.createReadStream(relationsPath),
    crlfDelay: Infinity
  });
  for await (const line of edgeStream) {
    if (line.trim()) edges.push(JSON.parse(line));
  }

  // Time insertion using SqliteManager.persistGraph
  const insertStart = performance.now();
  tempDbManager.persistGraph(nodes, edges);
  const insertDuration = performance.now() - insertStart;

  const nodeRate = (nodes.length / (insertDuration / 1000)).toFixed(2);
  const edgeRate = (edges.length / (insertDuration / 1000)).toFixed(2);
  
  console.log(`Inserted ${nodes.length} nodes and ${edges.length} edges in ${insertDuration.toFixed(2)}ms`);
  console.log(`Node Write Throughput: ${nodeRate} nodes/sec`);
  console.log(`Edge Write Throughput: ${edgeRate} edges/sec\n`);
  tempDbManager.close();

  // ==========================================
  // 3. MCP Tool Query Latency Benchmark
  // ==========================================
  console.log('Running 3. MCP Tool Query Latency Benchmark...');
  const server = createServer(workspaceRoot);
  const registeredTools = (server as any)._registeredTools;

  if (!registeredTools || !registeredTools['graph_query'] || !registeredTools['graph_context_bundle']) {
    console.error('❌ Error: MCP tools are not registered correctly on the server');
    process.exit(1);
  }

  const graphQuery = registeredTools['graph_query'];
  const graphContextBundle = registeredTools['graph_context_bundle'];

  // Warm-up run
  try {
    await graphQuery.handler({ projectName, nodeType: 'file' });
    if (nodes.length > 0) {
      await graphContextBundle.handler({ projectName, nodeId: nodes[0].id });
    }
  } catch (e) {}

  // Run graph_query benchmark (50 runs)
  const queryRuns = 50;
  const queryLatencies: number[] = [];
  for (let i = 0; i < queryRuns; i++) {
    const type = i % 2 === 0 ? 'file' : 'function';
    const qStart = performance.now();
    await graphQuery.handler({ projectName, nodeType: type });
    queryLatencies.push(performance.now() - qStart);
  }

  const avgQueryLatency = (queryLatencies.reduce((a, b) => a + b, 0) / queryRuns).toFixed(2);
  const maxQueryLatency = Math.max(...queryLatencies).toFixed(2);

  // Run graph_context_bundle benchmark (50 runs)
  const bundleLatencies: number[] = [];
  const bundleRuns = Math.min(50, nodes.length);
  for (let i = 0; i < bundleRuns; i++) {
    const nodeId = nodes[i].id;
    const bStart = performance.now();
    await graphContextBundle.handler({ projectName, nodeId });
    bundleLatencies.push(performance.now() - bStart);
  }

  const avgBundleLatency = (bundleLatencies.reduce((a, b) => a + b, 0) / bundleRuns).toFixed(2);
  const maxBundleLatency = Math.max(...bundleLatencies).toFixed(2);

  console.log(`Executed ${queryRuns} graph_query calls (avg: ${avgQueryLatency}ms, max: ${maxQueryLatency}ms)`);
  console.log(`Executed ${bundleRuns} graph_context_bundle calls (avg: ${avgBundleLatency}ms, max: ${maxBundleLatency}ms)\n`);

  // Cleanup server connection if any
  try {
    await server.close();
  } catch (e) {}

  // ==========================================
  // 4. Output Summary Table
  // ==========================================
  console.log('====================================================');
  console.log('                 BENCHMARK SUMMARY                  ');
  console.log('====================================================');
  console.log(`| Metric                         | Value            |`);
  console.log(`|--------------------------------|------------------|`);
  console.log(`| Total Source Files Parsed      | ${String(parsedCount).padEnd(16)} |`);
  console.log(`| Parser Throughput              | ${(parseRate + ' files/s').padEnd(16)} |`);
  console.log(`| Avg Parse Time per File        | ${(avgParseTime + ' ms').padEnd(16)} |`);
  console.log(`| SQLite Node Insertion Speed    | ${(nodeRate + ' nodes/s').padEnd(16)} |`);
  console.log(`| SQLite Edge Insertion Speed    | ${(edgeRate + ' edges/s').padEnd(16)} |`);
  console.log(`| Avg graph_query Latency        | ${(avgQueryLatency + ' ms').padEnd(16)} |`);
  console.log(`| Avg graph_context_bundle Lat   | ${(avgBundleLatency + ' ms').padEnd(16)} |`);
  console.log('====================================================\n');

  process.exit(0);
}

runBenchmarks().catch((e) => {
  console.error('Benchmark execution failed:', e);
  process.exit(1);
});
