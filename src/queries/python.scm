; Tree-sitter SSEC query patterns for Python
; Standard: S-Expression Semantic Entity Convention (SSEC)
; Tags: @entity.* for nodes, @relation.* for edges
; Reference: v0.5.0 multi-language plan — Phase 2

;; ============================================================
;; ENTITY DECLARATIONS — captures code entities as GraphNodes
;; ============================================================

;; Classes
(class_definition
  name: (identifier) @entity.class.name) @entity.class

;; Functions (top-level and nested)
(function_definition
  name: (identifier) @entity.function.name) @entity.function

;; ============================================================
;; RELATION CAPTURES — captures relationships between entities
;; ============================================================

;; Import statements: import os, import sys
(import_statement
  name: (dotted_name) @relation.import.source) @relation.import

;; Import-from statements: from pathlib import Path
(import_from_statement
  module_name: (dotted_name) @relation.import.source) @relation.import

;; Call expressions (for CALLS edges) — simple identifier calls
(call
  function: (identifier) @relation.call.target) @relation.call

;; Call expressions — attribute calls: obj.method()
(call
  function: (attribute
    attribute: (identifier) @relation.call.target)) @relation.call
