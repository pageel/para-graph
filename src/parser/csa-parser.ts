import { readFileSync } from 'node:fs';

export interface SpecAnchorNode {
  id: string;
  title: string;
  line: number;
}

// @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-parser-markdown]
export function extractSpecAnchors(filePath: string): SpecAnchorNode[] {
  const content = readFileSync(filePath, 'utf-8');
  const anchorRegex = /<span\s+id=["'](csa-[a-z0-9-]+)["'][^>]*><\/span>/g;
  const results: SpecAnchorNode[] = [];
  const lines = content.split(/\r?\n/);
  const seenIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    let match;
    // Reset regex state
    anchorRegex.lastIndex = 0;
    if ((match = anchorRegex.exec(lines[i])) !== null) {
      const id = match[1];
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
