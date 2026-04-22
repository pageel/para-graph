; Tree-sitter SSEC query patterns for TypeScript
; Standard: S-Expression Semantic Entity Convention (SSEC)
; Tags: @entity.* for nodes, @relation.* for edges, @export.* for visibility
; Reference: brainstorm-2026-04-22-query-based-parser

;; ============================================================
;; ENTITY DECLARATIONS — captures code entities as GraphNodes
;; ============================================================

;; Classes
(class_declaration
  name: (type_identifier) @entity.class.name) @entity.class

;; Functions (top-level)
(function_declaration
  name: (identifier) @entity.function.name) @entity.function

;; Arrow functions assigned to const/let/var
(lexical_declaration
  (variable_declarator
    name: (identifier) @entity.variable.name
    value: (arrow_function))) @entity.variable

;; Interfaces
(interface_declaration
  name: (type_identifier) @entity.interface.name) @entity.interface

;; Method definitions inside classes
(method_definition
  name: (property_identifier) @entity.method.name) @entity.method

;; ============================================================
;; RELATION CAPTURES — captures relationships between entities
;; ============================================================

;; Import statements (for IMPORTS_FROM edges)
(import_statement
  source: (string) @relation.import.source) @relation.import

;; Call expressions (for CALLS edges) — simple identifier calls
(call_expression
  function: (identifier) @relation.call.target) @relation.call

;; ============================================================
;; EXPORT CAPTURES — captures export visibility
;; ============================================================

;; Named exports: export class Foo {}
(export_statement) @export.statement
