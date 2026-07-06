// @para-doc [#csa-gate1-plan-parser]
import { readFileSync, existsSync } from 'node:fs';

export function parsePlanSpecMapping(planFilePath: string): string[] | null {
  if (!existsSync(planFilePath)) {
    console.warn(`[Plan Parser] File not found: ${planFilePath}`);
    return null;
  }

  const content = readFileSync(planFilePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  
  // Find ## CSA Spec Mapping Table heading (case-insensitive) or Bang Mapping CSA Spec Anchor
  let tableStartIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].trim().toLowerCase();
    if (lineLower.includes('csa spec mapping') || lineLower.includes('mapping csa spec anchor')) {
      tableStartIndex = i;
      break;
    }
  }

  if (tableStartIndex === -1) {
    console.warn(`[Plan Parser] Heading containing "csa spec mapping" or "mapping csa spec anchor" not found in ${planFilePath}`);
    return null;
  }

  const specIds: string[] = [];
  const idRegex = /^`?(csa-[a-zA-Z0-9._\/-]+)`?$/;

  // Parse lines below the heading until another heading or end of file
  for (let i = tableStartIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#')) {
      // Encountered another heading, stop parsing
      break;
    }
    
    // We expect markdown table rows to start and end with '|'
    if (line.startsWith('|')) {
      // Skip the separator row (e.g. | :--- | :--- |)
      if (line.includes(':---') || line.includes('---:')) {
        continue;
      }
      
      const columns = line.split('|').map(col => col.trim());
      // columns[0] is empty because the line starts with '|'
      // columns[1] is the first column (Spec ID)
      if (columns.length > 1) {
        const specIdCol = columns[1];
        const match = idRegex.exec(specIdCol);
        if (match) {
          specIds.push(match[1]);
        }
      }
    }
  }

  // Return unique, de-duplicated spec IDs
  return Array.from(new Set(specIds));
}
