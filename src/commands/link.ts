import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { GraphStore } from '../graph/store/GraphStore.js';

export function runLink(projectName: string, workspaceRoot: string): void {
  if (!projectName) {
    console.error('❌ Error: Project name is required.');
    process.exit(1);
  }

  const projectDir = join(workspaceRoot, 'Projects', projectName);
  const docsDir = join(projectDir, 'docs');

  if (!existsSync(docsDir)) {
    console.error(`❌ Error: Docs directory not found at "${docsDir}".`);
    process.exit(1);
  }

  console.log(`🔍 Scanning documentation in project "${projectName}"...`);

  // Recursively find all MD files in docsDir
  function walk(dir: string): string[] {
    let results: string[] = [];
    if (!existsSync(dir)) return results;
    
    const list = readdirSync(dir);
    list.forEach((file) => {
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);
      if (stat && stat.isDirectory()) {
        if (file !== '.html') {
          results = results.concat(walk(fullPath));
        }
      } else if (file.endsWith('.md')) {
        results.push(fullPath);
      }
    });
    return results;
  }

  const mdFiles = walk(docsDir);
  const links: Array<{ nodeId: string; docPath: string }> = [];

  mdFiles.forEach((file) => {
    const relativePath = relative(projectDir, file).replace(/\\/g, '/');
    try {
      const content = readFileSync(file, 'utf-8');
      
      // Parse all <!-- @graph-node: nodeId --> anchors
      const regex = /<!--\s*@graph-node:\s*([^\s>]+)\s*-->/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const nodeId = match[1];
        links.push({
          nodeId: nodeId,
          docPath: relativePath // format: docs/path.md
        });
      }
    } catch (err: any) {
      console.warn(`⚠️ Warning: Failed to read file ${file}:`, err.message);
    }
  });

  console.log(`Found ${links.length} documentation anchors. Linking with graph...`);

  try {
    const graph = GraphStore.getGraph(workspaceRoot, projectName);
    const result = graph.linkDocs(links);
    console.log('Link result:', result);

    if (result.linked > 0) {
      GraphStore.saveGraph(workspaceRoot, projectName);
      console.log(`✅ Success: Saved graph with ${result.linked} active document linkages!`);
    } else {
      console.log('ℹ️ No new document linkages updated.');
    }
  } catch (err: any) {
    console.error('❌ Error linking docs with graph:', err.message);
    process.exit(1);
  }
}
