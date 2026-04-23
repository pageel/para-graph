; Tree-sitter SSEC query patterns for Go
; Standard: S-Expression Semantic Entity Convention (SSEC)
; Tags: @entity.* for nodes, @relation.* for edges
; Reference: v0.5.0 multi-language plan — Phase 3

;; ============================================================
;; ENTITY DECLARATIONS — captures code entities as GraphNodes
;; ============================================================

;; Struct type definitions → mapped as CLASS
;; e.g. type Server struct { ... }
(type_declaration
  (type_spec
    name: (type_identifier) @entity.class.name
    type: (struct_type))) @entity.class

;; Interface type definitions → mapped as INTERFACE
;; e.g. type Handler interface { ... }
(type_declaration
  (type_spec
    name: (type_identifier) @entity.interface.name
    type: (interface_type))) @entity.interface

;; Top-level function declarations
;; e.g. func main() { ... }
(function_declaration
  name: (identifier) @entity.function.name) @entity.function

;; Method declarations (with receiver)
;; e.g. func (s *Server) Start() error { ... }
(method_declaration
  name: (field_identifier) @entity.method.name) @entity.method

;; ============================================================
;; RELATION CAPTURES — captures relationships between entities
;; ============================================================

;; Import specs (for IMPORTS_FROM edges)
;; e.g. import "fmt" or import ( "net/http" )
(import_spec
  path: (interpreted_string_literal) @relation.import.source) @relation.import

;; Call expressions — simple identifier calls
;; e.g. fmt.Println("hello")
(call_expression
  function: (identifier) @relation.call.target) @relation.call

;; Call expressions — selector (qualified) calls
;; e.g. http.ListenAndServe(...)
(call_expression
  function: (selector_expression
    field: (field_identifier) @relation.call.target)) @relation.call
