// @para-doc [#csa-gate2-registry-parser]
import { readFileSync, existsSync } from 'node:fs';

export interface SpecRegistryEntry {
  symbol: string;
  filePath: string;
  businessStatus: string;
  csaStatus: string;
  anchorCount: number;
}

export function parseSpecRegistry(readmePath: string): Map<string, SpecRegistryEntry> {
  const registry = new Map<string, SpecRegistryEntry>();

  if (!existsSync(readmePath)) {
    console.warn(`[Spec Registry Parser] Registry file not found: ${readmePath}`);
    return registry;
  }

  const content = readFileSync(readmePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  // Find the registry heading.
  // Variations: Vietnamese heading (using unicode escapes) or "## Specification Registry"
  let startIndex = -1;
  const headingRegex = /(specification registry|ch\u0129\s+m\u1ee5c\s+\u0111\u1eb7c\s+t\u1ea3)/i;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('##') && headingRegex.test(line)) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    console.warn(`[Spec Registry Parser] Registry heading not found in ${readmePath}`);
    return registry;
  }

  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/;
  const backtickRegex = /`([^`]+)`/;

  let tableRowIndex = 0;

  // Parse lines below heading. Stop if we encounter another heading or non-table line.
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') {
      continue;
    }
    
    // Check if we hit another heading (which starts with #)
    if (line.startsWith('#')) {
      break;
    }

    if (line.startsWith('|')) {
      tableRowIndex++;
      
      // Skip the first row (header row) and the second row (separator row)
      if (tableRowIndex <= 2) {
        continue;
      }

      const cols = line.split('|').map(col => col.trim());
      // cols[0] is empty because of leading '|'
      // cols[1] -> Symbol
      // cols[2] -> Spec File Path
      // cols[3] -> Created Date
      // cols[4] -> Version
      // cols[5] -> Business Status
      // cols[6] -> CSA Status
      // cols[7] -> CSA Anchors
      if (cols.length >= 8) {
        let symbol = cols[1];
        // Clean backticks around symbol if any
        const symMatch = backtickRegex.exec(symbol);
        if (symMatch) {
          symbol = symMatch[1];
        }

        let filePath = cols[2];
        const linkMatch = linkRegex.exec(filePath);
        if (linkMatch) {
          filePath = linkMatch[1]; // Text inside the link (e.g. spec-name.md)
        }

        const businessStatus = cols[5];
        const csaStatus = cols[6];
        
        let anchorCount = 0;
        const anchorStr = cols[7];
        const countMatch = /(\d+)\s+anchor/.exec(anchorStr.toLowerCase());
        if (countMatch) {
          anchorCount = parseInt(countMatch[1], 10);
        }

        registry.set(filePath, {
          symbol,
          filePath,
          businessStatus,
          csaStatus,
          anchorCount
        });
      }
    }
  }

  return registry;
}
