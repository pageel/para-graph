/**
 * EdgeResolver — Post-build resolution engine for CALLS edges.
 *
 * Resolves bare `targetId` strings (e.g., "logger::info") to full entity IDs
 * (e.g., "src/lib/logger.ts::info") using a 4-level priority chain:
 *
 *   1. Same-file match    → confidence: EXTRACTED
 *   2. Import-hint match  → confidence: INFERRED
 *   3. Unique-name match  → confidence: INFERRED
 *   4. Ambiguous           → confidence: AMBIGUOUS (no change)
 *
 * Built-in globals (console, JSON, Math, this, super, etc.) are skipped
 * entirely to avoid noise and improve performance.
 *
 * @since v0.11.0
 */

import { CodeGraph } from './code-graph.js';
import { EdgeRelation } from './models.js';
import type { GraphEdge, EdgeConfidence } from './models.js';

// ─── Built-in Globals Skip List (JS/TS v1) ──────────────────────

/**
 * Set of JS/TS built-in globals and pseudo-keywords that should not
 * be resolved. These represent runtime primitives, not user-defined entities.
 */
export const BUILTIN_SKIP_LIST = new Set<string>([
  // Global objects
  'console', 'JSON', 'Math', 'Object', 'Array', 'Promise',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp',
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
  'Buffer', 'Symbol', 'Proxy', 'Reflect',
  // Runtime globals
  'process', 'require', 'module', 'exports', 'globalThis',
  'window', 'document', 'navigator',
  // Pseudo-keywords
  'this', 'super',
  // Common Web APIs
  'fetch', 'URL', 'URLSearchParams', 'Headers', 'Request', 'Response',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'atob', 'btoa',
]);

// ─── Types ───────────────────────────────────────────────────────

/** Result statistics from the edge resolution process. */
export interface EdgeResolverResult {
  /** Total number of CALLS edges processed (excluding skipped) */
  total: number;
  /** Number of edges successfully resolved */
  resolved: number;
  /** Number of edges that could not be resolved */
  unresolved: number;
  /** Number of external packages edges */
  external: number;
  /** Resolution rate as percentage (0-100) */
  rate: number;
}

// ─── Core Resolution Logic ───────────────────────────────────────

/**
 * Extract the "object" part from a targetId.
 * - "logger::info"     → "logger"
 * - "doSomething"      → "doSomething"
 * - "MyClass::constructor" → "MyClass"
 */
function extractObjectName(targetId: string): string {
  const sep = targetId.indexOf('::');
  return sep >= 0 ? targetId.substring(0, sep) : targetId;
}

/**
 * Extract the "method" part from a targetId.
 * - "logger::info"     → "info"
 * - "doSomething"      → null (no method part)
 */
function extractMethodName(targetId: string): string | null {
  const sep = targetId.indexOf('::');
  return sep >= 0 ? targetId.substring(sep + 2) : null;
}

/**
 * Resolve bare targetId strings in CALLS edges to full entity IDs.
 *
 * Runs in-memory on the CodeGraph after parsing, before export.
 * Mutates edges in place — no extra I/O.
 *
 * @param graph - The CodeGraph to resolve edges in
 * @returns Resolution statistics
 */
// @para-doc [docs/architecture/para-graph-core.md#csa-edge-resolution]
export function resolveEdges(graph: CodeGraph): EdgeResolverResult {
  const allNodes = graph.getAllNodes();
  const allEdges = graph.getAllEdges();

  // ── Step 1: Build name index ──
  // Map<bareName, entityId[]> — for each bare name, list all matching entity IDs
  const nameIndex = new Map<string, string[]>();
  for (const node of allNodes) {
    // Index by node name (bare name without file path prefix)
    const existing = nameIndex.get(node.name);
    if (existing) {
      existing.push(node.id);
    } else {
      nameIndex.set(node.name, [node.id]);
    }

    // Also index by "ClassName.methodName" format for method lookups
    if (node.name.includes('.')) {
      const parts = node.name.split('.');
      const methodName = parts[parts.length - 1];
      const classMethodKey = `${parts[0]}::${methodName}`;
      const existing2 = nameIndex.get(classMethodKey);
      if (existing2) {
        existing2.push(node.id);
      } else {
        nameIndex.set(classMethodKey, [node.id]);
      }
    }
  }

  // ── Step 2: Build import map ──
  // Map<filePath, Set<importSource>> — for each file, what does it import?
  const importMap = new Map<string, Set<string>>();
  for (const edge of allEdges) {
    if (edge.relation === EdgeRelation.IMPORTS_FROM) {
      let imports = importMap.get(edge.sourceFile);
      if (!imports) {
        imports = new Set();
        importMap.set(edge.sourceFile, imports);
      }
      imports.add(edge.targetId);
    }
  }

  // ── Step 3: Resolve each CALLS edge ──
  let total = 0;
  let resolved = 0;
  let external = 0;

  for (const edge of allEdges) {
    if (edge.relation !== EdgeRelation.CALLS) continue;

    // Already resolved (targetId contains "::" with file path prefix)?
    // e.g., "src/lib/logger.ts::info" — has "/" separator = already full path
    if (edge.targetId.includes('/')) continue;

    const objectName = extractObjectName(edge.targetId);

    // Skip built-in globals
    if (BUILTIN_SKIP_LIST.has(objectName)) continue;

    total++;

    // Priority 1: Same-file match
    const resolvedId = trySameFile(edge, nameIndex);
    if (resolvedId) {
      edge.targetId = resolvedId;
      edge.confidence = 'EXTRACTED' as EdgeConfidence;
      resolved++;
      continue;
    }

    // Priority 2: Import-hint match
    const importResolved = tryImportHint(edge, nameIndex, importMap);
    if (importResolved) {
      edge.targetId = importResolved;
      edge.confidence = 'INFERRED' as EdgeConfidence;
      resolved++;
      continue;
    }

    // Priority 3: Unique-name match
    const uniqueResolved = tryUniqueName(edge, nameIndex);
    if (uniqueResolved) {
      edge.targetId = uniqueResolved;
      edge.confidence = 'INFERRED' as EdgeConfidence;
      resolved++;
      continue;
    }

    // Priority 4: Determine EXTERNAL vs AMBIGUOUS
    const candidates = nameIndex.get(extractObjectName(edge.targetId));
    if (!candidates || candidates.length === 0) {
      edge.confidence = 'EXTERNAL' as EdgeConfidence;
      external++;
    } else {
      edge.confidence = 'AMBIGUOUS' as EdgeConfidence;
    }
  }

  const unresolved = total - resolved - external;
  const rate = (total - external) > 0 ? Math.round((resolved / (total - external)) * 100) : 100;

  return { total, resolved, unresolved, external, rate };
}

