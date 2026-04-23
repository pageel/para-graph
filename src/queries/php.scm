; Tree-sitter SSEC query patterns for PHP
; Standard: S-Expression Semantic Entity Convention (SSEC)
; Tags: @entity.* for nodes, @relation.* for edges
; Reference: v0.5.0 multi-language plan — Phase 3
; Parser: tree-sitter-php/php (handles <?php tags)

;; ============================================================
;; ENTITY DECLARATIONS — captures code entities as GraphNodes
;; ============================================================

;; Class declarations
;; e.g. class UserController extends Controller { ... }
(class_declaration
  name: (name) @entity.class.name) @entity.class

;; Interface declarations
;; e.g. interface Authenticatable { ... }
(interface_declaration
  name: (name) @entity.interface.name) @entity.interface

;; Top-level function definitions
;; e.g. function helper() { ... }
(function_definition
  name: (name) @entity.function.name) @entity.function

;; Method declarations inside classes
;; e.g. public function index() { ... }
(method_declaration
  name: (name) @entity.method.name) @entity.method

;; ============================================================
;; RELATION CAPTURES — captures relationships between entities
;; ============================================================

;; Use declarations (namespace imports)
;; e.g. use App\Models\User;
(namespace_use_declaration
  (namespace_use_clause
    (qualified_name) @relation.import.source)) @relation.import

;; Function calls — simple name
;; e.g. view('welcome')
(function_call_expression
  function: (name) @relation.call.target) @relation.call

;; Function calls — qualified name
;; e.g. Route::get(...)
(function_call_expression
  function: (qualified_name) @relation.call.target) @relation.call

;; Method calls — member access
;; e.g. $this->validate(...)
(member_call_expression
  name: (name) @relation.call.target) @relation.call

;; Static method calls
;; e.g. User::find(1)
(scoped_call_expression
  name: (name) @relation.call.target) @relation.call
