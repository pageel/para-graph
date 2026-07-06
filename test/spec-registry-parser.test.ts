import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, unlinkSync } from 'node:fs';
import { parseSpecRegistry } from '../src/utils/spec-registry-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

describe('Spec Registry Parser', () => {
  it('should parse specification registry table and return Map of entries', () => {
    const tempFile = join(FIXTURES_DIR, 'temp-readme.md');
    const content = `
# Spec Index

## Specification Registry

| Symbol | Spec File | Created Date | Version | Business Status | CSA Status | CSA Anchors | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| \`S1\` | [spec-a.md](file:///path/to/spec-a.md) | 2026-04-23 | \`v0.12.0\` | ✅ Approved | ✅ CSA-ified | 4 anchors | Note |
| \`S17\` | [spec-b.md](file:///path/to/spec-b.md) | 2026-07-06 | \`v0.17.6.5\` | 📝 Draft | ✅ CSA-ified | 25 anchors | Note |
| \`S18\` | spec-c.md | 2026-07-06 | \`v0.17.6.5\` | 📋 Planned | ⚠️ Uncurated | 0 anchors | Text format |
`;

    try {
      writeFileSync(tempFile, content, 'utf-8');
      const registry = parseSpecRegistry(tempFile);
      expect(registry.size).toBe(3);

      const entryA = registry.get('spec-a.md');
      expect(entryA).toBeDefined();
      expect(entryA).toEqual({
        symbol: 'S1',
        filePath: 'spec-a.md',
        businessStatus: '✅ Approved',
        csaStatus: '✅ CSA-ified',
        anchorCount: 4
      });

      const entryB = registry.get('spec-b.md');
      expect(entryB).toBeDefined();
      expect(entryB).toEqual({
        symbol: 'S17',
        filePath: 'spec-b.md',
        businessStatus: '📝 Draft',
        csaStatus: '✅ CSA-ified',
        anchorCount: 25
      });

      const entryC = registry.get('spec-c.md');
      expect(entryC).toBeDefined();
      expect(entryC).toEqual({
        symbol: 'S18',
        filePath: 'spec-c.md',
        businessStatus: '📋 Planned',
        csaStatus: '⚠️ Uncurated',
        anchorCount: 0
      });
    } finally {
      try {
        unlinkSync(tempFile);
      } catch (e) {}
    }
  });

  it('should return empty Map when heading is missing', () => {
    const tempFile = join(FIXTURES_DIR, 'temp-missing-readme.md');
    const content = `
# Spec Index

No index here.
`;

    try {
      writeFileSync(tempFile, content, 'utf-8');
      const registry = parseSpecRegistry(tempFile);
      expect(registry.size).toBe(0);
    } finally {
      try {
        unlinkSync(tempFile);
      } catch (e) {}
    }
  });
});
