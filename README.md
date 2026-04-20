# feishu-preview

**语言 / Language:** [中文](#中文) | [English](#english)

---

<a name="中文"></a>

# 中文文档

## 这是什么？

`feishu-preview` 是一个 **Claude Code AI 技能 + CLI 工具**，覆盖飞书 Mermaid 图表的完整工作流：

```
写图表 → 检查兼容性 → 自动修正 → 本地预览 → 同步到飞书
```

**解决的核心问题：**

飞书使用的 Mermaid 渲染引擎（v8）与标准 Mermaid（v10+）存在语法差异，导致：
- 在 VS Code / 其他工具里预览正常，推送到飞书后图表报错或空白
- 不知道哪里语法有问题，只能盲改反复测试
- 本地预览效果和飞书实际效果不一致

本工具通过 **飞书官方的 whiteboard-cli 渲染引擎** 生成本地预览，保证「所见即所得」。

---

## 快速上手（2 步）

### 第一步：安装插件

在 Claude Code 里运行：

```
/plugin marketplace add andyliu/feishu-preview
```

CLI 工具和 Claude Code 技能定义一并安装，后续版本更新自动完成，无需手动操作。

> 需要 Node.js ≥ 16。没有的话先去 [nodejs.org](https://nodejs.org) 下载安装。

安装后运行一次依赖检查，工具会自动检测并引导安装 `lark-cli` 等依赖：

```bash
feishu-preview doctor
```

### 第二步：使用

**Claude Code 自然语言（推荐）**

安装后，在 Claude Code 对话里直接说：

```
检查 docs/my-diagram.md 的飞书兼容性
预览 docs/my-diagram.md
同步 docs/my-diagram.md 到飞书文档
```

Claude Code 会自动调用工具，引导你完成每一步。

**CLI 命令（直接调用）**

```bash
# 写完图表后，检查飞书兼容性
feishu-preview check docs/my-diagram.md

# 发现问题？一键自动修正
feishu-preview convert docs/my-diagram.md -w

# 生成本地精确预览（与飞书渲染一致）
feishu-preview preview docs/my-diagram.md

# 查看飞书同步状态
feishu-preview status docs/my-diagram.md
```

---

## 全部命令

| 命令 | 说明 |
|---|---|
| `feishu-preview doctor` | 检查并安装所有必要依赖（lark-cli 等），交互式引导 |
| `feishu-preview install-skill` | 安装 Claude Code 技能定义到 `~/.claude/skills/` |
| `feishu-preview check <file>` | 检查飞书兼容性，只读，exit 1 表示有问题 |
| `feishu-preview convert <file> -w` | 原地修正源文件中所有不兼容语法 |
| `feishu-preview convert <file> -o out.md` | 修正后输出到新文件（不改源文件） |
| `feishu-preview preview <file>` | 精确预览：用飞书官方引擎渲染为 PNG（默认） |
| `feishu-preview preview <file> --fast` | **仅语法调试**：Mermaid CDN 渲染，结果与飞书不符，不可用于视觉验证 |
| `feishu-preview status <file>` | 查看 `.feishu-index.json` 中的同步状态 |

---

## 预览模式说明

| 模式 | 命令 | 渲染引擎 | 特点 |
|---|---|---|---|
| **精确模式**（默认） | `feishu-preview preview file.md` | `@larksuite/whiteboard-cli`，每张图渲染为 PNG | 与飞书实际效果完全一致；**同步前必须用此模式确认**；首次运行需联网下载 |
| **调试模式**（`--fast`，⚠️ 非视觉验证） | `feishu-preview preview file.md --fast` | Mermaid.js v10 CDN，交互式 SVG | **仅用于排查 Mermaid 语法错误**（浏览器控制台显示详细报错）；渲染引擎与飞书不同，结果不可作为视觉依据 |

精确模式生成的 HTML 中，PNG 以 base64 内嵌，可离线分享。

---

## 飞书兼容性问题说明

以下是飞书 Mermaid 与标准写法的已知差异，`feishu-preview check` / `convert` 会自动处理：

| 问题 | 标准写法 | 飞书要求 | 原因 |
|---|---|---|---|
| 换行符 | `<br/>` | `<br>` | 飞书解析器不接受 XML 自闭合标签 |
| Note 内的小于号 | `x < 300s` | `x ＜ 300s`（全角） | 解析器把 `<` 视为 HTML 标签开始，`&lt;` 同样无效 |
| 状态图版本 | `stateDiagram-v2` | `stateDiagram` | 飞书仅支持旧版布局引擎 |
| 多行引用块 | `> 第一行\n> 第二行` | `> 第一行<br>第二行` | 飞书把多行 `>` 直接拼接，不加空格，导致句子粘连 |
| 节点双引号 | `A["文字"]` | 保持不变 | 飞书接受双引号；改成单引号反而报 `PS` token 错误 |

---

## 同步状态文件 `.feishu-index.json`

同步到飞书后，工具会在 `.md` 文件同目录生成 `.feishu-index.json`，记录每个图表对应的飞书 whiteboard token，方便后续迭代更新（无需删旧建新）。

```json
{
  "my-diagram.md": {
    "doc_url": "https://your-org.feishu.cn/docx/Xxxxx",
    "last_synced": "2026-04-20T10:00:00Z",
    "whiteboards": {
      "2.1 注册时序图": "FY0FwuSKShMWuZbMjX0czKk6nLh",
      "3.1 加密流程图": "ARJXwDxhchVthfblGrCcH5jmnfc"
    }
  }
}
```

> ⚠️ 此文件包含文档 URL 和 token，已加入 `.gitignore`，**不要提交到 Git**。

---

## 环境要求

| 依赖 | 用途 | 安装方式 |
|---|---|---|
| Node.js ≥ 16 | 运行所有脚本 | [nodejs.org](https://nodejs.org) |
| Claude Code | 使用自然语言技能 | [claude.ai/code](https://claude.ai/code) |
| `feishu-preview` | 本工具 | `/plugin marketplace add andyliu/feishu-preview` |
| `@larksuite/whiteboard-cli` | 精确预览模式（npx 自动拉取） | 无需手动安装 |
| `lark-cli` | 飞书文档同步（仅推送时需要） | `npm install -g @larksuite/lark-cli` |

`feishu-preview` 本身**零 npm 运行时依赖**，只使用 Node.js 内置模块。

---

## 项目结构

```
feishu-preview/
├── .claude-plugin/
│   └── marketplace.json         # Claude Code 插件市场描述
├── plugins/
│   └── feishu-preview/
│       ├── .claude-plugin/
│       │   └── plugin.json      # 插件元数据
│       ├── bin/
│       │   ├── feishu-preview   # CLI 入口（feishu-preview 命令）
│       │   ├── render-preview.js  # Markdown → HTML 预览生成器
│       │   └── feishu-compat.js   # Mermaid 飞书兼容性转换器
│       └── skills/
│           └── feishu-preview/
│               └── SKILL.md     # Claude Code 技能定义
└── package.json
```

---

## 最佳实践

### 目录结构

把图表文档放在独立目录，便于管理 `.feishu-index.json`：

```
docs/
└── diagrams/
    ├── device-flow.md          # 源文件（含 Mermaid，这是唯一可编辑的地方）
    ├── device-flow.preview.html  # 自动生成，gitignore，勿提交
    └── .feishu-index.json        # 记录飞书 token，gitignore，勿提交
```

### 标准工作流

每次修改图表后，按以下顺序执行，不要跳步：

```
1. 编写/修改 Mermaid 代码
2. feishu-preview check    → 检查兼容性
3. feishu-preview convert -w  → 有问题则修正
4. feishu-preview preview  → 精确预览确认效果（必须，同步前最后防线）
5. 告诉 Claude Code "同步到飞书"
```

### 本地 .md 是唯一真相来源

- **永远不要在飞书 Whiteboard 编辑器里直接修改 Mermaid**——飞书不提供导出功能，修改后将无法同步回本地，等于丢失版本控制
- 所有修改都在本地 `.md` 文件进行，飞书文档只是展示层

### Git 提交规范

```bash
# ✅ 应该提交
git add docs/diagrams/device-flow.md

# ❌ 不要提交（已在 .gitignore）
# docs/diagrams/device-flow.preview.html
# docs/diagrams/.feishu-index.json
```

### 每个 H2 标题对应一个图表

飞书 whiteboard 以标题为锚点定位，建议每张图表前保留清晰的 H2 标题，便于迭代更新时精确定位：

```markdown
## 2.1 设备注册时序

```mermaid
sequenceDiagram
    ...
```

## 3.1 密钥派生流程

```mermaid
flowchart TD
    ...
```
```

### 精确预览 vs 调试模式

| 场景 | 命令 |
|---|---|
| 同步前的最终视觉确认 | `feishu-preview preview file.md`（精确模式，必须） |
| 图表报错，需要看详细报错信息 | `feishu-preview preview file.md --fast`（调试专用，结果不代表飞书效果） |

---

## 常见问题

**Q：精确预览时图表显示空白或红色错误框？**

切换快速模式排查语法：`feishu-preview preview file.md --fast`，浏览器控制台会输出详细的 Mermaid 错误信息。修复后再切回精确模式确认效果。

**Q：推送到飞书后想更新图表怎么操作？**

修改本地 `.md` → `feishu-preview check` → `feishu-preview convert -w` → `feishu-preview preview` 确认效果 → Claude Code 说「同步到飞书」。

**永远不要在飞书 Whiteboard 编辑器里直接修改 Mermaid 内容**——飞书不提供导出回源码的功能，修改后无法同步回本地。

**Q：`stateDiagram-v2` 降级为 `stateDiagram` 会丢失功能吗？**

不会影响绝大多数图表。两者语法兼容，区别仅在于内部布局引擎，常用的状态、转换、note、并发写法均支持。

---

## 相关链接

- npm：[npmjs.com/package/feishu-preview](https://www.npmjs.com/package/feishu-preview)
- GitHub：[github.com/andyliu/feishu-preview](https://github.com/andyliu/feishu-preview)
- 问题反馈：[GitHub Issues](https://github.com/andyliu/feishu-preview/issues)

---

[⬆ 回到顶部](#feishu-preview) | [English →](#english)

---

<a name="english"></a>

# English Documentation

## What Is This?

`feishu-preview` is a **Claude Code AI skill + CLI tool** covering the full Mermaid-in-Feishu workflow:

```
Write diagrams → Check compatibility → Auto-fix → Local preview → Sync to Feishu
```

**Core problems solved:**

Feishu uses a Mermaid rendering engine (v8) that differs from standard Mermaid (v10+), causing:
- Diagrams that look fine locally but show errors or go blank in Feishu
- No way to know which syntax is incompatible without blind trial-and-error
- Local preview doesn't match what Feishu actually renders

This tool uses **Feishu's own official `whiteboard-cli` rendering engine** for local preview, giving you true WYSIWYG accuracy.

---

## Quick Start (2 steps)

### Step 1: Install the Plugin

In Claude Code, run:

```
/plugin marketplace add andyliu/feishu-preview
```

This installs both the CLI and the Claude Code skill definition in one step.
Future updates are applied automatically at startup — no manual reinstall needed.

> Requires Node.js ≥ 16. Download from [nodejs.org](https://nodejs.org) if needed.

After installing, run the dependency checker once. It detects missing tools (like `lark-cli`) and walks you through installing them:

```bash
feishu-preview doctor
```

### Step 2: Use It

**Claude Code natural language (recommended)**

Just talk to Claude Code:

```
Check docs/my-diagram.md for Feishu compatibility
Preview docs/my-diagram.md
Sync docs/my-diagram.md to Feishu
```

Claude Code will call the tools automatically and guide you through each step.

**CLI commands (direct use)**

```bash
# Check for Feishu-incompatible syntax after writing
feishu-preview check docs/my-diagram.md

# Issues found? Auto-fix in-place
feishu-preview convert docs/my-diagram.md -w

# Generate accurate local preview (same engine as Feishu)
feishu-preview preview docs/my-diagram.md

# View sync status
feishu-preview status docs/my-diagram.md
```

---

## All Commands

| Command | Description |
|---|---|
| `feishu-preview doctor` | Check and install required dependencies (lark-cli etc.), interactive guided setup |
| `feishu-preview install-skill` | Install Claude Code skill to `~/.claude/skills/` |
| `feishu-preview check <file>` | Check Feishu compatibility (read-only; exit 1 = issues found) |
| `feishu-preview convert <file> -w` | Fix all incompatible syntax in-place |
| `feishu-preview convert <file> -o out.md` | Fix and write to a new file (source unchanged) |
| `feishu-preview preview <file>` | Accurate preview: render via Feishu's own engine (default) |
| `feishu-preview preview <file> --fast` | **Syntax debug only**: Mermaid CDN render — output does NOT match Feishu, not for visual verification |
| `feishu-preview status <file>` | Show sync state from `.feishu-index.json` |

---

## Preview Modes

| Mode | Command | Engine | Notes |
|---|---|---|---|
| **Accurate** (default) | `feishu-preview preview file.md` | `@larksuite/whiteboard-cli`, renders each diagram as PNG | Matches Feishu exactly; **required before syncing**; network needed on first run |
| **Debug** (`--fast`, ⚠️ not for visual verification) | `feishu-preview preview file.md --fast` | Mermaid.js v10 CDN, interactive SVG | **Syntax debugging only** — browser console shows parse errors; different engine from Feishu, output cannot be used as visual reference |

In accurate mode, PNGs are base64-embedded in the HTML output — shareable offline.

---

## Feishu Compatibility Issues

Known differences between standard Mermaid and Feishu's engine, all handled automatically by `check` / `convert`:

| Issue | Standard | Feishu requires | Why |
|---|---|---|---|
| Line break | `<br/>` | `<br>` | Feishu's parser rejects XML self-closing tags |
| Less-than in Notes | `x < 300s` | `x ＜ 300s` (fullwidth) | Parser treats `<` as HTML tag start; `&lt;` is also broken |
| State diagram version | `stateDiagram-v2` | `stateDiagram` | Feishu only supports the older layout engine |
| Multi-line blockquotes | `> line1\n> line2` | `> line1<br>line2` | Feishu concatenates `>` lines with no separator, causing words to run together |
| Node double-quotes | `A["text"]` | unchanged | Feishu accepts double-quotes; single-quotes trigger a `PS` token error |

---

## Sync State File `.feishu-index.json`

After syncing to Feishu, the tool writes `.feishu-index.json` alongside your `.md` file, recording each diagram's whiteboard token for future incremental updates (no need to delete and re-create).

```json
{
  "my-diagram.md": {
    "doc_url": "https://your-org.feishu.cn/docx/Xxxxx",
    "last_synced": "2026-04-20T10:00:00Z",
    "whiteboards": {
      "2.1 Registration Sequence": "FY0FwuSKShMWuZbMjX0czKk6nLh",
      "3.1 Encryption Flowchart": "ARJXwDxhchVthfblGrCcH5jmnfc"
    }
  }
}
```

> ⚠️ This file contains doc URLs and tokens. It's already in `.gitignore` — **do not commit it**.

---

## Requirements

| Dependency | Purpose | Install |
|---|---|---|
| Node.js ≥ 16 | Run all scripts | [nodejs.org](https://nodejs.org) |
| Claude Code | Natural language skill interface | [claude.ai/code](https://claude.ai/code) |
| `feishu-preview` | This tool | `/plugin marketplace add andyliu/feishu-preview` |
| `@larksuite/whiteboard-cli` | Accurate preview mode (auto-fetched via npx) | Not needed manually |
| `lark-cli` | Feishu document sync (push only) | `npm install -g @larksuite/lark-cli` |

`feishu-preview` itself has **zero npm runtime dependencies** — only Node.js built-ins.

---

## Project Structure

```
feishu-preview/
├── .claude-plugin/
│   └── marketplace.json           # Claude Code plugin marketplace manifest
├── plugins/
│   └── feishu-preview/
│       ├── .claude-plugin/
│       │   └── plugin.json        # Plugin metadata
│       ├── bin/
│       │   ├── feishu-preview     # CLI entry point (the feishu-preview command)
│       │   ├── render-preview.js  # Markdown → HTML preview generator
│       │   └── feishu-compat.js   # Mermaid Feishu compatibility converter
│       └── skills/
│           └── feishu-preview/
│               └── SKILL.md       # Claude Code skill definition
└── package.json
```

---

## Best Practices

### Directory Layout

Keep diagram documents in a dedicated directory so `.feishu-index.json` is co-located:

```
docs/
└── diagrams/
    ├── device-flow.md            # Source file — the only place you edit Mermaid
    ├── device-flow.preview.html  # Auto-generated, gitignored, do not commit
    └── .feishu-index.json        # Feishu whiteboard tokens, gitignored, do not commit
```

### Standard Workflow — Never Skip Steps

Every time you edit a diagram, follow this order without skipping:

```
1. Write / edit Mermaid code in the .md file
2. feishu-preview check      → detect compatibility issues
3. feishu-preview convert -w → auto-fix issues if any
4. feishu-preview preview    → accurate visual verification (required — last check before sync)
5. Tell Claude Code "sync to Feishu"
```

### Local .md Is the Single Source of Truth

- **Never edit Mermaid content directly in Feishu's Whiteboard editor** — Feishu provides no export function, so any change made there cannot be synced back. You lose version control permanently.
- All edits happen in the local `.md` file. Feishu is display-only.

### Git Hygiene

```bash
# ✅ Commit this
git add docs/diagrams/device-flow.md

# ❌ Do not commit (already in .gitignore)
# docs/diagrams/device-flow.preview.html
# docs/diagrams/.feishu-index.json
```

### One H2 Heading Per Diagram

Feishu uses headings as anchors for whiteboard placement. Keep a clear H2 heading before each diagram to enable precise iterative updates:

```markdown
## 2.1 Device Registration Sequence

```mermaid
sequenceDiagram
    ...
```

## 3.1 Key Derivation Flow

```mermaid
flowchart TD
    ...
```
```

### Accurate Mode vs Debug Mode

| When | Command |
|---|---|
| Final visual verification before sync | `feishu-preview preview file.md` (accurate — required) |
| Diagram fails to render, need parse error details | `feishu-preview preview file.md --fast` (debug only — output does not represent Feishu) |

---

## FAQ

**Q: Diagram is blank or shows a red error box in accurate mode?**

Switch to fast mode for debugging: `feishu-preview preview file.md --fast`. The browser console will show detailed Mermaid error messages. Fix the syntax, then switch back to accurate mode to confirm.

**Q: I pushed a diagram and want to update it — how?**

Edit local `.md` → `feishu-preview check` → `feishu-preview convert -w` → `feishu-preview preview` to confirm → tell Claude Code "sync to Feishu".

**Never edit Mermaid content directly in Feishu's Whiteboard editor** — Feishu provides no way to export it back to source code.

**Q: Does downgrading `stateDiagram-v2` to `stateDiagram` lose functionality?**

No impact for most diagrams. The two variants use different internal layout engines but share the same syntax. Common features — states, transitions, notes, concurrency — all work in both.

---

## Links

- npm: [npmjs.com/package/feishu-preview](https://www.npmjs.com/package/feishu-preview)
- GitHub: [github.com/andyliu/feishu-preview](https://github.com/andyliu/feishu-preview)
- Issues: [GitHub Issues](https://github.com/andyliu/feishu-preview/issues)

---

[⬆ Back to top](#feishu-preview) | [← 中文](#中文)

---

## License

MIT
