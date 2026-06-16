import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { runBuild } from '../src/commands/build.js';
import { importFromJsonl } from '../src/graph/jsonl-importer.js';
import { NodeType, EdgeRelation } from '../src/graph/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DIR = resolve(__dirname, '.test-output', 'build-csa');

describe('Build CSA Integration', () => {
  const projectDir = join(TEST_DIR, 'mock-project');
  const repoDir = join(projectDir, 'repo');
  const docsDir = join(projectDir, 'docs');
  const outputDir = join(TEST_DIR, 'output');

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(repoDir, { recursive: true });
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should scan docs and comments, adding SPEC_ANCHOR nodes and DOCUMENTED_BY edges to the graph', () => {
    // 1. Write mock spec in docs/
    writeFileSync(
      join(docsDir, 'spec.md'),
      `# Specs\n\n## Feature X <span id="csa-feature-x"></span>\nDescription.`,
      'utf-8'
    );

    // 2. Write mock code in repo/
    writeFileSync(
      join(repoDir, 'index.ts'),
      `// @para-doc [docs/spec.md#csa-feature-x]\nexport function main() {}\n`,
      'utf-8'
    );

    // 3. Run Build
    runBuild({
      targetDir: repoDir,
      outputDir: outputDir,
      useClean: true,
      projectName: 'mock-project'
    });

    // 4. Import graph and verify
    const graph = importFromJsonl(outputDir);
    
    // Verify SPEC_ANCHOR node exists
    const anchorNode = graph.getNode('csa-feature-x');
    expect(anchorNode).toBeDefined();
    expect(anchorNode?.type).toBe(NodeType.SPEC_ANCHOR);
    expect(anchorNode?.filePath).toBe('docs/spec.md');
    expect(anchorNode?.signature).toBe('## Feature X');

    // Verify DOCUMENTED_BY edge exists
    const edges = graph.getAllEdges();
    const docEdge = edges.find(e => e.relation === EdgeRelation.DOCUMENTED_BY);
    expect(docEdge).toBeDefined();
    expect(docEdge?.targetId).toBe('csa-feature-x');
    expect(docEdge?.sourceId).toBe('index.ts::main');
  });
});
