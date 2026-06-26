import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { extractSpecMetadata } from '../src/parser/csa-parser.js';
import { SqliteManager } from '../src/graph/store/sqlite-manager.js';
import { CsaEvent, NodeType } from '../src/graph/models.js';

describe('Spec Metadata Parsing', () => {
  const sandboxDir = join(process.cwd(), 'test-sandbox-metadata');

  beforeAll(() => {
    mkdirSync(sandboxDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(sandboxDir, { recursive: true, force: true });
  });

  it('should parse metadata correctly from the first 30 lines', () => {
    const filePath = join(sandboxDir, 'spec-with-meta.md');
    const content = `# Spec: Sample Feature

> **Created:** 2026-06-26 | **Status:** Approved
> **Author:** Antigravity
> **Project:** test-project
> **Deprecated:** true
> **Deprecated-By:** spec-new.md
> **Renamed-From:** spec-old.md
> **Anchor-Prefix:** csa-sample

Some body text here.
`;
    writeFileSync(filePath, content, 'utf-8');

    const meta = extractSpecMetadata(filePath);
    expect(meta).toEqual({
      deprecated: true,
      deprecatedBy: 'spec-new.md',
      renamedFrom: 'spec-old.md',
      anchorPrefix: 'csa-sample',
    });
  });

  it('should handle metadata pushed down but within 30 lines limit', () => {
    const filePath = join(sandboxDir, 'spec-pushed-down.md');
    // 20 empty lines, then blockquote
    const content = '\n'.repeat(18) + `> **Deprecated:** false
> **Deprecated-By:** spec-another.md
> **Renamed-From:** spec-prev.md
> **Anchor-Prefix:** csa-pushed
`;
    writeFileSync(filePath, content, 'utf-8');

    const meta = extractSpecMetadata(filePath);
    expect(meta).toEqual({
      deprecated: false,
      deprecatedBy: 'spec-another.md',
      renamedFrom: 'spec-prev.md',
      anchorPrefix: 'csa-pushed',
    });
  });

  it('should ignore metadata past 30 lines', () => {
    const filePath = join(sandboxDir, 'spec-too-deep.md');
    // 32 empty lines, then blockquote
    const content = '\n'.repeat(32) + `> **Deprecated:** true
> **Deprecated-By:** spec-ignored.md
`;
    writeFileSync(filePath, content, 'utf-8');

    const meta = extractSpecMetadata(filePath);
    expect(meta).toEqual({});
  });

  it('should return empty object for file with no metadata', () => {
    const filePath = join(sandboxDir, 'spec-no-meta.md');
    const content = `# Spec: Just Title
No blockquotes here.
`;
    writeFileSync(filePath, content, 'utf-8');

    const meta = extractSpecMetadata(filePath);
    expect(meta).toEqual({});
  });

  it('should initialize csa_events table and log events successfully', () => {
    const dbPath = join(sandboxDir, 'test-csa-events.db');
    const manager = new SqliteManager('mock-project', dbPath);
    
    try {
      manager.initSchema();
      
      const mockEvent: CsaEvent = {
        eventType: 'coverage_snapshot',
        targetId: 'spec-meta.md',
        details: {
          coverageRate: 92.5,
          specCoverage: { totalAnchors: 10, coveredAnchors: 9, coverageRate: 90.0 },
          docCoverage: { totalAnchors: 20, coveredAnchors: 19, coverageRate: 95.0 },
          combinedHealth: 92.5
        },
        sessionId: 'test-session-123'
      };
      
      manager.logCsaEvent(mockEvent);
      
      const events = manager.queryCsaEvents(10);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: 'coverage_snapshot',
        targetId: 'spec-meta.md',
        details: {
          coverageRate: 92.5,
          specCoverage: { totalAnchors: 10, coveredAnchors: 9, coverageRate: 90.0 },
          docCoverage: { totalAnchors: 20, coveredAnchors: 19, coverageRate: 95.0 },
          combinedHealth: 92.5
        },
        sessionId: 'test-session-123'
      });
      expect(events[0].timestamp).toBeDefined();
      expect(events[0].id).toBeDefined();
    } finally {
      // Compliance with M4a: close database connection to release file lock!
      manager.close();
    }
  });

  it('should exclude deprecated anchors and check prefix mismatches in runCsaAudit', () => {
    const dbPath = join(sandboxDir, 'test-audit.db');
    const manager = new SqliteManager('mock-project', dbPath);
    
    try {
      manager.initSchema();
      
      const nodes = [
        // 1. Deprecated anchor node
        {
          id: 'csa-dep-anchor',
          name: 'csa-dep-anchor',
          type: NodeType.SPEC_ANCHOR,
          filePath: 'artifacts/specs/spec-meta.md',
          semantic: {
            specMeta: { deprecated: true },
            line: 5,
          },
        },
        // 2. Active anchor node with matching prefix
        {
          id: 'csa-cool-anchor',
          name: 'csa-cool-anchor',
          type: NodeType.SPEC_ANCHOR,
          filePath: 'artifacts/specs/spec-meta.md',
          semantic: {
            specMeta: { deprecated: false, anchorPrefix: 'csa-cool' },
            line: 10,
          },
        },
        // 3. Active anchor node with mismatched prefix
        {
          id: 'csa-wrong-anchor',
          name: 'csa-wrong-anchor',
          type: NodeType.SPEC_ANCHOR,
          filePath: 'artifacts/specs/spec-meta.md',
          semantic: {
            specMeta: { deprecated: false, anchorPrefix: 'csa-cool' },
            line: 15,
          },
        },
        // 4. Legacy anchor node with raw text semantic
        {
          id: 'csa-legacy-anchor',
          name: 'csa-legacy-anchor',
          type: NodeType.SPEC_ANCHOR,
          filePath: 'artifacts/specs/spec-legacy.md',
          semantic: 'legacy text thô' as any,
        }
      ];
      
      manager.persistGraph(nodes, []);
      
      const result = manager.runCsaAudit({ doubleBinding: false });
      
      // Total anchors should be 3 (csa-cool-anchor, csa-wrong-anchor, csa-legacy-anchor).
      // csa-dep-anchor should be excluded.
      expect(result.specCoverage.totalAnchors).toBe(3);
      
      // Prefix mismatch should be 1: csa-wrong-anchor (does not start with 'csa-cool')
      // csa-legacy-anchor should NOT produce a prefix mismatch (no anchorPrefix meta)
      expect(result.prefixMismatches).toBeDefined();
      expect(result.prefixMismatches).toHaveLength(1);
      expect(result.prefixMismatches![0]).toEqual({
        anchorId: 'csa-wrong-anchor',
        expectedPrefix: 'csa-cool',
        filePath: 'artifacts/specs/spec-meta.md',
        line: 15,
      });
    } finally {
      manager.close();
    }
  });
});
