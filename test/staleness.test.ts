import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runBuild } from '../src/commands/build.js';
import { importFromJsonl } from '../src/graph/jsonl-importer.js';
import { exportToJsonl } from '../src/graph/jsonl-exporter.js';
import type { SemanticAttributes } from '../src/graph/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_OUTPUT_DIR = resolve(__dirname, '.test-output/staleness');
const TEMP_TARGET_DIR = join(TEST_OUTPUT_DIR, 'target');
const TEMP_OUTPUT_DIR = join(TEST_OUTPUT_DIR, 'output');

describe('Staleness Detection during Build', () => {
  beforeEach(() => {
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
    mkdirSync(TEMP_TARGET_DIR, { recursive: true });
    mkdirSync(TEMP_OUTPUT_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  it('should detect signature changes and set staleSince, and clear it on re-enrich', () => {
    // 1. Write initial source code file
    const sourceFilePath = join(TEMP_TARGET_DIR, 'helper.ts');
    const initialCode = `
export function compute(x: number): number {
  return x * 2;
}
`;
    writeFileSync(sourceFilePath, initialCode, 'utf-8');

    // 2. Run initial build
    runBuild({
      targetDir: TEMP_TARGET_DIR,
      outputDir: TEMP_OUTPUT_DIR,
      useClean: true,
      projectName: 'staleness-test',
    });

    // 3. Import and Enrich the node
    let graph = importFromJsonl(TEMP_OUTPUT_DIR);
    const nodeId = 'helper.ts::compute';
    const initialNode = graph.getNode(nodeId);
    expect(initialNode).toBeDefined();

    const semantic: SemanticAttributes = {
      summary: 'Computes multiplication by 2',
      complexity: 'low',
      domainConcepts: ['math'],
      enrichedAt: new Date().toISOString(),
      enrichedBy: 'agent',
    };
    graph.enrichNode(nodeId, semantic);

    // Save enriched graph back to outputDir to mock existing graph
    exportToJsonl(graph, TEMP_OUTPUT_DIR, 'staleness-test');

    // Verify it is enriched and staleSince is not set yet
    let savedNode = importFromJsonl(TEMP_OUTPUT_DIR).getNode(nodeId);
    expect(savedNode?.semantic?.summary).toBe('Computes multiplication by 2');
    expect(savedNode?.semantic?.staleSince).toBeUndefined();

    // 4. Modify source code signature
    const modifiedCode = `
export function compute(x: number, y: number = 0): number {
  return x * 2 + y;
}
`;
    writeFileSync(sourceFilePath, modifiedCode, 'utf-8');

    // 5. Run build again with existing graph preservation (useClean = false)
    runBuild({
      targetDir: TEMP_TARGET_DIR,
      outputDir: TEMP_OUTPUT_DIR,
      useClean: false,
      projectName: 'staleness-test',
    });

    // 6. Import and check staleness
    graph = importFromJsonl(TEMP_OUTPUT_DIR);
    let updatedNode = graph.getNode(nodeId);
    expect(updatedNode).toBeDefined();
    expect(updatedNode?.semantic?.summary).toBe('Computes multiplication by 2');
    expect(updatedNode?.semantic?.staleSince).toBeDefined();
    expect(typeof updatedNode?.semantic?.staleSince).toBe('string');

    // 7. Re-enrich the node to clear staleSince
    const newSemantic: SemanticAttributes = {
      summary: 'Computes multiplication with offset',
      complexity: 'low',
      domainConcepts: ['math'],
      enrichedAt: new Date().toISOString(),
      enrichedBy: 'agent',
    };
    graph.enrichNode(nodeId, newSemantic);
    expect(graph.getNode(nodeId)?.semantic?.staleSince).toBeUndefined();
  });
});
