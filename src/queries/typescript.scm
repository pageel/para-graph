; Tree-sitter query patterns for TypeScript
; Written from scratch based on official tree-sitter docs (Clean Room — H2-1)
; Reference: https://tree-sitter.github.io/tree-sitter/syntax-highlighting

;; ============================================================
;; NODE DECLARATIONS — captures code entities as GraphNodes
;; ============================================================

;; Classes
(class_declaration
  name: (type_identifier) @class.name) @class.definition

;; Functions (top-level)
(function_declaration
  name: (identifier) @function.name) @function.definition

;; Arrow functions assigned to const/let/var
(lexical_declaration
  (variable_declarator
    name: (identifier) @variable.name
    value: (arrow_function))) @arrow.definition

;; Interfaces
(interface_declaration
  name: (type_identifier) @interface.name) @interface.definition

;; Method definitions inside classes
(method_definition
  name: (property_identifier) @method.name) @method.definition

;; ============================================================
;; EDGE CAPTURES — captures relationships between entities
;; ============================================================

;; Import statements (for IMPORTS_FROM edges)
(import_statement
  source: (string) @import.source) @import.statement

;; Call expressions (for CALLS edges) — simple identifier calls
(call_expression
  function: (identifier) @call.name) @call.expression
