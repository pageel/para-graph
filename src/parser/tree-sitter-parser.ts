/**
 * TreeSitterParser — Parses TypeScript files using Tree-sitter AST
 * and populates a CodeGraph with structural nodes and edges.
 *
 * Clean Room Design (H2-1): All query patterns and parsing logic
 * written from scratch based on official Tree-sitter documentation.
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript/typescript');
import { CodeGraph } from '../graph/code-graph.js';
import { NodeType, EdgeRelation, ExportType } from '../graph/models.js';
import type { GraphNode, GraphEdge } from '../graph/models.js';

/** Tree-sitter AST node type (from CJS require — no ESM type export) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SyntaxNode = any;

export class TreeSitterParser {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parser: any;
  private rootDir: string;

  /**
   * @param rootDir - Project root directory (used for relative path calculation)
   */
  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.parser = new Parser();
    this.parser.setLanguage(TypeScript);
  }

  /**
   * Parse a single TypeScript file and add its entities/relations to the graph.
   *
   * @param filePath - Absolute path to the .ts file
   * @param graph - CodeGraph instance to populate
   */
  parseFile(filePath: string, graph: CodeGraph): void {
    const content = readFileSync(filePath, 'utf-8');
    const tree = this.parser.parse(content);
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

    // Walk the root children to extract declarations
    this.extractDeclarations(tree.rootNode, relPath, lines, graph);
    this.extractImports(tree.rootNode, relPath, graph);
    this.extractCalls(tree.rootNode, relPath, graph);
  }

  /**
   * Extract declaration nodes (classes, functions, interfaces, arrow fns, methods).
   */
  private extractDeclarations(
    rootNode: SyntaxNode,
    filePath: string,
    lines: string[],
    graph: CodeGraph,
  ): void {
    const visit = (node: SyntaxNode): void => {
      switch (node.type) {
        case 'class_declaration': {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            graph.addNode(this.createNode(
              filePath, nameNode.text, NodeType.CLASS, node, lines,
              this.detectExport(node),
            ));
          }
          // Look for methods inside the class body
          const classBody = node.childForFieldName('body');
          if (classBody) {
            for (const child of classBody.children) {
              if (child.type === 'method_definition') {
                const methodName = child.childForFieldName('name');
                if (methodName) {
                  graph.addNode(this.createNode(
                    filePath,
                    `${nameNode?.text ?? ''}.${methodName.text}`,
                    NodeType.FUNCTION,
                    child,
                    lines,
                    ExportType.NONE,
                  ));
                }
              }
            }
          }
          break;
        }

        case 'function_declaration': {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            graph.addNode(this.createNode(
              filePath, nameNode.text, NodeType.FUNCTION, node, lines,
              this.detectExport(node),
            ));
          }
          break;
        }

        case 'interface_declaration': {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            graph.addNode(this.createNode(
              filePath, nameNode.text, NodeType.INTERFACE, node, lines,
              this.detectExport(node),
            ));
          }
          break;
        }

        case 'lexical_declaration': {
          // Detect arrow functions: const foo = () => {}
          for (const declarator of node.children) {
            if (declarator.type === 'variable_declarator') {
              const nameChild = declarator.childForFieldName('name');
              const valueChild = declarator.childForFieldName('value');
              if (nameChild && valueChild?.type === 'arrow_function') {
                graph.addNode(this.createNode(
                  filePath, nameChild.text, NodeType.FUNCTION, node, lines,
                  this.detectExport(node),
                ));
              }
            }
          }
          break;
        }

        default:
          break;
      }

      // Recurse into top-level children only (not deep nesting)
      if (node === rootNode || node.type === 'export_statement') {
        for (const child of node.children) {
          visit(child);
        }
      }
    };

    visit(rootNode);
  }

  /**
   * Extract import statements and create IMPORTS_FROM edges.
   */
  private extractImports(
    rootNode: SyntaxNode,
    filePath: string,
    graph: CodeGraph,
  ): void {
    for (const child of rootNode.children) {
      if (child.type === 'import_statement') {
        const sourceNode = child.childForFieldName('source');
        if (sourceNode) {
          // Remove quotes from the import source string
          const importSource = sourceNode.text.replace(/['"]/g, '');
          const edge: GraphEdge = {
            sourceId: filePath,
            targetId: importSource,
            relation: EdgeRelation.IMPORTS_FROM,
            sourceFile: filePath,
            sourceLine: child.startPosition.row + 1,
          };
          graph.addEdge(edge);
        }
      }
    }
  }

  /**
   * Extract call expressions and create CALLS edges.
   * Only captures simple identifier calls (not member expressions).
   */
  private extractCalls(
    rootNode: SyntaxNode,
    filePath: string,
    graph: CodeGraph,
  ): void {
    const calls: GraphEdge[] = [];
    this.walkForCalls(rootNode, filePath, calls);
    for (const edge of calls) {
      graph.addEdge(edge);
    }
  }

  private walkForCalls(
    node: SyntaxNode,
    filePath: string,
    calls: GraphEdge[],
  ): void {
    if (node.type === 'call_expression') {
      const fnNode = node.childForFieldName('function');
      if (fnNode?.type === 'identifier') {
        calls.push({
          sourceId: filePath,
          targetId: fnNode.text,
          relation: EdgeRelation.CALLS,
          sourceFile: filePath,
          sourceLine: node.startPosition.row + 1,
        });
      }
    }
    for (const child of node.children) {
      this.walkForCalls(child, filePath, calls);
    }
  }

  // --- Helpers ---

  private createNode(
    filePath: string,
    name: string,
    type: NodeType,
    node: SyntaxNode,
    lines: string[],
    exportType: ExportType,
  ): GraphNode {
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const signature = (lines[startLine - 1] ?? '').trim();

    return {
      id: `${filePath}::${name}`,
      type,
      name,
      filePath,
      startLine,
      endLine,
      exportType,
      signature,
    };
  }

  /**
   * Detect if a declaration is exported by checking its parent node.
   */
  private detectExport(node: SyntaxNode): ExportType {
    const parent = node.parent;
    if (parent?.type === 'export_statement') {
      // Check for "export default"
      if (parent.children.some((c: SyntaxNode) => c.type === 'default')) {
        return ExportType.DEFAULT;
      }
      return ExportType.NAMED;
    }
    return ExportType.NONE;
  }
}
