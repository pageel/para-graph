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
    writeFileSync(join(projectDir, 'project.md'), 'version: 0.0.1\nname: mock-project\n', 'utf-8');
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

  it('should inject spec metadata into SPEC_ANCHOR nodes during build', () => {
    // 1. Write mock spec with metadata
    writeFileSync(
      join(docsDir, 'spec-meta.md'),
      `# Specs\n\n> **Deprecated:** true\n> **Deprecated-By:** spec-new.md\n> **Renamed-From:** spec-old.md\n> **Anchor-Prefix:** csa-meta\n\n## Feature Y <span id="csa-feature-y"></span>`,
      'utf-8'
    );
    // Write dummy code to avoid early exit
    writeFileSync(join(repoDir, 'dummy.ts'), 'export function dummy() {}', 'utf-8');

    // 2. Run Build
    runBuild({
      targetDir: repoDir,
      outputDir: outputDir,
      useClean: true,
      projectName: 'mock-project'
    });

    // 3. Import graph and verify metadata
    const graph = importFromJsonl(outputDir);
    const anchorNode = graph.getNode('csa-feature-y');
    expect(anchorNode).toBeDefined();
    expect(anchorNode?.semantic?.specMeta).toEqual({
      deprecated: true,
      deprecatedBy: 'spec-new.md',
      renamedFrom: 'spec-old.md',
      anchorPrefix: 'csa-meta',
    });
  });

  it('should implement cross-file duplicate anchor detection (first-wins + warn)', () => {
    // 1. Write two mock specs with the same anchor ID
    writeFileSync(
      join(docsDir, 'spec-first.md'),
      `# Specs First\n\n## Feature Dup <span id="csa-feature-dup"></span>`,
      'utf-8'
    );
    writeFileSync(
      join(docsDir, 'spec-second.md'),
      `# Specs Second\n\n## Feature Dup Second <span id="csa-feature-dup"></span>`,
      'utf-8'
    );
    // Write dummy code to avoid early exit
    writeFileSync(join(repoDir, 'dummy.ts'), 'export function dummy() {}', 'utf-8');

    // Spy on console.warn
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => {
      warnings.push(msg);
    };

    try {
      // 2. Run Build
      runBuild({
        targetDir: repoDir,
        outputDir: outputDir,
        useClean: true,
        projectName: 'mock-project'
      });

      // 3. Import graph and verify
      const graph = importFromJsonl(outputDir);
      const anchorNode = graph.getNode('csa-feature-dup');
      expect(anchorNode).toBeDefined();
      // First wins — should point to spec-first.md, not spec-second.md
      expect(anchorNode?.filePath).toBe('docs/spec-first.md');

      // Verify duplicate warning was logged
      const duplicateWarning = warnings.find(w => w.includes('DUPLICATE anchor "csa-feature-dup"'));
      expect(duplicateWarning).toBeDefined();
      expect(duplicateWarning).toContain('first in "docs/spec-first.md", also in "docs/spec-second.md"');
    } finally {
      console.warn = originalWarn;
    }
  });

  it('should scan doc markdown files containing inherits, adding FILE nodes and EdgeRelation.DOCUMENTS edges', () => {
    // 1. Write mock spec in docs/
    writeFileSync(
      join(docsDir, 'spec-main.md'),
      `# Specs Main\n\n## Core Feature <span id="csa-core-feat"></span>`,
      'utf-8'
    );

    // 2. Write mock doc in docs/ inheriting from the spec anchor
    writeFileSync(
      join(docsDir, 'guide-user.md'),
      `# User Guide\n\n<span data-csa-inherits="csa-core-feat"></span>\nThis is a user guide.`,
      'utf-8'
    );

    // Write dummy code to avoid early exit
    writeFileSync(join(repoDir, 'dummy.ts'), 'export function dummy() {}', 'utf-8');

    // 3. Run Build
    runBuild({
      targetDir: repoDir,
      outputDir: outputDir,
      useClean: true,
      projectName: 'mock-project'
    });

    // 4. Import graph and verify
    const graph = importFromJsonl(outputDir);

    // Verify guide-user.md node exists in the graph as a FILE type
    const docNode = graph.getNode('docs/guide-user.md');
    expect(docNode).toBeDefined();
    expect(docNode?.type).toBe(NodeType.FILE);
    expect(docNode?.filePath).toBe('docs/guide-user.md');

    // Verify DOCUMENTS edge exists linking guide-user.md to csa-core-feat
    const edges = graph.getAllEdges();
    const documentsEdge = edges.find(
      e => e.sourceId === 'docs/guide-user.md' && e.targetId === 'csa-core-feat'
    );
    expect(documentsEdge).toBeDefined();
    expect(documentsEdge?.relation).toBe(EdgeRelation.DOCUMENTS);
    expect(documentsEdge?.confidence).toBe('EXTRACTED');
  });
});

