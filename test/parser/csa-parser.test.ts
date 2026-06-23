import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, unlinkSync } from 'node:fs';
import { extractSpecAnchors } from '../../src/parser/csa-parser.js';

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
});
