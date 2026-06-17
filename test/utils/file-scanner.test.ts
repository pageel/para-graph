import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { scanDirectory } from '../../src/utils/file-scanner.js';

describe('file-scanner', () => {
  const sandboxPath = path.resolve(__dirname, '../../../../artifacts/tests/tmp/sandbox');

  beforeEach(() => {
    // Tạo cấu trúc sandbox sạch sẽ
    if (fs.existsSync(sandboxPath)) {
      fs.rmSync(sandboxPath, { recursive: true, force: true });
    }
    fs.mkdirSync(sandboxPath, { recursive: true });

    // Tạo các tệp tin và thư mục mẫu
    fs.writeFileSync(path.join(sandboxPath, 'file1.txt'), 'hello');
    fs.writeFileSync(path.join(sandboxPath, 'file2.log'), 'log data');
    
    const dir1 = path.join(sandboxPath, 'dir1');
    fs.mkdirSync(dir1);
    fs.writeFileSync(path.join(dir1, 'file3.txt'), 'nested');

    // Thư mục loại trừ
    const nodeModules = path.join(sandboxPath, 'node_modules');
    fs.mkdirSync(nodeModules);
    fs.writeFileSync(path.join(nodeModules, 'package.json'), '{}');

    // Thư mục sâu > 5 cấp
    // sandbox (0) -> dir1 (1) -> d2 (2) -> d3 (3) -> d4 (4) -> d5 (5) -> d6 (6) -> fileDeep.txt
    let deepDir = dir1;
    for (let i = 2; i <= 6; i++) {
      deepDir = path.join(deepDir, `d${i}`);
      fs.mkdirSync(deepDir);
    }
    fs.writeFileSync(path.join(deepDir, 'fileDeep.txt'), 'deep content');
  });

  afterEach(() => {
    if (fs.existsSync(sandboxPath)) {
      fs.rmSync(sandboxPath, { recursive: true, force: true });
    }
  });

  it('nên quét được toàn bộ tệp tin bình thường ở độ sâu mặc định', () => {
    const files = scanDirectory(sandboxPath);
    // Chuẩn hóa về POSIX path để so sánh đồng nhất
    const relativeFiles = files.map((f: string) => path.relative(sandboxPath, f).replace(/\\/g, '/'));
    
    expect(relativeFiles).toContain('file1.txt');
    expect(relativeFiles).toContain('file2.log');
    expect(relativeFiles).toContain('dir1/file3.txt');
    // Mặc định maxDepth = 5, d6 nằm ở cấp 6 nên fileDeep.txt không được quét
    expect(relativeFiles).not.toContain('dir1/d2/d3/d4/d5/d6/fileDeep.txt');
  });

  it('nên hỗ trợ cấu hình maxDepth tùy chỉnh', () => {
    // Với maxDepth = 7, nên quét được fileDeep.txt (nằm ở độ sâu 7)
    const files = scanDirectory(sandboxPath, { maxDepth: 7 });
    const relativeFiles = files.map((f: string) => path.relative(sandboxPath, f).replace(/\\/g, '/'));
    expect(relativeFiles).toContain('dir1/d2/d3/d4/d5/d6/fileDeep.txt');

    // Với maxDepth = 1, chỉ quét ở root của sandbox
    const shallowFiles = scanDirectory(sandboxPath, { maxDepth: 1 });
    const relativeShallow = shallowFiles.map((f: string) => path.relative(sandboxPath, f).replace(/\\/g, '/'));
    expect(relativeShallow).toContain('file1.txt');
    expect(relativeShallow).toContain('file2.log');
    expect(relativeShallow).not.toContain('dir1/file3.txt');
  });

  it('nên hỗ trợ excludePatterns bằng glob patterns', () => {
    const files = scanDirectory(sandboxPath, {
      excludePatterns: ['**/node_modules/**', '**/*.log']
    });
    const relativeFiles = files.map((f: string) => path.relative(sandboxPath, f).replace(/\\/g, '/'));
    
    expect(relativeFiles).toContain('file1.txt');
    expect(relativeFiles).toContain('dir1/file3.txt');
    expect(relativeFiles).not.toContain('file2.log'); // bị loại trừ bởi **/*.log
    expect(relativeFiles).not.toContain('node_modules/package.json'); // bị loại trừ bởi **/node_modules/**
  });

  it('nên loại bỏ hoàn toàn các liên kết mềm (Symbolic Links) để tránh lặp vô hạn', () => {
    // Tạo circular symlink: sandbox/dir_sym -> sandbox
    const symlinkPath = path.join(sandboxPath, 'dir_sym');
    try {
      fs.symlinkSync(sandboxPath, symlinkPath, 'dir');
    } catch (err) {
      // Trên Windows có thể thiếu quyền symlink, bỏ qua nếu lỗi
      console.warn('Không thể tạo symlink trên môi trường này:', err);
      return;
    }

    // Tiến hành quét, nếu không xử lý symlink sẽ lặp vô hạn hoặc ném lỗi
    const files = scanDirectory(sandboxPath);
    const relativeFiles = files.map((f: string) => path.relative(sandboxPath, f).replace(/\\/g, '/'));
    
    // File trong symlink không được xuất hiện
    expect(relativeFiles).not.toContain('dir_sym/file1.txt');
    expect(relativeFiles).toContain('file1.txt');
  });

  it('nên thực thi Directory Confinement ngăn chặn Path Traversal', () => {
    const parentDir = path.resolve(sandboxPath, '..');
    
    // Thử quét đường dẫn trỏ ra ngoài sandboxPath bằng cách truyền dirPath không hợp lệ hoặc tương đối ra ngoài
    expect(() => {
      scanDirectory(path.join(sandboxPath, '../'), { rootDir: sandboxPath });
    }).toThrow(/Path Traversal/);
  });
});
