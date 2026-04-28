<div align="center">
  <img src="../../docs/assets/para-graph-banner.png" alt="Para-Graph Banner" width="100%">
  <br/>
  
  <h1>para-graph 🧠</h1>

  <p><b>Công cụ phân tích mã nguồn cấu trúc dựa trên Tree-sitter AST parsing.</b></p>

  <p>
    <a href="../../README.md"><b>🇺🇸 English</b></a> •
    <a href="vi-VN.md"><b>🇻🇳 Tiếng Việt</b></a>
  </p>

  <p>
    <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
    <img src="https://img.shields.io/badge/version-0.8.1-brightgreen.svg" alt="Version 0.8.1">
    <img src="https://img.shields.io/badge/Node-%3E%3D18-green.svg" alt="Node >= 18">
    <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript 5.x">
  </p>
</div>

<br/>

## Mục lục

- [Tổng quan](#tong-quan)
- [Tính năng](#tinh-nang)
- [Bắt đầu nhanh](#bat-dau-nhanh)
- [Hướng dẫn sử dụng](#huong-dan-su-dung)
- [Thiết lập MCP Server](#thiet-lap-mcp-server)
- [Định dạng đầu ra](#dinh-dang-dau-ra)
- [Kiến trúc](#kien-truc)
- [Phát triển](#phat-trien)
- [Trí tuệ Nhân tạo (PARA Workspace)](#tri-tue-nhan-tao)
- [Lộ trình](#lo-trinh)
- [Giấy phép](#giay-phep)

<a name="tong-quan"></a>
## 🎯 Tổng quan

**para-graph** là công cụ phân tích mã nguồn tất định (deterministic), dùng để trích xuất thông tin cấu trúc từ các dự án đa ngôn ngữ và tạo ra đồ thị tri thức (knowledge graph) dưới định dạng JSONL.

Công cụ sử dụng [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) để phân tích AST nhanh và chính xác — không cần cài đặt luồng biên dịch (compiler pipeline). Đồ thị đầu ra ghi nhận:

- **Thực thể (Entities)** — classes, functions, interfaces, arrow functions, methods
- **Mối quan hệ (Relationships)** — imports, function calls, inheritance (dự kiến)

Đây là một thành phần của hệ sinh thái [PARA Workspace](https://github.com/pageel/para-workspace).

<a name="tinh-nang"></a>
## ✨ Tính năng

- **Hỗ trợ đa ngôn ngữ** — TypeScript, TSX, Python 🐍, Bash 🐚, Go 🐹, PHP 🐘
- **Phân tích tất định** — Tree-sitter AST & Pure SSEC Queries, không dùng LLM heuristics
- **Định dạng JSONL** — mỗi dòng một thực thể/mối quan hệ, dễ dàng stream và xử lý
- **Global Workspace Server** — Phục vụ đồng thời đồ thị của nhiều dự án qua MCP
- **Làm giàu ngữ nghĩa (Semantic Enrichment)** — Đặc tả ngữ nghĩa tự động bằng Agent (tóm tắt, độ phức tạp, domain concepts)
- **Truy vấn In-Memory tốc độ cao** — Tìm kiếm có chỉ mục với LRU cache (Tối đa = 3 dự án)
- **Phân tích tác động (Impact Analysis)** — Duyệt đồ thị theo chiều rộng (BFS) để tìm tất cả các node bị ảnh hưởng khi sửa code
- **Gói ngữ cảnh (Context Bundle)** — Lấy mã nguồn, nơi gọi, nơi được gọi, imports, và tests chỉ trong một lần gọi MCP
- **Agentic Edge Resolution** — Cho phép chèn các mối quan hệ còn thiếu (ví dụ: dynamic Bash imports) trực tiếp qua MCP
- **MCP Auto-Setup** — Manifest-declared `mcp:` block cho phép cấu hình tự động cho IDE qua lệnh `./para mcp-setup`

<a name="bat-dau-nhanh"></a>
## 🚀 Bắt đầu nhanh

```bash
# Clone
git clone https://github.com/pageel/para-graph.git
cd para-graph

# Cài đặt
npm install

# Build
npm run build

# Quét bất kỳ dự án nào được hỗ trợ
npx para-graph build /path/to/your/ts/project ./output
```

Hoặc chạy trực tiếp không cần clone:

```bash
npx para-graph build ./src ./output
```

<a name="huong-dan-su-dung"></a>
## 📖 Hướng dẫn sử dụng

### Lệnh CLI

```bash
# Quét mã nguồn và xuất đồ thị
para-graph build <target-dir> [output-dir] [--import]

# Khởi động MCP server để tích hợp AI Agent
para-graph serve <workspace-root>

# Xem trợ giúp
para-graph --help
```

### Lệnh Build

```bash
# Sử dụng cơ bản
para-graph build ./src                       # Xuất ra ./output/
para-graph build ./src ./my-graph            # Tùy chỉnh thư mục xuất
para-graph build ./src ./out --import        # Giữ lại dữ liệu ngữ nghĩa khi quét lại
```

| Tham số | Bắt buộc | Mặc định | Mô tả |
|:--|:--|:--|:--|
| `target-dir` | ✅ | — | Thư mục chứa mã nguồn được hỗ trợ |
| `output-dir` | — | `./output` | Thư mục để ghi kết quả đồ thị |
| `--import` | — | — | Tải đồ thị có sẵn, giữ lại dữ liệu ngữ nghĩa (enrichment) |

### Lệnh Serve

```bash
# Khởi động MCP server (stdio transport)
para-graph serve /path/to/workspace
```

<a name="thiet-lap-mcp-server"></a>
## 🤖 Thiết lập MCP Server

Để kết nối `para-graph` với AI Agent editor (như Claude Desktop, Cursor, hay Google Antigravity), bạn cần cấu hình phần cài đặt MCP tương ứng.

### Cài đặt Tự động (Khuyên dùng)

Nếu bạn đang sử dụng PARA Workspace v1.8.2+, bạn có thể tự động hóa cấu hình MCP server cho IDE của mình bằng cách chạy:

```bash
./para mcp-setup
```

Hệ thống sẽ an toàn tự động nhận diện IDE đang hoạt động và tiêm cấu hình MCP server cho `para-graph`.

### Cài đặt Thủ công (Dự phòng)

Nếu bạn muốn cấu hình server theo cách thủ công:

#### Claude Desktop / Antigravity

Sửa file `claude_desktop_config.json` (hoặc `mcp_config.json` đối với Antigravity) và thêm phần sau:

```json
{
  "mcpServers": {
    "para-graph": {
      "command": "<ABSOLUTE_WORKSPACE_PATH>/cli/para",
      "args": [
        "graph",
        "serve",
        "<ABSOLUTE_WORKSPACE_PATH>"
      ]
    }
  }
}
```

*Lưu ý: Thay thế `<ABSOLUTE_WORKSPACE_PATH>` bằng đường dẫn tuyệt đối đến thư mục gốc của PARA Workspace của bạn.*

#### Cursor

Vào **Cursor Settings** > **Features** > **MCP Servers** > **Add New MCP Server**:
- **Name:** `para-graph`
- **Type:** `command`
- **Command:** `<ABSOLUTE_WORKSPACE_PATH>/cli/para graph serve <ABSOLUTE_WORKSPACE_PATH>`

### Các công cụ MCP có sẵn
Sau khi kết nối, AI Agent của bạn sẽ có quyền truy cập vào các công cụ sau:
- `graph_query`: Tìm kiếm thực thể theo tên hoặc kiểu ngữ nghĩa.
- `graph_edges`: Tìm những nơi gọi hàm (callers) và imports.
- `graph_enrich`: Tự động lưu trữ tài liệu và độ phức tạp vào đồ thị.
- `graph_impact_analysis`: Khám phá những file bị ảnh hưởng ở phía trên/dưới khi sửa đổi code.
- `graph_context_bundle`: Lấy toàn bộ ngữ cảnh của một đoạn code chỉ trong một lần gọi.

### Sử dụng như Thư viện

```typescript
// Import như một thư viện
import { CodeGraph } from 'para-graph';

// Import MCP server factory
import { createServer } from 'para-graph/mcp';
```

<a name="dinh-dang-dau-ra"></a>
## 📊 Định dạng đầu ra

Ba file được tạo ra trong thư mục kết quả:

### `entities.jsonl`

Mỗi dòng một thực thể code, sắp xếp theo đường dẫn file:

```json
{"id":"src/graph/code-graph.ts::CodeGraph","type":"class","name":"CodeGraph","filePath":"src/graph/code-graph.ts","startLine":10,"endLine":81,"exportType":"named","signature":"export class CodeGraph {"}
```

### `relations.jsonl`

Mỗi dòng một mối quan hệ, sắp xếp theo file nguồn:

```json
{"sourceId":"src/index.ts","targetId":"./parser/file-walker.js","relation":"IMPORTS_FROM","sourceFile":"src/index.ts","sourceLine":3}
```

### `metadata.json`

Thống kê tóm tắt:

```json
{
  "version": "0.1.0",
  "nodeCount": 31,
  "edgeCount": 47,
  "fileCount": 6,
  "createdAt": "2026-04-21T03:35:33.508Z"
}
```

### Các kiểu Thực thể (Entity Types)

| Kiểu | Mô tả |
|:--|:--|
| `file` | File mã nguồn |
| `class` | Khai báo lớp (Class) |
| `function` | Hàm, phương thức (method), hoặc arrow function |
| `interface` | Khai báo Interface |
| `variable` | Khai báo biến (dự kiến) |

### Các kiểu Mối quan hệ (Relation Types)

| Quan hệ | Mô tả |
|:--|:--|
| `IMPORTS_FROM` | File import từ một module khác |
| `CALLS` | Hàm/phương thức gọi một hàm khác |
| `INHERITS` | Class kế thừa từ một class khác (dự kiến) |
| `IMPLEMENTS` | Class thực thi interface (dự kiến) |

<a name="kien-truc"></a>
## 🏗️ Kiến trúc

```
src/
├── cli.ts                    # Trình định tuyến lệnh phụ (shebang entrypoint)
├── commands/
│   ├── build.ts              # Lệnh build — quét, parse, xuất đồ thị
│   └── serve.ts              # Lệnh serve — vòng đời MCP server
├── graph/
│   ├── models.ts             # Định nghĩa kiểu GraphNode, GraphEdge
│   ├── code-graph.ts         # Đồ thị In-memory với chỉ mục kép
│   ├── jsonl-exporter.ts     # Serialize đồ thị → JSONL files
│   ├── jsonl-importer.ts     # Load đồ thị từ JSONL files
│   └── graph-store.ts        # Quản lý LRU cache cho đa dự án
├── mcp/
│   ├── server.ts             # MCP server factory (pure library export)
│   ├── tools.ts              # Công cụ MCP: query, edges, enrich, impact_analysis...
│   └── resources.ts          # Tài nguyên MCP: Truy cập file JSONL
├── parser/
│   ├── registry.ts           # Đăng ký Ngôn ngữ (lazy-loads parser theo đuôi file)
│   ├── tree-sitter-parser.ts # Động cơ phân tích AST và ánh xạ SSEC
│   └── file-walker.ts        # Trình quét file đệ quy đa ngôn ngữ
└── queries/
    ├── typescript.scm        # Mẫu truy vấn SSEC cho TS/TSX
    ├── python.scm            # Mẫu truy vấn SSEC cho Python
    ├── go.scm                # Mẫu truy vấn SSEC cho Go
    ├── php.scm               # Mẫu truy vấn SSEC cho PHP
    └── bash.scm              # Mẫu truy vấn SSEC cho Bash
```

### Luồng Dữ liệu (Data Flow)

```
File mã nguồn → File Walker → Đăng ký Ngôn ngữ → Trình phân tích Tree-sitter + SSEC Query → CodeGraph (in-memory) → Xuất JSONL
                                                                                        │
                                                                                  GraphStore (LRU)
                                                                                        │
                                                                                  MCP Server → AI Agent
```

<a name="phat-trien"></a>
## 🛠️ Phát triển

```bash
# Cài đặt thư viện
npm install

# Chạy môi trường phát triển
npm run dev

# Biên dịch TypeScript
npm run build

# Chạy test
npm run test
```

### Công nghệ sử dụng (Tech Stack)

| Thành phần | Công nghệ |
|:--|:--|
| Runtime | Node.js ≥ 18 |
| Ngôn ngữ | TypeScript 5.x (strict mode) |
| Phân tích AST | tree-sitter + tree-sitter-typescript |
| Test Runner | Vitest |
| Dev Runner | tsx |

<a name="tri-tue-nhan-tao"></a>
## 🧠 Trí tuệ Nhân tạo (PARA Workspace)

Công cụ này đi kèm với các artifact trí tuệ nhân tạo nhằm nâng cao trải nghiệm làm việc với Agent trên hệ sinh thái PARA Workspace. Khi bạn cài đặt qua lệnh `./para install-tool para-graph`, các artifact này sẽ được cài đặt tự động vào thư mục `.agents/` của workspace:

| Loại | Tên | Phiên bản | Mô tả & Cách dùng |
|:--|:--|:--|:--|
| Workflow | `/para-graph` | 1.8.0 | Gõ `@[/para-graph]` để chỉ thị cho AI quét lại dự án và cập nhật trí nhớ đồ thị. |
| Skill | `graph-enrichment` | 1.0.0 | Được nạp tự động khi Agent đọc dữ liệu đồ thị. Hướng dẫn Agent phân tích ngữ nghĩa (thêm summary, complexity). |
| Rule | `graph-first-policy` | 1.0.0 | Bắt buộc thực hiện lập trình kiểu "đồ thị là trên hết". Agent sẽ tự động truy vấn MCP server trước khi ra quyết định kiến trúc. |

> Yêu cầu PARA Workspace v1.8.2+ để có thể sử dụng chức năng tự động nhận diện cấu hình MCP.

<a name="lo-trinh"></a>
## 🗺️ Lộ trình (Roadmap)

| Giai đoạn | Mô tả | Trạng thái |
|:--|:--|:--|
| P1 | Cấu trúc cơ bản (Tree-sitter AST) | ✅ Hoàn thành |
| P2 | Làm giàu ngữ nghĩa tự động bằng Agent | ✅ Hoàn thành |
| P3 | Storage & Động cơ Truy vấn | ✅ Hoàn thành |
| P4 | Tích hợp CLI & NPM Package | ✅ Hoàn thành |
| P5 | Hỗ trợ đa ngôn ngữ & Tái cấu trúc Query | ✅ Hoàn thành |
| P6 | Truy vấn tác động & bối cảnh | ✅ Hoàn thành |
| P7 | Giải quyết cạnh tự động cho Bash | ✅ Hoàn thành |
| P8 | Deep CALLS + Nhận diện Design Pattern | 📋 Trong kế hoạch |
| P9 | Viết tài liệu & Phát hành v1.0.0 | 📋 Trong kế hoạch |

<a name="giay-phep"></a>
## 📄 Giấy phép

[MIT](../../LICENSE)
