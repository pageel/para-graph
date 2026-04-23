; Tree-sitter SSEC query patterns for Bash
; Standard: S-Expression Semantic Entity Convention (SSEC)
; Tags: @entity.* for nodes, @relation.* for edges
; Note: Bash has no class or interface concepts — only functions and commands
; Reference: v0.5.0 multi-language plan — Phase 2

;; ============================================================
;; ENTITY DECLARATIONS — captures code entities as GraphNodes
;; ============================================================

;; Function definitions — both syntaxes:
;;   func_name() { ... }
;;   function func_name { ... }
(function_definition
  name: (word) @entity.function.name) @entity.function

;; ============================================================
;; RELATION CAPTURES — captures relationships between entities
;; ============================================================

;; Source/dot commands — acts as "import" in Bash
;; source ./config.sh  or  . ./config.sh
(command
  name: (command_name
    (word) @_cmd)
  (word) @relation.import.source
  (#match? @_cmd "^(source|\\.)$")) @relation.import

;; Command calls (for CALLS edges) — captures all command invocations
;; This gives a high-level view of which commands/tools a script uses
(command
  name: (command_name
    (word) @relation.call.target)) @relation.call
