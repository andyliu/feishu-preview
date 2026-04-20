# feishu-mermaid-sync

> 本地 Markdown / Mermaid 预览与飞书文档同步工具链（零 npm 依赖）
>
> Zero-npm-dependency toolchain for local Markdown/Mermaid preview and Feishu (Lark) document sync

---

## 快速上手 / Quick Start

```bash
# 克隆后立即预览演示文件（无需任何安装）
# Clone and preview the demo — no install needed
git clone https://github.com/your-username/feishu-mermaid-sync.git
cd feishu-mermaid-sync
node sync.js preview test/demo-iot-protocol.md
```

浏览器自动打开，30 秒内看到 8 种图表类型的渲染结果。

Browser opens automatically. See 8 diagram types rendered in under 30 seconds.

---

## 这是什么 / What It Does

本工具解决飞书 Mermaid 工作流的三个核心痛点：

This tool solves three core pain points in the Feishu Mermaid workflow:

1. **飞书语法不兼容** — `feishu-compat.js` 自动修正所有已知差异（`<br/>`、全角 `＜`、`stateDiagram-v2` 降级等）
   **Feishu syntax incompatibility** — `feishu-compat.js` auto-fixes all known differences

2. **本地预览与飞书效果不一致** — 预览时应用相同兼容转换，使用飞书自家渲染引擎（accurate 模式）或 Mermaid v10 CDN（fast 模式）
   **Local preview doesn't match Feishu** — same compat rules applied at preview time; accurate mode uses Feishu's own engine

3. **反复盲改成本高** — 先预览确认，再引导式推送（dry-run 默认开启）
   **Blind API edits waste time** — preview first, then guided push with dry-run by default

**核心原则 / Core principle:** 本地 `.md` 文件是唯一可编辑源，飞书文档是只读展示层。
Local `.md` file is the single source of truth; Feishu document is a read-only display layer.

---

## 环境要求 / Requirements

