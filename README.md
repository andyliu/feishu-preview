# feishu-preview

> 飞书 Mermaid 图表全流程 **Claude Code 技能** + CLI 工具
>
> A Claude Code skill (+ CLI) for the full Mermaid-in-Feishu lifecycle:
> write → check compatibility → fix → preview → sync

---

## 定位 / What This Is

本项目是一个 **Claude Code AI 技能（skill）**，以自然语言驱动飞书 Mermaid 图表的完整工作流。  
底层 CLI 工具作为技能的执行层，也可单独使用。

This project is a **Claude Code AI skill** — you interact with it through natural language in Claude Code conversations. The CLI tools serve as the execution layer and can also be used standalone.

```
用户（自然语言）→ Claude Code（feishu-preview skill）→ CLI 工具 → 飞书文档
User (natural language) → Claude Code (feishu-preview skill) → CLI → Feishu doc
```

**覆盖的完整生命周期 / Full lifecycle covered:**

| 阶段 | 触发词示例 | 执行操作 |
|---|---|---|
| ① 检查 | "检查 my-doc.md 飞书兼容性" | 扫描所有 Mermaid 块，报告不兼容语法 |
| ② 修正 | "自动修正" | 原地修正 `<br/>`、全角 `＜`、`stateDiagram-v2` 等 |
| ③ 预览 | "预览 my-doc.md" | 生成 HTML，用飞书自家渲染引擎（精确）或 CDN（快速）|
| ④ 同步 | "同步到飞书" | 通过 lark-cli 推送到飞书文档 |

---

## 快速上手 / Quick Start

### 方式一：作为 Claude Code 技能（推荐）

```bash
# 1. 安装 CLI
npm install -g feishu-preview

# 2. 安装 Claude Code 技能定义
feishu-preview install-skill
# → 自动复制 SKILL.md 到 ~/.claude/skills/feishu-preview/

# 3. 在 Claude Code 中用自然语言操作
# "检查 docs/my-diagram.md 的飞书兼容性"
# "预览 docs/my-diagram.md"
# "同步 docs/my-diagram.md 到飞书文档"
```

### 方式二：直接使用 CLI

```bash
npm install -g feishu-preview

feishu-preview check   docs/my-diagram.md      # 检查兼容性
feishu-preview convert docs/my-diagram.md -w   # 自动修正源文件
feishu-preview preview docs/my-diagram.md      # 本地预览（精确模式）
feishu-preview preview docs/my-diagram.md --fast  # 快速预览
```

### 方式三：不安装，克隆后直接用

```bash
git clone https://github.com/andyliu/feishu-preview.git
cd feishu-preview
node sync.js preview test/demo-iot-protocol.md
```

---

## 环境要求 / Requirements

| 依赖 | 用途 | 安装 |
|---|---|---|
| Node.js ≥ 16 | 运行所有脚本 | [nodejs.org](https://nodejs.org) |
| Claude Code | 技能宿主（方式一） | [claude.ai/code](https://claude.ai/code) |
| `@larksuite/whiteboard-cli` | accurate 预览模式（npx 自动拉取） | 无需手动安装 |
| `lark-cli` | 飞书同步（仅 push 需要） | `npm install -g @larksuite/lark-cli` |

零 npm 运行时依赖——仅用 Node.js 内置模块，加上两个飞书官方工具。

---

## 命令参考 / CLI Reference

### `check` — 检查兼容性

```bash
feishu-preview check <file.md>
```

扫描所有 Mermaid 代码块，报告飞书不兼容项（exit 0 = 通过，exit 1 = 有问题）。  
不修改任何文件。适合写完图表后立即调用。

---

### `convert` — 飞书兼容转换

```bash
feishu-preview convert <file.md> -w          # 原地修正源文件
feishu-preview convert <file.md> -o out.md   # 输出到新文件
```

自动修正所有已知不兼容项，打印修改摘要。无修改时报告 `✅ 无需修改`。

---

### `preview` — 本地预览

```bash
feishu-preview preview <file.md>          # 精确模式（默认）
feishu-preview preview <file.md> --fast   # 快速模式
```

生成 `.preview.html` 并自动在浏览器打开。

| 模式 | 渲染引擎 | 特点 |
|---|---|---|
| **accurate**（默认） | `@larksuite/whiteboard-cli` PNG | 与飞书实际效果最接近；首次需联网 |
| **fast** | Mermaid.js v10 CDN，交互 SVG | 即时渲染，可交互；细节可能有出入 |

> accurate 模式：PNG 以 base64 内嵌 HTML，可离线分享。

---

### `status` — 查看同步状态

```bash
feishu-preview status <file.md>
```

读取同目录的 `.feishu-index.json`，显示文档 URL、whiteboard tokens、上次同步时间。

---

### `install-skill` — 安装 Claude Code 技能

```bash
feishu-preview install-skill
```

复制 `SKILL.md` 到 `~/.claude/skills/feishu-preview/SKILL.md`，使技能在所有项目中可用。

---

## 飞书兼容性转换表 / Compatibility Conversions

`feishu-compat.js` 处理的所有已知差异：

| 问题 | 原始 | 转换后 | 说明 |
|---|---|---|---|
| 换行符 | `<br/>` | `<br>` | 飞书不接受自闭合 |
| Note 内裸 `<` | `x < 300s` | `x ＜ 300s` | 全角；`&lt;` 同样无效 |
| `stateDiagram-v2` | `stateDiagram-v2` | `stateDiagram` | 飞书不支持 v2 |
| 多行引用块 | `> l1\n> l2` | `> l1<br>l2` | 合并为单行 |
| 节点双引号 | `A["text"]` | 保持不变 | 单引号反而报错 |

---

## `.feishu-index.json` 格式

存放于 `.md` 文件同目录，记录同步状态。**已加入 `.gitignore`，不要提交。**

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

---

## 项目结构 / Project Structure

```
feishu-preview/
├── sync.js              # CLI 入口（feishu-preview 命令）
├── render-preview.js    # Markdown → HTML 预览
├── feishu-compat.js     # Mermaid 飞书兼容转换
├── SKILL.md             # Claude Code 技能定义（install-skill 会复制到 ~/.claude/skills/）
├── package.json
├── .gitignore
├── README.md
└── test/
    └── demo-iot-protocol.md   # 中英双语演示文档，覆盖 8 种图表类型
```

---

## 常见问题 / FAQ

**Q: 预览时图表空白或报错？**

accurate 模式下，错误会显示红色错误框和转换后的源码。切换 `--fast` 模式可快速排查——浏览器控制台有详细 Mermaid 错误信息。

---

**Q: Claude Code 技能安装后在哪里触发？**

在 Claude Code 对话中说出触发词即可，例如：
- "检查这个 markdown 的飞书兼容性"
- "预览 docs/diagram.md"
- "把这个文档同步到飞书"

技能定义文件在 `~/.claude/skills/feishu-preview/SKILL.md`，可手动编辑触发词。

---

**Q: 工具会修改我的源文件吗？**

不会，除非显式传 `-w`。`check` 只读，`convert` 默认输出到新文件。

---

**Q: 推送后想更新图表怎么操作？**

修改本地 `.md` → `feishu-preview check` → `feishu-preview convert -w` → `feishu-preview preview` 确认 → 在 Claude Code 中说"同步到飞书"。

**永远不要在飞书 Whiteboard 编辑器里直接改 Mermaid 内容**——无法导出回源码。

---

## License

MIT
