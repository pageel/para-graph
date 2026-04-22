/**
 * TreeSitterParser — Query-based parser using SSEC .scm files.
 *
 * Architecture: Pure Query-based (SSEC)
 * - No hardcoded language-specific AST walking
 * - Each language defined by .scm query file with SSEC tags
 * - Language detection via Registry (extension → profile)
 *
 * Reference: brainstorm-2026-04-22-query-based-parser
 */

import { readFileSync } from 'node:fs';
import { relative, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Parser = require('tree-sitter');

import { CodeGraph } from '../graph/code-graph.js';
import { NodeType, EdgeRelation, ExportType } from '../graph/models.js';
import type { GraphNode, GraphEdge } from '../graph/models.js';
import {
  getProfile,
  loadLanguageModule,
  resolveQueryPath,
} from './registry.js';
import type { Capture, LanguageProfile } from './registry.js';

/** Tree-sitter AST node type (from CJS require — no ESM type export) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SyntaxNode = any;

export class TreeSitterParser {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parser: any;
  private rootDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private queryCache: Map<string, any> = new Map();

  /**
   * @param rootDir - Project root directory (used for relative path calculation)
   */
  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.parser = new Parser();
  }

  /**
   * Parse a single source file and add its entities/relations to the graph.
   * Language is auto-detected from file extension via Registry.
   *
   * @param filePath - Absolute path to the source file
   * @param graph - CodeGraph instance to populate
   */
  parseFile(filePath: string, graph: CodeGraph): void {
    const ext = extname(filePath);
    const profile = getProfile(ext);

    if (!profile) {
      // Unsupported extension — skip silently
      return;
    }

    // Step 1: Load language module (lazy, cached)
    const languageModule = loadLanguageModule(profile);
    if (!languageModule) return;

    // Step 2: Set language and parse
    this.parser.setLanguage(languageModule);
    const content = readFileSync(filePath, 'utf-8');

    let tree: SyntaxNode;
    try {
      tree = this.parser.parse(content);
    } catch (error) {
      console.warn(`[para-graph] Warning: Failed to parse file ${filePath}. Skipping...`);
      return;
    }

    const relPath = relative(this.rootDir, filePath);
    const lines = content.split('\n');

    // Add FILE node
    const fileNode: GraphNode = {
      id: relPath,
      type: NodeType.FILE,
      name: relPath,
      filePath: relPath,
      startLine: 1,
      endLine: lines.length,
      exportType: ExportType.NONE,
      signature: relPath,
    };
    graph.addNode(fileNode);

    // Step 3: Run SSEC query
    const query = this.getQuery(profile, languageModule);
    if (!query) return;

    const captures: Capture[] = query.captures(tree.rootNode);

    // Step 4: Map captures to graph
    this.mapCapturesToGraph(captures, relPath, lines, graph);

    // Step 5: Run post-process hook if defined
    if (profile.postProcess) {
      profile.postProcess(captures, graph);
    }
  }

  /**
   * Load and cache the SSEC query for a language profile.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getQuery(profile: LanguageProfile, languageModule: any): any {
    const cacheKey = profile.queryFile;
    if (this.queryCache.has(cacheKey)) {
      return this.queryCache.get(cacheKey);
    }

    try {
      const queryPath = resolveQueryPath(profile);
      const querySource = readFileSync(queryPath, 'utf-8');

      if (!querySource.trim()) {
        // Empty .scm file — language not yet implemented
        return null;
      }

      // node-tree-sitter API: new Parser.Query(language, querySource)
      const query = new Parser.Query(languageModule, querySource);
      this.queryCache.set(cacheKey, query);
      return query;
    } catch (error) {
      console.warn(
        `[para-graph] Warning: Failed to load query file for ${profile.name}. ` +
        `Error: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Map SSEC captures to GraphNodes and GraphEdges.
   *
   * SSEC Tag Mapping:
   * - @entity.class + @entity.class.name → NodeType.CLASS
   * - @entity.function + @entity.function.name → NodeType.FUNCTION
   * - @entity.interface + @entity.interface.name → NodeType.INTERFACE
   * - @entity.method + @entity.method.name → NodeType.FUNCTION (id: ClassName.methodName)
   * - @entity.variable + @entity.variable.name → NodeType.FUNCTION (arrow fns)
   * - @relation.import + @relation.import.source → EdgeRelation.IMPORTS_FROM
   * - @relation.call + @relation.call.target → EdgeRelation.CALLS
   * - @export.statement → ExportType detection
   */
  private mapCapturesToGraph(
    captures: Capture[],
    filePath: string,
    lines: string[],
    graph: CodeGraph,
  ): void {
    // Collect export statement ranges for export detection
    const exportRanges: Array<{ startRow: number; endRow: number }> = [];

    // Track the current class context for method → class association
    let currentClassName: string | null = null;
    let currentClassEndRow: number = -1;

    for (const capture of captures) {
      const { name, node } = capture;
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;

      switch (name) {
        // --- Export detection ---
        case 'export.statement': {
          exportRanges.push({
            startRow: node.startPosition.row,
            endRow: node.endPosition.row,
          });
          break;
        }

        // --- Entity: Class ---
        case 'entity.class': {
          currentClassName = null; // Will be set by entity.class.name
          currentClassEndRow = node.endPosition.row;
          break;
        }
        case 'entity.class.name': {
          currentClassName = node.text;
          const exportType = this.detectExportFromRanges(node.startPosition.row, exportRanges);
          const signature = (lines[startLine - 1] ?? '').trim();
          graph.addNode({
            id: `${filePath}::${node.text}`,
            type: NodeType.CLASS,
            name: node.text,
            filePath,
            startLine,
            endLine,
            exportType,
            signature,
          });
          break;
        }

        // --- Entity: Function ---
        case 'entity.function.name': {
          const exportType = this.detectExportFromRanges(node.startPosition.row, exportRanges);
          const signature = (lines[startLine - 1] ?? '').trim();
          graph.addNode({
            id: `${filePath}::${node.text}`,
            type: NodeType.FUNCTION,
            name: node.text,
            filePath,
            startLine,
            endLine,
            exportType,
            signature,
          });
          break;
        }

        // --- Entity: Interface ---
        case 'entity.interface.name': {
          const exportType = this.detectExportFromRanges(node.startPosition.row, exportRanges);
          const signature = (lines[startLine - 1] ?? '').trim();
          graph.addNode({
            id: `${filePath}::${node.text}`,
            type: NodeType.INTERFACE,
            name: node.text,
            filePath,
            startLine,
            endLine,
            exportType,
            signature,
          });
          break;
        }

        // --- Entity: Method (inside class) ---
        case 'entity.method.name': {
          // Associate method with current class if within class body
          const className = (node.startPosition.row <= currentClassEndRow)
            ? currentClassName
            : null;
          const methodId = className
            ? `${filePath}::${className}.${node.text}`
            : `${filePath}::${node.text}`;
          const methodName = className
            ? `${className}.${node.text}`
            : node.text;
          const signature = (lines[startLine - 1] ?? '').trim();

          graph.addNode({
            id: methodId,
            type: NodeType.FUNCTION,
            name: methodName,
            filePath,
            startLine,
            endLine,
            exportType: ExportType.NONE,
            signature,
          });
          break;
        }

        // --- Entity: Variable (arrow function) ---
        case 'entity.variable.name': {
          const exportType = this.detectExportFromRanges(node.startPosition.row, exportRanges);
          const signature = (lines[startLine - 1] ?? '').trim();
          graph.addNode({
            id: `${filePath}::${node.text}`,
            type: NodeType.FUNCTION,
            name: node.text,
            filePath,
            startLine,
            endLine,
            exportType,
            signature,
          });
          break;
        }

        // --- Relation: Import ---
        case 'relation.import.source': {
          const importSource = node.text.replace(/['"]/g, '');
          const edge: GraphEdge = {
            sourceId: filePath,
            targetId: importSource,
            relation: EdgeRelation.IMPORTS_FROM,
            sourceFile: filePath,
            sourceLine: startLine,
          };
          graph.addEdge(edge);
          break;
        }

        // --- Relation: Call ---
        case 'relation.call.target': {
          const edge: GraphEdge = {
            sourceId: filePath,
            targetId: node.text,
            relation: EdgeRelation.CALLS,
            sourceFile: filePath,
            sourceLine: startLine,
          };
          graph.addEdge(edge);
          break;
        }

        default:
          // Ignore wrapper captures (@entity.class, @entity.function, etc.)
          break;
      }
    }
  }

  /**
   * Detect export type by checking if a node's row falls within
   * any collected export_statement range.
   */
  private detectExportFromRanges(
    nodeRow: number,
    exportRanges: Array<{ startRow: number; endRow: number }>,
  ): ExportType {
    for (const range of exportRanges) {
      if (nodeRow >= range.startRow && nodeRow <= range.endRow) {
        // TODO: Detect DEFAULT vs NAMED export (needs .scm enhancement)
        return ExportType.NAMED;
      }
    }
    return ExportType.NONE;
  }
}