| 依赖 / Dependency | 用途 / Purpose | 安装 / Install |
|---|---|---|
| Node.js ≥ 16 | 运行所有脚本 / Run all scripts | [nodejs.org](https://nodejs.org) |
| `@larksuite/whiteboard-cli` | accurate 预览模式（npx 自动拉取）/ accurate preview mode (auto via npx) | 无需手动安装 / auto-installed |
| `lark-cli` | 飞书同步（仅 push 子命令需要）/ Feishu sync (push only) | `npm install -g @larksuite/lark-cli` |

零 npm 依赖——除上述两个飞书官方工具外，只用 Node.js 内置模块。

Zero npm dependencies — only Node.js built-ins, plus the two official Feishu tools above.

---

## 命令参考 / Commands Reference

### `preview` — 本地预览 / Local Preview

```bash
node sync.js preview <file.md> [--fast]
```

生成 `.preview.html` 并自动用浏览器打开。

Generates `.preview.html` and opens it in your browser automatically.

**两种预览模式 / Two preview modes:**

| 模式 / Mode | 命令 / Command | 渲染引擎 / Engine | 特点 / Notes |
|---|---|---|---|
| **accurate**（默认 / default） | `node sync.js preview file.md` | `@larksuite/whiteboard-cli` 将每张图渲染为 PNG（飞书自家引擎）/ renders each diagram as PNG via Feishu's own engine | 与飞书实际效果最接近；首次需联网下载 whiteboard-cli / Closest to Feishu output; requires network on first run |
| **fast** | `node sync.js preview file.md --fast` | Mermaid.js v10 CDN，交互式 SVG / Mermaid.js v10 CDN, interactive SVG | 即时渲染，可交互，图表细节可能与飞书有出入 / Instant, interactive; minor layout differences possible |

> accurate 模式：PNG 以 base64 内嵌 HTML，可离线分享。
> Accurate mode: PNGs are base64-embedded in the HTML, shareable offline.

---

### `convert` — 飞书兼容转换 / Feishu Compatibility Conversion

```bash
node sync.js convert <file.md> [-o output.md]
```

对所有 ` ```mermaid ``` ` 代码块应用兼容规则，不修改源文件（除非加 `-w`）。
输出修改摘要；无修改时报告 `✅ 无需修改`。

Applies compat rules to all ` ```mermaid ``` ` blocks; never touches the source file (unless `-w` is passed).
Prints a change summary; reports `✅ No changes needed` if nothing to fix.

---

### `status` — 查看同步状态 / Show Sync State

```bash
node sync.js status <file.md>
```

读取同目录的 `.feishu-index.json`，显示文档 URL、whiteboard token、上次同步时间。

Reads `.feishu-index.json` in the same directory and shows doc URL, whiteboard token, last sync timestamp.

---

### `push` — 引导式推送 / Guided Push

```bash
node sync.js push <file.md> --doc-url https://your-org.feishu.cn/docx/Xxxxx
```

引导完成以下步骤，每步打印对应 lark-cli 命令（dry-run 版），由你确认后执行：

Guides you through these steps, printing the corresponding lark-cli command (dry-run version) at each step for your confirmation:

1. 生成本地预览（视觉确认）/ Generate local preview (visual check)
2. 飞书兼容转换（写入临时文件）/ Apply feishu-compat (writes to temp file)
3. 读取飞书文档当前状态 / Fetch current Feishu document state
4. 检测已有 whiteboard token / Detect existing whiteboard token
5. 打印推荐的更新命令（dry-run）/ Print recommended update command (dry-run)
6. 更新 `.feishu-index.json` / Update `.feishu-index.json`

---

## 飞书兼容性转换表 / Feishu Compatibility Conversions

`feishu-compat.js` 处理的所有已知差异：

All known incompatibilities handled by `feishu-compat.js`:

| 问题 / Issue | 原始 / Before | 转换后 / After | 说明 / Notes |
|---|---|---|---|
| 换行符 / Line break | `<br/>` | `<br>` | 飞书不接受自闭合 / Feishu rejects self-closing |
| Note 内裸 `<` / Bare `<` in Note | `x < 300s` | `x ＜ 300s` | 全角；`&lt;` 同样无效 / Fullwidth; `&lt;` also broken |
| `stateDiagram-v2` | `stateDiagram-v2` | `stateDiagram` | 飞书不支持 v2 / Feishu doesn't support v2 |
| 多行引用块 / Multi-line blockquote | `> l1\n> l2` | `> l1<br>l2` | 合并为单行 / Merged to single line |
| 节点双引号 / Node double-quotes | `A["text"]` | 保持 / kept as-is | 单引号反而报错 / Single quotes break Feishu |

---

## `.feishu-index.json` 格式 / Format

存放于 `.md` 文件同目录，记录同步状态。**已加入 `.gitignore`，不要提交。**

Stored in the same directory as the `.md` file. **Already in `.gitignore` — do not commit.**

```json
{
  "your-doc.md": {
    "doc_url": "https://your-org.feishu.cn/docx/Xxxxx",
    "diagram_title": "## 图表章节标题 / Diagram section heading",
    "whiteboard_token": "S3xxxxxxxxxx",
    "last_synced": "2026-04-20T10:00:00Z"
  }
}
```

| 字段 / Field | 说明 / Description |
|---|---|
| `doc_url` | 飞书文档 URL / Feishu document URL |
| `diagram_title` | 图表前的标题行，用于 `--selection-by-title` 定位 / Heading before the diagram, used for `--selection-by-title` |
| `whiteboard_token` | 首次推送后从飞书获取 / Obtained from Feishu after first push |
| `last_synced` | ISO 时间戳 / ISO timestamp |

---

## 项目结构 / Project Structure

```
feishu-mermaid-sync/
├── sync.js                     # 统一入口 / Unified entry point
├── render-preview.js           # Markdown → HTML 预览 / Markdown → HTML preview
├── feishu-compat.js            # Mermaid 飞书兼容转换 / Mermaid compatibility converter
├── SKILL.md                    # Claude Code AI agent skill 定义 / skill definition
├── .feishu-index.json          # 同步状态记录（gitignored）/ Sync state (gitignored)
├── .gitignore
├── README.md
└── test/
    └── demo-iot-protocol.md    # 中英双语演示文档，覆盖 8 种图表类型
                                # Bilingual demo document with 8 diagram types
```

---

## 常见问题 / FAQ

**Q: 预览时图表空白或报错，怎么办？**
**Q: Diagram is blank or shows an error in preview — what do I do?**

A: accurate 模式下，错误会显示红色错误框和转换后的源码。切换 `--fast` 模式可快速排查语法问题，因为 fast 模式会在浏览器控制台输出详细的 Mermaid 错误。

In accurate mode, a red error box appears with the converted source. Switch to `--fast` for quick syntax debugging — the browser console shows detailed Mermaid errors.

---

**Q: `stateDiagram-v2` 转为 `stateDiagram` 后功能会丢失吗？**
**Q: Does downgrading `stateDiagram-v2` to `stateDiagram` lose functionality?**

A: 对绝大多数图表无影响。`stateDiagram-v2` 是 Mermaid 内部引用两种不同布局引擎的写法，飞书只支持旧版引擎，但常用语法（状态、转换、note、并发）均兼容。

No impact for most diagrams. `stateDiagram-v2` references a different internal layout engine. Feishu only supports the older engine, but all common syntax (states, transitions, notes, concurrency) is compatible.

---

**Q: 推送后想修改图表，怎么操作？**
**Q: I pushed a diagram and want to update it — how?**

A: 修改本地 `.md` 文件 → `node sync.js preview` 确认 → `node sync.js convert` 生成兼容版 → 用 `.feishu-index.json` 中的 `whiteboard_token` 执行 `lark-cli docs +whiteboard-update --overwrite`（先加 `--dry-run`）。**永远不要在飞书 Whiteboard 编辑器里直接改 Mermaid 内容**——无法导出回源码。

Edit the local `.md` → `node sync.js preview` to confirm → `node sync.js convert` to generate compat version → use the `whiteboard_token` from `.feishu-index.json` with `lark-cli docs +whiteboard-update --overwrite` (add `--dry-run` first). **Never edit Mermaid content directly in Feishu's Whiteboard editor** — there is no way to export it back to source.

---

**Q: 工具会修改我的源文件吗？**
**Q: Will this tool modify my source `.md` file?**

A: 不会。`convert` 和 `push` 默认写入临时文件或 `-o` 指定的输出路径。只有显式传 `-w` 标志时才原地修改源文件。

No. `convert` and `push` write to a temp file or the path specified by `-o` by default. The source file is only modified in-place when you explicitly pass the `-w` flag.

---

## License

MIT
