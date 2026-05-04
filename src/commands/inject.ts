/**
 * para-graph inject command — Living Documentation & Auto-Harnessing.
 *
 * Scans Markdown files (Docs, Plans, Brainstorms) for graph bindings
 * and injects/updates graph context or blast radius.
 */

import { resolve, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, lstatSync, readdirSync } from 'node:fs';
import { findWorkspaceRoot } from '../utils/workspace.js';
import { ProjectGraph } from '../graph/store/ProjectGraph.js';
import { GraphStore } from '../graph/store/GraphStore.js';
import type { GraphNode } from '../graph/models.js';

export interface InjectOptions {
  target: string;
  projectName?: string;
  dryRun: boolean;
}

/**
 * Execute the inject command.
 */
export async function runInject(options: InjectOptions): Promise<void> {
  const target = resolve(options.target);
  
  if (!existsSync(target)) {
    console.error(`Error: Target path not found: ${target}`);
    process.exit(1);
  }

  const wsRoot = findWorkspaceRoot(target);
  if (!wsRoot) {
    console.error('Error: Could not find PARA workspace root (.para-workspace.yml).');
    process.exit(1);
  }

  let projectName = options.projectName;
  if (!projectName) {
    const parts = target.split(/[\\/]/);
    const projectsIdx = parts.lastIndexOf('Projects');
    if (projectsIdx !== -1 && parts[projectsIdx + 1]) {
      projectName = parts[projectsIdx + 1];
    }
  }

  if (!projectName) {
    console.error('Error: Could not determine project name. Use --project <name>.');
    process.exit(1);
  }

  console.log(`[para-graph] Loading graph for project: ${projectName}`);
  const graph = GraphStore.getGraph(wsRoot, projectName);
  const stats = graph.getStats();
  console.log(`[para-graph] Loaded ${stats.nodeCount} nodes, ${stats.edgeCount} edges.`);

  const files: string[] = [];
  const stat = lstatSync(target);
  if (stat.isDirectory()) {
    const items = readdirSync(target, { recursive: true }) as string[];
    for (const item of items) {
      if (item.endsWith('.md')) {
        files.push(join(target, item));
      }
    }
  } else if (target.endsWith('.md')) {
    files.push(target);
  }

  if (files.length === 0) {
    console.log('[para-graph] No Markdown files found to process.');
    return;
  }

  console.log(`[para-graph] Processing ${files.length} file(s)...`);

  for (const file of files) {
    await processFile(file, graph, options, projectName);
  }
}

/**
 * Process a single Markdown file.
 */
async function processFile(filePath: string, graph: ProjectGraph, options: InjectOptions, projectName: string): Promise<void> {
  const content = readFileSync(filePath, 'utf-8');
  const fm = parseFrontmatter(content);

  if (!fm) return;

  const graphNodeIds = fm.graph_nodes || fm.impact_nodes || fm.deprecate_nodes;
  if (!graphNodeIds || !Array.isArray(graphNodeIds)) return;

  console.log(`[para-graph] Found ${graphNodeIds.length} node bindings in: ${filePath}`);

  const nodes: GraphNode[] = [];
  const missingNodes: string[] = [];

  for (const id of graphNodeIds) {
    const node = graph.getNode(id);
    if (node) {
      nodes.push(node);
    } else {
      missingNodes.push(id);
    }
  }

  if (missingNodes.length > 0) {
    console.error(`[para-graph] Error: Missing nodes in graph: ${missingNodes.join(', ')}`);
    if (options.dryRun) {
      process.exit(1);
    }
  }

  let newContent = content;

  // 1. Docs Logic (graph_nodes)
  if (fm.graph_nodes) {
    const table = generateGraphContextTable(nodes);
    newContent = injectBlock(newContent, '📊 Graph Context', table);
  }

  // 2. Plans Logic (impact_nodes)
  if (fm.impact_nodes) {
    console.log(`[para-graph] Performing impact analysis for ${nodes.length} nodes...`);
    const affectedNodes = new Set<string>();
    for (const node of nodes) {
      const result = graph.traverseReverse(node.id, 2, 'upstream');
      result.nodes.forEach(n => affectedNodes.add(n.filePath));
    }
    
    const riskTable = generateRisksTable(nodes, Array.from(affectedNodes));
    newContent = injectBlock(newContent, 'Risks & Mitigations', riskTable);
    
    const guard = generateHarnessGuard(Array.from(affectedNodes));
    newContent = injectHarnessGuard(newContent, guard);
  }

  // 3. Brainstorm Logic (deprecate_nodes)
  if (fm.deprecate_nodes) {
    const warning = generateBrainstormWarning(nodes, graph);
    newContent = injectBlock(newContent, '⚠️ Architectural Validation', warning);
  }

  if (newContent !== content) {
    if (options.dryRun) {
      console.log(`[para-graph] [Dry Run] Would update: ${filePath}`);
    } else {
      writeFileSync(filePath, newContent, 'utf-8');
      console.log(`[para-graph] Updated: ${filePath}`);
    }
  }
}

