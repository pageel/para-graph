#!/usr/bin/env node

/**
 * CSA Audit Tool (Zero-Bloat Verification Engine)
 * Parses expected entities from design specifications and compares them
 * against actual code graph bindings from entities.jsonl.
 *
 * Usage: node audit.js [projectPath]
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Parse arguments
const projectPath = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

console.log(`[CSA Audit] Auditing project at: ${projectPath}`);

const beadsGraphDir = path.join(projectPath, '.beads', 'graph');
const entitiesFile = path.join(beadsGraphDir, 'entities.jsonl');

if (!fs.existsSync(entitiesFile)) {
  console.error(`[CSA Audit] Error: entities.jsonl not found at ${entitiesFile}`);
  console.error(`[CSA Audit] Please run 'para-graph build' or 'npm run graph:build' first.`);
  process.exit(1);
}

// Helper to recursively find markdown files in a directory, ignoring system paths
function findMarkdownFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        // Ignore standard dependency, VCS, and agent system directories
        if (
          file !== 'node_modules' &&
          file !== '.git' &&
          file !== '.beads' &&
          file !== '.agents' &&
          file !== 'Archive'
        ) {
          results = results.concat(findMarkdownFiles(filePath));
        }
      } else if (file.endsWith('.md')) {
        results.push(filePath);
      }
    });
  } catch (err) {
    console.warn(`[CSA Audit] Warning: could not read directory ${dir}: ${err.message}`);
  }
  return results;
}

// Main logic
async function run() {
  const expectedEntities = new Set();
  
  // 1. Resolve Specs and Plans directories with smart fallbacks for generic OSS projects
  let specsDir = process.argv[3] ? path.resolve(process.argv[3]) : path.join(projectPath, 'artifacts', 'specs');
  let plansDir = process.argv[4] ? path.resolve(process.argv[4]) : path.join(projectPath, 'artifacts', 'plans');
  
  // Fallbacks if PARA-standard folders do not exist and paths are not overridden by command arguments
  if (!fs.existsSync(specsDir) && !process.argv[3]) {
    const alternativeSpecs = path.join(projectPath, 'docs', 'specs');
    const directDocs = path.join(projectPath, 'docs');
    if (fs.existsSync(alternativeSpecs)) {
      specsDir = alternativeSpecs;
    } else if (fs.existsSync(directDocs)) {
      specsDir = directDocs;
    } else {
      specsDir = projectPath; // Fallback to scanning the entire project directory with ignores
    }
  }
  
  if (!fs.existsSync(plansDir) && !process.argv[4]) {
    const alternativePlans = path.join(projectPath, 'docs', 'plans');
    if (fs.existsSync(alternativePlans)) {
      plansDir = alternativePlans;
    } else {
      plansDir = ''; // Disable plan scanning if directory does not exist
    }
  }

  console.log(`[CSA Audit] Specs scan path: ${specsDir}`);
  if (plansDir) {
    console.log(`[CSA Audit] Plans scan path: ${plansDir}`);
  }

  // Find all specification markdown files
  let specFiles = findMarkdownFiles(specsDir);
  if (plansDir && plansDir !== specsDir) {
    specFiles = specFiles.concat(findMarkdownFiles(plansDir));
  }
  
  // Remove duplicate paths in case directory resolution overlaps
  specFiles = [...new Set(specFiles)];
  
  const graphNodeRegex = /<!--\s*@graph-node:\s*([^\s-]+)\s*-->/g;
  
  for (const file of specFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      let match;
      // Reset regex state
      graphNodeRegex.lastIndex = 0;
      while ((match = graphNodeRegex.exec(content)) !== null) {
        const nodeId = match[1].trim();
        expectedEntities.add(nodeId);
      }
    } catch (err) {
      console.warn(`[CSA Audit] Warning: could not read file ${file}: ${err.message}`);
    }
  }
  
  console.log(`[CSA Audit] Found ${expectedEntities.size} expected entities defined in specifications.`);

  // 2. Read entities.jsonl line-by-line
  const fileStream = fs.createReadStream(entitiesFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const universeEntities = new Map(); // id -> entityNode

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const node = JSON.parse(line);
      universeEntities.set(node.id, node);
    } catch (e) {
      console.warn(`[CSA Audit] Warning: failed to parse JSON line: ${e.message}`);
    }
  }

  // 3. Define target checking list:
  // All expected entities from specs, plus all public/exported entities in code
  const targetIds = new Set([...expectedEntities]);
  
  for (const [id, node] of universeEntities.entries()) {
    // Target exported functions, classes, interfaces, etc. (excluding files themselves)
    if (node.type !== 'file' && (node.exportType === 'named' || node.exportType === 'default')) {
      targetIds.add(id);
    }
  }

  let expectedCount = targetIds.size;
  let linkedCount = 0;
  const unlinkedEntities = [];

  for (const id of targetIds) {
    const node = universeEntities.get(id);
    if (node) {
      // Check if it has semantic.docAnchors or direct docAnchors
      const docAnchors = node.docAnchors || (node.semantic && node.semantic.docAnchors) || [];
      if (docAnchors.length > 0) {
        linkedCount++;
      } else {
        unlinkedEntities.push({ id, type: node.type, filePath: node.filePath });
      }
    } else {
      // Entity is defined in specs/plans but not yet parsed/implemented in the codebase graph
      unlinkedEntities.push({ id, type: 'missing_in_code', filePath: 'N/A' });
    }
  }

  const coverage = expectedCount > 0 ? (linkedCount / expectedCount) * 100 : 100;
  const coverageFormatted = coverage.toFixed(2);

  console.log(`\n================== CSA AUDIT REPORT ==================`);
  console.log(`Total Target Entities Checked : ${expectedCount}`);
  console.log(`Linked Entities (Pass)        : ${linkedCount}`);
  console.log(`Unlinked Entities (Fail)      : ${unlinkedEntities.length}`);
  console.log(`Weighted Graph Coverage       : ${coverageFormatted}%`);
  console.log(`Required Minimum Coverage     : 90.00%`);
  console.log(`======================================================\n`);

  if (unlinkedEntities.length > 0) {
    console.log(`Unlinked Entities list (first 10 items):`);
    unlinkedEntities.slice(0, 10).forEach(item => {
      console.log(`  - [${item.type.toUpperCase()}] ${item.id} (File: ${item.filePath})`);
    });
    if (unlinkedEntities.length > 10) {
      console.log(`  ... and ${unlinkedEntities.length - 10} more items.`);
    }
    console.log('');
  }

  if (coverage < 90.0) {
    console.error(`[CSA Audit] ❌ FAIL: Weighted Graph Coverage (${coverageFormatted}%) is below the required 90.00% threshold.`);
    process.exit(1);
  } else {
    console.log(`[CSA Audit] ✅ SUCCESS: Weighted Graph Coverage (${coverageFormatted}%) meets the quality gate.`);
    process.exit(0);
  }
}

run().catch(err => {
  console.error('[CSA Audit] Error running audit script:', err);
  process.exit(1);
});
