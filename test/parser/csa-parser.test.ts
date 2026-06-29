import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, unlinkSync } from 'node:fs';
import { extractSpecAnchors, extractInheritsReferences } from '../../src/parser/csa-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

describe('CSA Markdown Parser', () => {
  it('should extract csa anchors with correct id, title and line number', () => {
    const filePath = join(FIXTURES_DIR, 'mock-spec.md');
    const anchors = extractSpecAnchors(filePath);

    expect(anchors).toHaveLength(3);
    
    expect(anchors[0]).toEqual({
      id: 'csa-test-feat-a',
      title: '## Feature A',
      line: 7
    });

    expect(anchors[1]).toEqual({
      id: 'csa-test-feat-b',
      title: '## Feature B',
      line: 11
    });

    expect(anchors[2]).toEqual({
      id: 'csa-test-feat-b1',
      title: '### Sub-feature B1',
      line: 15
    });
  });

  it('should throw an error on duplicate anchor IDs', () => {
    const tempFile = join(FIXTURES_DIR, 'temp-dup-spec.md');
    try {
      writeFileSync(tempFile, `# Dup Spec\n## Sec 1 <span id="csa-dup"></span>\n## Sec 2 <span id="csa-dup"></span>\n`, 'utf-8');
      expect(() => extractSpecAnchors(tempFile)).toThrow(/duplicate/i);
    } finally {
      try {
        unlinkSync(tempFile);
      } catch (e) {}
    }
  });

  it('should support complex anchors with uppercase and special characters', () => {
    const tempFile = join(FIXTURES_DIR, 'temp-complex-spec.md');
    try {
      writeFileSync(
        tempFile,
        `# Complex Spec\n## Sec 1 <span id="csa-My.Class:Method_Name"></span>\n## Sec 2 <span id="csa-Namespace/Module:Class.Field_1"></span>\n`,
        'utf-8'
      );
      const anchors = extractSpecAnchors(tempFile);
      expect(anchors).toHaveLength(2);
      expect(anchors[0].id).toBe('csa-My.Class:Method_Name');
      expect(anchors[1].id).toBe('csa-Namespace/Module:Class.Field_1');
    } finally {
      try {
        unlinkSync(tempFile);
      } catch (e) {}
    }
  });

  it('should ignore placeholder anchors containing ellipsis ...', () => {
    const tempFile = join(FIXTURES_DIR, 'temp-placeholder-spec.md');
    try {
      writeFileSync(
        tempFile,
        `# Spec\nExample 1: <span id="csa-..."></span>\nExample 2: <span id="csa-..."></span>\n`,
        'utf-8'
      );
      const anchors = extractSpecAnchors(tempFile);
      expect(anchors).toHaveLength(0); // Should ignore both
    } finally {
      try {
        unlinkSync(tempFile);
      } catch (e) {}
    }
  });

  describe('extractInheritsReferences', () => {
    it('should extract single inherits reference correctly', () => {
      const tempFile = join(FIXTURES_DIR, 'temp-single-inherit.md');
      try {
        writeFileSync(
          tempFile,
          `# Doc\nSome text.\n<span data-csa-inherits="csa-anchor-1"></span>\n`,
          'utf-8'
        );
        const refs = extractInheritsReferences(tempFile);
        expect(refs).toHaveLength(1);
        expect(refs[0]).toEqual({
          targetId: 'csa-anchor-1',
          line: 3
        });
      } finally {
        try {
          unlinkSync(tempFile);
        } catch (e) {}
      }
    });

    it('should extract multiple comma-separated inherits references with spacing', () => {
      const tempFile = join(FIXTURES_DIR, 'temp-multi-inherit.md');
      try {
        writeFileSync(
          tempFile,
          `# Doc\n<span data-csa-inherits="csa-anchor-1,  csa-anchor-2 ,csa-anchor-3"></span>\n`,
          'utf-8'
        );
        const refs = extractInheritsReferences(tempFile);
        expect(refs).toHaveLength(3);
        expect(refs[0]).toEqual({ targetId: 'csa-anchor-1', line: 2 });
        expect(refs[1]).toEqual({ targetId: 'csa-anchor-2', line: 2 });
        expect(refs[2]).toEqual({ targetId: 'csa-anchor-3', line: 2 });
      } finally {
        try {
          unlinkSync(tempFile);
        } catch (e) {}
      }
    });

    it('should filter out empty inherits references and ignore non-matching spans', () => {
      const tempFile = join(FIXTURES_DIR, 'temp-empty-inherit.md');
      try {
        writeFileSync(
          tempFile,
          `# Doc\n<span data-csa-inherits=", csa-anchor-1,, csa-anchor-2 ,"></span>\n<span id="csa-anchor-3"></span>\n`,
          'utf-8'
        );
        const refs = extractInheritsReferences(tempFile);
        expect(refs).toHaveLength(2);
        expect(refs[0]).toEqual({ targetId: 'csa-anchor-1', line: 2 });
        expect(refs[1]).toEqual({ targetId: 'csa-anchor-2', line: 2 });
      } finally {
        try {
          unlinkSync(tempFile);
        } catch (e) {}
      }
    });
  });
});