function generateGraphContextTable(nodes: GraphNode[]): string {
  let table = '## 📊 Graph Context\n\n';
  table += '| Node ID | Type | Summary | Complexity |\n';
  table += '| :--- | :--- | :--- | :--- |\n';
  for (const node of nodes) {
    const summary = node.semantic?.summary || '_Pending enrichment_';
    const complexity = node.semantic?.complexity || '_N/A_';
    table += `| \`${node.id}\` | ${node.type} | ${summary} | ${complexity} |\n`;
  }
  return table;
}

function generateRisksTable(nodes: GraphNode[], affectedFiles: string[]): string {
  let table = '## Risks & Mitigations\n\n';
  table += '| Risk | Mitigation | Blast Radius |\n';
  table += '| :--- | :--- | :--- |\n';
  table += `| Regressions in dependent modules | Run full test suite for affected files | ${affectedFiles.length} files |\n`;
  table += `| Context decay during implementation | Use HARNESS GUARD and re-read context | High |\n`;
  return table;
}

function generateHarnessGuard(affectedFiles: string[]): string {
  const list = affectedFiles.slice(0, 5).map(f => `\`${f}\``).join(', ');
  const suffix = affectedFiles.length > 5 ? ` and ${affectedFiles.length - 5} more` : '';
  return `<!-- ⚠️ HARNESS GUARD: Blast Radius covers ${affectedFiles.length} files including ${list}${suffix}. Verify impact before commit. -->`;
}

function generateBrainstormWarning(nodes: GraphNode[], graph: ProjectGraph): string {
  let warning = '## ⚠️ Architectural Validation\n\n';
  warning += '> [!WARNING]\n';
  warning += '> Deprecating these nodes will affect upstream dependencies:\n\n';
  for (const node of nodes) {
    const result = graph.traverseReverse(node.id, 1, 'upstream');
    if (result.nodes.length > 0) {
      warning += `- \`${node.id}\` is used by: ${result.nodes.map(n => `\`${n.id}\``).join(', ')}\n`;
    }
  }
  return warning;
}

function injectBlock(content: string, title: string, newBlock: string): string {
  const lines = content.split('\n');
  const titleLine = `## ${title}`;
  const startIndex = lines.findIndex(l => l.trim().startsWith(titleLine));
  
  if (startIndex !== -1) {
    // Find next header or end of file
    let endIndex = lines.findIndex((l, i) => i > startIndex && l.trim().startsWith('## '));
    if (endIndex === -1) endIndex = lines.length;
    
    lines.splice(startIndex, endIndex - startIndex, newBlock.trim());
    return lines.join('\n');
  } else {
    return content.trim() + '\n\n' + newBlock.trim() + '\n';
  }
}

function injectHarnessGuard(content: string, guard: string): string {
  if (content.includes('<!-- ⚠️ HARNESS GUARD')) {
    return content.replace(/<!-- ⚠️ HARNESS GUARD[\s\S]*?-->/g, guard);
  }
  // Inject before Implementation Phases or at end
  const phaseIndex = content.indexOf('## Implementation Phases');
  if (phaseIndex !== -1) {
    return content.slice(0, phaseIndex) + guard + '\n\n' + content.slice(phaseIndex);
  }
  return content.trim() + '\n\n' + guard + '\n';
}

function parseFrontmatter(content: string): any {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const yaml = match[1];
  const result: any = {};
  const lines = yaml.split(/\r?\n/);
  let currentKey: string | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('-') && currentKey) {
      if (!Array.isArray(result[currentKey])) result[currentKey] = [];
      result[currentKey].push(trimmed.slice(1).trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      currentKey = key;
      if (value) {
        if (value.startsWith('[') && value.endsWith(']')) {
          result[key] = value.slice(1, -1).split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''));
        } else {
          result[key] = value.replace(/^['"]|['"]$/g, '');
        }
      } else {
        result[key] = null;
      }
    }
  }
  return result;
}
