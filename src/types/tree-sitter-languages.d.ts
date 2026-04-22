/**
 * Type declarations for tree-sitter language bindings.
 * These packages use native C++ bindings (node-gyp) and
 * don't ship TypeScript types.
 *
 * Each module exports a Language object compatible with
 * Parser.setLanguage() from the `tree-sitter` package.
 */

declare module 'tree-sitter-python' {
  const language: unknown;
  export default language;
}

declare module 'tree-sitter-go' {
  const language: unknown;
  export default language;
}

declare module 'tree-sitter-bash' {
  const language: unknown;
  export default language;
}

declare module 'tree-sitter-php/php' {
  const language: unknown;
  export default language;
}
