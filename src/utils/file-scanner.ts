import * as fs from 'fs';
import * as path from 'path';

export interface ScanOptions {
  excludePatterns?: string[];
  maxDepth?: number;
  rootDir?: string;
}

function globToRegex(pattern: string): RegExp {
  let temp = pattern;
  
  // 1. Thay thế **/ ở đầu
  if (temp.startsWith('**/')) {
    temp = '___START_DIR___' + temp.slice(3);
  }
  // 2. Thay thế /** ở cuối
  if (temp.endsWith('/**')) {
    temp = temp.slice(0, -3) + '___END_DIR___';
  }
  // 3. Thay thế /**/ ở giữa
  temp = temp.replace(/\/\*\*\//g, '___MIDDLE_DIR___');
  // 4. Thay thế ** còn lại
  temp = temp.replace(/\*\*/g, '___ANY_DIR___');
  // 5. Thay thế * đơn
  temp = temp.replace(/\*/g, '___ANY_CHARS___');
  // 6. Thay thế ? đơn
  temp = temp.replace(/\?/g, '___ANY_CHAR___');
  
  // Thoát các ký tự đặc biệt của regex còn lại
  let escaped = temp.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  
  // Thay thế các placeholder bằng regex thực tế
  escaped = escaped.replace(/___START_DIR___/g, '(?:.*\\/)?');
  escaped = escaped.replace(/___END_DIR___/g, '(?:\\/.*)?');
  escaped = escaped.replace(/___MIDDLE_DIR___/g, '\\/(?:.*\\/)?');
  escaped = escaped.replace(/___ANY_DIR___/g, '.*');
  escaped = escaped.replace(/___ANY_CHARS___/g, '[^/]*');
  escaped = escaped.replace(/___ANY_CHAR___/g, '[^/]');
  
  return new RegExp(`^${escaped}$`);
}

export function scanDirectory(dirPath: string, options?: ScanOptions): string[] {
  const maxDepth = options?.maxDepth ?? 5;
  const rootDir = options?.rootDir ? path.resolve(options.rootDir) : path.resolve(dirPath);
  const resolvedDir = path.resolve(dirPath);

  // Directory Confinement: chống Path Traversal
  const relativeFromRoot = path.relative(rootDir, resolvedDir);
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    throw new Error('Path Traversal detected: target directory is outside the allowed root directory');
  }

  const excludeRegexes = (options?.excludePatterns ?? []).map(globToRegex);
  const results: string[] = [];

  function walk(currentDir: string, depth: number) {
    if (depth > maxDepth) {
      return;
    }

    let entries: string[];
    try {
      entries = fs.readdirSync(currentDir);
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      
      let stats: fs.Stats;
      try {
        stats = fs.lstatSync(fullPath);
      } catch (err) {
        continue;
      }

      // Bỏ qua Symbolic Links hoàn toàn
      if (stats.isSymbolicLink()) {
        continue;
      }

      // Tính toán relative path để so khớp loại trừ
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      // Kiểm tra exclude patterns
      const isExcluded = excludeRegexes.some(regex => regex.test(relativePath));
      if (isExcluded) {
        continue;
      }

      if (stats.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (stats.isFile()) {
        results.push(fullPath);
      }
    }
  }

  // Bắt đầu walk từ depth = 1 để đồng bộ với định nghĩa của test cases:
  // Root directory = depth 1. Các file trực tiếp ở root có depth = 1.
  // dir1 = depth 2. Các file ở dir1 có depth = 2.
  // d6 = depth 7.
  walk(resolvedDir, 1);
  return results;
}
