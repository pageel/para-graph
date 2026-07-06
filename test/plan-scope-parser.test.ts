import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, unlinkSync } from 'node:fs';
import { parsePlanSpecMapping } from '../src/parser/plan-scope-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

describe('Plan Scope Parser', () => {
  it('should extract unique spec IDs from ## CSA Spec Mapping Table', () => {
    const tempFile = join(FIXTURES_DIR, 'temp-valid-plan.md');
    const content = `
# Plan Title

Some text.

## CSA Spec Mapping Table

| Spec ID | Phase / Task | Target File | Note |
| :--- | :--- | :--- | :--- |
| \`csa-transitive-resolution\` | Walkthrough | — | Description |
| \`csa-transitive-parser\` | Phase 1.1 | csa-parser.ts | Description |
| \`csa-transitive-resolution\` | Phase 2.1 | duplicate.ts | Duplicate ID |
| \`csa-custom.dot_name/sub-feat\` | Phase 3.1 | complex.ts | Special chars |
`;

    try {
      writeFileSync(tempFile, content, 'utf-8');
      const specIds = parsePlanSpecMapping(tempFile);
      expect(specIds).toEqual([
        'csa-transitive-resolution',
        'csa-transitive-parser',
        'csa-custom.dot_name/sub-feat'
      ]);
    } finally {
      try {
        unlinkSync(tempFile);
      } catch (e) {}
    }
  });

  it('should return null when ## CSA Spec Mapping Table section is missing', () => {
    const tempFile = join(FIXTURES_DIR, 'temp-missing-section.md');
    const content = `
# Plan Title

No mapping table here.
`;

    try {
      writeFileSync(tempFile, content, 'utf-8');
      const specIds = parsePlanSpecMapping(tempFile);
      expect(specIds).toBeNull();
    } finally {
      try {
        unlinkSync(tempFile);
      } catch (e) {}
    }
  });

  it('should return empty array when table exists but contains no valid csa IDs', () => {
    const tempFile = join(FIXTURES_DIR, 'temp-empty-table.md');
    const content = `
# Plan Title

## CSA Spec Mapping Table

| Spec ID | Phase / Task | Target File | Note |
| :--- | :--- | :--- | :--- |
| some-non-csa-id | Phase 1 | file.ts | Not starting with csa- |
`;

    try {
      writeFileSync(tempFile, content, 'utf-8');
      const specIds = parsePlanSpecMapping(tempFile);
      expect(specIds).toEqual([]);
    } finally {
      try {
        unlinkSync(tempFile);
      } catch (e) {}
    }
  });
});