// ─── Resolution Strategies ───────────────────────────────────────

/**
 * Priority 1: Same-file match.
 * Check if there's an entity with the target name in the same source file.
 */
function trySameFile(
  edge: GraphEdge,
  nameIndex: Map<string, string[]>,
): string | null {
  const methodName = extractMethodName(edge.targetId);
  const objectName = extractObjectName(edge.targetId);

  // For member calls like "logger::info", try matching "ClassName.methodName" pattern
  if (methodName) {
    // Try direct match: "objectName::methodName" in index
    const candidates = nameIndex.get(edge.targetId);
    if (candidates) {
      const sameFile = candidates.find(id => id.startsWith(edge.sourceFile + '::'));
      if (sameFile) return sameFile;
    }

    // Try "methodName" alone in same file
    const methodCandidates = nameIndex.get(methodName);
    if (methodCandidates) {
      const sameFile = methodCandidates.find(id => id.startsWith(edge.sourceFile + '::'));
      if (sameFile) return sameFile;
    }

    // Constructor fallback: if target is "ClassName::constructor", map to Class node in same file
    if (methodName === 'constructor') {
      const classCandidates = nameIndex.get(objectName);
      if (classCandidates) {
        const sameFile = classCandidates.find(id => id.startsWith(edge.sourceFile + '::'));
        if (sameFile) return sameFile;
      }
    }
  } else {
    // Simple call like "bar()" — look for entity named "bar" in same file
    const candidates = nameIndex.get(objectName);
    if (candidates) {
      const sameFile = candidates.find(id => id.startsWith(edge.sourceFile + '::'));
      if (sameFile) return sameFile;
    }
  }

  return null;
}

/**
 * Priority 2: Import-hint match.
 * If the source file imports from a module whose basename matches the object name,
 * look for the target entity in that imported file.
 */
function tryImportHint(
  edge: GraphEdge,
  nameIndex: Map<string, string[]>,
  importMap: Map<string, Set<string>>,
): string | null {
  const objectName = extractObjectName(edge.targetId);
  const methodName = extractMethodName(edge.targetId);

  const fileImports = importMap.get(edge.sourceFile);
  if (!fileImports) return null;

  // Find an import source whose basename matches the object name
  // e.g., import from './lib/logger' → basename 'logger' matches objectName 'logger'
  for (const importSource of fileImports) {
    const basename = importSource.split('/').pop()?.replace(/['"]/g, '') ?? '';
    if (basename.toLowerCase() === objectName.toLowerCase()) {
      // Found matching import — now find the entity in that module
      const searchName = methodName ?? objectName;
      const candidates = nameIndex.get(searchName);
      if (candidates) {
        // Look for candidates whose filePath contains the import source basename
        const match = candidates.find(id => {
          const idFile = id.split('::')[0];
          return idFile.includes(basename);
        });
        if (match) return match;
      }

      // Constructor fallback: if target is "ClassName::constructor", map to Class node in that file
      if (methodName === 'constructor') {
        const classCandidates = nameIndex.get(objectName);
        if (classCandidates) {
          const match = classCandidates.find(id => {
            const idFile = id.split('::')[0];
            return idFile.includes(basename);
          });
          if (match) return match;
        }
      }
    }
  }

  return null;
}

/**
 * Priority 3: Unique-name match.
 * If there's exactly one entity with the target name across the entire graph,
 * resolve to it.
 *
 * Tries class-qualified key first (e.g., "GraphStore::getGraph") before
 * falling back to standalone method/object name (e.g., "getGraph").
 */
function tryUniqueName(
  edge: GraphEdge,
  nameIndex: Map<string, string[]>,
): string | null {
  // Try 1: Full qualified key — preserves class context
  const fullCandidates = nameIndex.get(edge.targetId);
  if (fullCandidates && fullCandidates.length === 1) {
    return fullCandidates[0];
  }

  // Try 2: Standalone method/object name
  const methodName = extractMethodName(edge.targetId);
  const searchName = methodName ?? extractObjectName(edge.targetId);

  const candidates = nameIndex.get(searchName);
  if (candidates && candidates.length === 1) {
    return candidates[0];
  }

  // Constructor fallback: if target is "ClassName::constructor", map to unique Class node
  if (methodName === 'constructor') {
    const objectName = extractObjectName(edge.targetId);
    const classCandidates = nameIndex.get(objectName);
    if (classCandidates && classCandidates.length === 1) {
      return classCandidates[0];
    }
  }

  return null;
}
