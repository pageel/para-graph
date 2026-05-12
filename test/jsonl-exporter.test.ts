import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exportToJsonl } from '../src/graph/jsonl-exporter.js';
import { CodeGraph } from '../src/graph/code-graph.js';
import { NodeType, ExportType } from '../src/graph/models.js';
import { join } from 'node:path';
import { readFileSync, rmSync, existsSync } from 'node:fs';

const OUT_DIR = join(__dirname, '.tmp-exporter');

describe('JSONL Exporter', () => {
  beforeEach(() => {
    if (existsSync(OUT_DIR)) {
      rmSync(OUT_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(OUT_DIR)) {
      rmSync(OUT_DIR, { recursive: true, force: true });
    }
  });

  it('should export enrichableNodeCount to metadata.json', () => {
    const graph = new CodeGraph();
    graph.addNode({
      id: 'file1.ts', type: NodeType.FILE, name: 'file1.ts',
      filePath: 'file1.ts', startLine: 1, endLine: 10, exportType: ExportType.NONE, signature: ''
    });
    graph.addNode({
      id: 'func1', type: NodeType.FUNCTION, name: 'func1',
      filePath: 'file1.ts', startLine: 2, endLine: 5, exportType: ExportType.NAMED, signature: 'function func1()'
    });

    exportToJsonl(graph, OUT_DIR, 'test-project');

    const metaPath = join(OUT_DIR, 'metadata.json');
    const metadata = JSON.parse(readFileSync(metaPath, 'utf-8'));

    expect(metadata.nodeCount).toBe(2);
    expect(metadata.enrichableNodeCount).toBe(1);
  });
});
