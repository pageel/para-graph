// @para-doc [#csa-reverse-spec-workflow]
// @para-doc [#csa-reverse-spec-objective]
// @para-doc [#csa-boundaries]
// @para-doc [#csa-governance]
// @para-doc [#csa-project-structure]
// @para-doc [#csa-sc-reverse-output]
import { readFileSync } from 'node:fs';
import type { SpecMetadata } from '../graph/models.js';

// @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-SpecAnchorNode]
export interface SpecAnchorNode {
  id: string;
  title: string;
  line: number;
  specMeta?: SpecMetadata;
}

// @para-doc [#csa-parser-metadata-extraction]
// @para-doc [#csa-sc-metadata-parse]
// @para-doc [#csa-extract-spec-metadata]
export function extractSpecMetadata(filePath: string): SpecMetadata {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).slice(0, 30); // metadata in first 30 lines
  const meta: SpecMetadata = {};
  
  const metaRegex = /^>\s*\*\*(Deprecated|Deprecated-By|Renamed-From|Anchor-Prefix):\*\*\s*(.+)/i;
  for (const line of lines) {
    const match = metaRegex.exec(line);
    if (match) {
      const [, key, value] = match;
      switch (key.toLowerCase()) {
        case 'deprecated': meta.deprecated = value.trim().toLowerCase() === 'true'; break;
        case 'deprecated-by': meta.deprecatedBy = value.trim(); break;
        case 'renamed-from': meta.renamedFrom = value.trim(); break;
        case 'anchor-prefix': meta.anchorPrefix = value.trim(); break;
      }
    }
  }
  return meta;
}

// @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-src/parser/csa-parser.ts]
// @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-parser-markdown]
export function extractSpecAnchors(filePath: string): SpecAnchorNode[] {
  const content = readFileSync(filePath, 'utf-8');
  const anchorRegex = /<span\s+id=["'](csa-[a-zA-Z0-9.:\/_-]+)["'][^>]*><\/span>/g;
  const results: SpecAnchorNode[] = [];
  const lines = content.split(/\r?\n/);
  const seenIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    let match;
    // Reset regex state
    anchorRegex.lastIndex = 0;
    while ((match = anchorRegex.exec(lines[i])) !== null) {
      const id = match[1];
      if (id.includes('...')) {
        continue;
      }
      if (seenIds.has(id)) {
        throw new Error(`Duplicate CSA anchor ID: "${id}" in file ${filePath}`);
      }
      seenIds.add(id);
      
      results.push({
        id,
        title: lines[i].replace(/<[^>]*>/g, '').trim(),
        line: i + 1,
      });
    }
  }
  return results;
}
