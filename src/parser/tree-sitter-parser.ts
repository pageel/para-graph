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
import type { GraphNode, GraphEdge, EdgeConfidence } from '../graph/models.js';
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
      const bufferSize = Math.max(32768, content.length * 2 + 1024);
      tree = this.parser.parse(content, null, { bufferSize });
    } catch (error) {
      console.warn(`[para-graph] Warning: Failed to parse file ${filePath}. Skipping... Error: ${(error as Error).message}`);
      return;
    }

    const relPath = relative(this.rootDir, filePath).replace(/\\/g, '/');
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

    // Step 6: Extract @para-doc comments and add DOCUMENTED_BY edges
    this.extractCsaComments(lines, relPath, graph);
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
   * - @relation.call + @relation.call.object + @relation.call.method → EdgeRelation.CALLS (member call)
   * - @relation.call + @relation.call.new → EdgeRelation.CALLS (constructor)
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

    // Track interface context
    let currentInterfaceEndRow: number = -1;

    // Track the current function/method/variable scope for CALLS edge sourceId
    // Wrapper captures (@entity.function, @entity.method, @entity.variable) set the
    // scope boundary (endRow), then .name captures set the scope ID.
    let currentScopeId: string | null = null;
    let currentScopeEndRow: number = -1;

    // State machine for member call pairing (object + method)
    let pendingCallObject: string | null = null;
    let pendingCallLine: number | null = null;

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
            endLine: currentClassEndRow !== -1 ? currentClassEndRow + 1 : endLine,
            exportType,
            signature,
          });
          break;
        }

        // --- Entity: Function (wrapper — sets scope boundary) ---
        case 'entity.function': {
          currentScopeEndRow = node.endPosition.row;
          break;
        }
        case 'entity.function.name': {
          const exportType = this.detectExportFromRanges(node.startPosition.row, exportRanges);
          const signature = (lines[startLine - 1] ?? '').trim();
          const entityId = `${filePath}::${node.text}`;
          graph.addNode({
            id: entityId,
            type: NodeType.FUNCTION,
            name: node.text,
            filePath,
            startLine,
            endLine: currentScopeEndRow !== -1 ? currentScopeEndRow + 1 : endLine,
            exportType,
            signature,
          });
          currentScopeId = entityId;
          break;
        }

        // --- Entity: Interface ---
        case 'entity.interface': {
          currentInterfaceEndRow = node.endPosition.row;
          break;
        }
        case 'entity.interface.name': {
          const exportType = this.detectExportFromRanges(node.startPosition.row, exportRanges);
          const signature = (lines[startLine - 1] ?? '').trim();
          graph.addNode({
            id: `${filePath}::${node.text}`,
            type: NodeType.INTERFACE,
            name: node.text,
            filePath,
            startLine,
            endLine: currentInterfaceEndRow !== -1 ? currentInterfaceEndRow + 1 : endLine,
            exportType,
            signature,
          });
          break;
        }

        // --- Entity: Method (wrapper — sets scope boundary) ---
        case 'entity.method': {
          currentScopeEndRow = node.endPosition.row;
          break;
        }
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
            endLine: currentScopeEndRow !== -1 ? currentScopeEndRow + 1 : endLine,
            exportType: ExportType.NONE,
            signature,
          });
          currentScopeId = methodId;
          break;
        }

        // --- Entity: Variable (wrapper — sets scope boundary for arrow fns) ---
        case 'entity.variable': {
          currentScopeEndRow = node.endPosition.row;
          break;
        }
        case 'entity.variable.name': {
          const exportType = this.detectExportFromRanges(node.startPosition.row, exportRanges);
          const signature = (lines[startLine - 1] ?? '').trim();
          const entityId = `${filePath}::${node.text}`;
          graph.addNode({
            id: entityId,
            type: NodeType.FUNCTION,
            name: node.text,
            filePath,
            startLine,
            endLine: currentScopeEndRow !== -1 ? currentScopeEndRow + 1 : endLine,
            exportType,
            signature,
          });
          currentScopeId = entityId;
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
            confidence: 'EXTRACTED',
          };
          graph.addEdge(edge);
          break;
        }

        // --- Relation: Call ---
        case 'relation.call.target': {
          const inScope = currentScopeId && node.startPosition.row <= currentScopeEndRow;
          const edge: GraphEdge = {
            sourceId: inScope ? currentScopeId! : filePath,
            targetId: node.text,
            relation: EdgeRelation.CALLS,
            sourceFile: filePath,
            sourceLine: startLine,
            confidence: 'EXTRACTED',
          };
          graph.addEdge(edge);
          break;
        }

        // --- Relation: Member Call (object.method) ---
        case 'relation.call.object': {
          // Store object name temporarily — will be paired with method
          pendingCallObject = node.text;
          pendingCallLine = startLine;
          break;
        }
        case 'relation.call.method': {
          const obj = pendingCallObject ?? '?unresolved';
          const confidence: EdgeConfidence = obj === '?unresolved' ? 'AMBIGUOUS' : 'EXTRACTED';
          const callLine = pendingCallLine ?? startLine;
          const inScope = currentScopeId && node.startPosition.row <= currentScopeEndRow;
          const edge: GraphEdge = {
            sourceId: inScope ? currentScopeId! : filePath,
            targetId: `${obj}::${node.text}`,
            relation: EdgeRelation.CALLS,
            sourceFile: filePath,
            sourceLine: callLine,
            confidence,
          };
          graph.addEdge(edge);
          pendingCallObject = null;
          pendingCallLine = null;
          break;
        }

        // --- Relation: Constructor Call (new ClassName) ---
        case 'relation.call.new': {
          const inScope = currentScopeId && node.startPosition.row <= currentScopeEndRow;
          const edge: GraphEdge = {
            sourceId: inScope ? currentScopeId! : filePath,
            targetId: `${node.text}::constructor`,
            relation: EdgeRelation.CALLS,
            sourceFile: filePath,
            sourceLine: startLine,
            confidence: 'EXTRACTED',
          };
          graph.addEdge(edge);
          break;
        }

        default:
          // Ignore other captures (@relation.import, @relation.call wrappers, etc.)
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

  /**
   * Scan lines for @para-doc references and link to the most specific matching node.
   * @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-TreeSitterParser.extractCsaComments]
   * @para-doc [artifacts/specs/spec-2026-06-16-csa-spec-intelligence.md#csa-parser-comments]
   */
  private extractCsaComments(lines: string[], relPath: string, graph: CodeGraph): void {
    const csaRegex = /@para-doc\s+\[?(?:([^\]#\s]+)#)?([^\]\s]+)\]?/g;
    const allNodes = graph.getAllNodes();

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match;
      csaRegex.lastIndex = 0;
      
      while ((match = csaRegex.exec(lineText)) !== null) {
        const anchorId = match[2];
        const lineNum = i + 1;

        // First check if a node starts immediately on the next line (L + 1)
        const nodeStartingAfter = allNodes.filter(
          (n) =>
            n.filePath === relPath &&
            n.type !== NodeType.FILE &&
            n.startLine === lineNum + 1
        );

        let sourceId = relPath; // Default to file-level
        if (nodeStartingAfter.length > 0) {
          // Sort by startLine ascending to find the closest one
          nodeStartingAfter.sort((a, b) => a.startLine - b.startLine);
          sourceId = nodeStartingAfter[0].id;
        } else {
          // Fallback to containing nodes for comments inside blocks
          const containingNodes = allNodes.filter(
            (n) =>
              n.filePath === relPath &&
              n.type !== NodeType.FILE &&
              n.startLine <= lineNum &&
              n.endLine >= lineNum
          );
          if (containingNodes.length > 0) {
            // Sort by span length ascending to find the most specific node
            containingNodes.sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine));
            sourceId = containingNodes[0].id;
          }
        }

        const edge: GraphEdge = {
          sourceId,
          targetId: anchorId,
          relation: EdgeRelation.DOCUMENTED_BY,
          sourceFile: relPath,
          sourceLine: lineNum,
          confidence: 'EXTRACTED',
        };
        graph.addEdge(edge);
      }
    }
  }
}
