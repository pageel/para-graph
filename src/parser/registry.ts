/**
 * Language Registry — Maps file extensions to tree-sitter parser profiles.
 *
 * Each language is registered via a LanguageProfile that provides:
 * - Parser module path (lazy-loaded via require)
 * - SSEC query file path
 * - Optional postProcess hook for edge cases
 *
 * Architecture: Pure Query-based (SSEC .scm files)
 * Reference: brainstorm-2026-04-22-query-based-parser
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Resolve the src/queries/ directory relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const QUERIES_DIR = join(__dirname, '..', 'queries');

/** Capture result from Tree-sitter Query API */
export interface Capture {
  name: string;
  node: {
    text: string;
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
    parent: unknown;
  };
}

/** Language profile for the Registry */
export interface LanguageProfile {
  /** Human-readable name (e.g. "typescript", "python") */
  name: string;
  /** File extensions this profile handles (e.g. [".ts"]) */
  extensions: string[];
  /** Module path for require() — lazy-loaded */
  parserModule: string;
  /** Filename of the SSEC query file in src/queries/ */
  queryFile: string;
  /**
   * Optional post-processing hook for language-specific edge cases
   * that cannot be expressed in .scm queries alone.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  postProcess?: (captures: Capture[], graph: any) => void;
}

// --- Built-in Language Profiles ---

const PROFILES: LanguageProfile[] = [
  {
    name: 'typescript',
    extensions: ['.ts'],
    parserModule: 'tree-sitter-typescript/typescript',
    queryFile: 'typescript.scm',
  },
  {
    name: 'tsx',
    extensions: ['.tsx'],
    parserModule: 'tree-sitter-typescript/tsx',
    queryFile: 'typescript.scm', // TSX reuses TS query patterns
  },
  {
    name: 'python',
    extensions: ['.py', '.pyw'],
    parserModule: 'tree-sitter-python',
    queryFile: 'python.scm',
  },
  {
    name: 'go',
    extensions: ['.go'],
    parserModule: 'tree-sitter-go',
    queryFile: 'go.scm',
  },
  {
    name: 'php',
    extensions: ['.php'],
    parserModule: 'tree-sitter-php/php',
    queryFile: 'php.scm',
  },
  {
    name: 'bash',
    extensions: ['.sh', '.bash'],
    parserModule: 'tree-sitter-bash',
    queryFile: 'bash.scm',
  },
];

// --- Extension → Profile Map (built once at module load) ---

const extensionMap = new Map<string, LanguageProfile>();
for (const profile of PROFILES) {
  for (const ext of profile.extensions) {
    extensionMap.set(ext, profile);
  }
}

// --- Parser Cache (lazy-loaded, one instance per language) ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parserCache = new Map<string, any>();

/**
 * Get the language profile for a file extension.
 * @returns LanguageProfile or undefined if unsupported
 */
export function getProfile(ext: string): LanguageProfile | undefined {
  return extensionMap.get(ext);
}

/**
 * Get all supported file extensions from the registry.
 */
export function getSupportedExtensions(): string[] {
  return Array.from(extensionMap.keys());
}

/**
 * Lazy-load and cache a tree-sitter language module.
 * @throws if the native module cannot be loaded (node-gyp issue)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadLanguageModule(profile: LanguageProfile): any {
  if (parserCache.has(profile.name)) {
    return parserCache.get(profile.name);
  }

  try {
    const mod = require(profile.parserModule);
    parserCache.set(profile.name, mod);
    return mod;
  } catch (error) {
    console.warn(
      `[para-graph] Warning: Failed to load language module "${profile.parserModule}". ` +
      `This language will be skipped. Error: ${(error as Error).message}`,
    );
    return null;
  }
}

/**
 * Resolve the absolute path to a query file.
 */
export function resolveQueryPath(profile: LanguageProfile): string {
  return join(QUERIES_DIR, profile.queryFile);
}
