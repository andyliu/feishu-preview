---
name: feishu-preview
description: >
  飞书 Mermaid 图表全流程 Claude Code 技能：
  编写图表后检查飞书兼容性并自动修正、精确本地预览（whiteboard-cli PNG，与飞书渲染一致），
  以及通过 lark-cli 同步到飞书文档。
  覆盖完整生命周期：写图表 → 检查 → 修正 → 预览 → 同步。
  前置要求：npm install -g feishu-preview
triggers:
  - 写 mermaid
  - 编写图表
  - 添加图表
  - 更新图表
  - 画流程图
  - 画时序图
  - 保存文档
  - 检查兼容性
  - 检查飞书
  - 预览文档
  - 预览 markdown
  - 飞书预览
  - 同步到飞书
  - 更新飞书图表
  - 推送飞书
  - 飞书文档更新
---

# feishu-preview Skill

## 一、整体工作流

```
编写/修改 Mermaid 图表
    │
    ├─── [检查] → feishu-preview check  → 报告飞书不兼容语法
    ├─── [修正] → feishu-preview convert -w → 原地修正源文件
    │
    ├─── [预览] → feishu-preview preview → .preview.html → 浏览器打开
    │                （精确模式：whiteboard-cli PNG，与飞书效果一致）
    │                （快速模式：--fast，Mermaid CDN 交互 SVG）
    │
    └─── [同步] → lark-cli（主）/ feishu-mcp（辅）→ 飞书文档
                   +whiteboard-update --overwrite（有 token）
                   或 +update overwrite 写全文（首次）
```

**核心原则：飞书文档是只读展示层，本地 .md 是唯一可编辑源。**

---

## 二、目录约定

```
docs/
└── diagrams/
    ├── device-keygen.md        # 源文件（含 Mermaid）
    ├── device-keygen.preview.html  # 自动生成的预览（git ignore）
    └── .feishu-index.json      # 记录飞书文档 URL 和 block 位置
```

`.feishu-index.json` 格式：
```json
{
  "device-keygen.md": {
    "doc_url": "https://your-org.feishu.cn/docx/Xxxxx",
    "diagram_title": "## 设备注册时序",
    "whiteboard_token": "S3xxxxxxxxxx",
    "last_synced": "2026-04-20T10:00:00Z"
  }
}
```

> `diagram_title` 是紧邻 Mermaid 图表前的标题行（用于 `--selection-by-title` 定位）。
> `whiteboard_token` 是 `+fetch` 返回 JSON 中 whiteboard block 的 token（首次同步后记录）。

---

## 三、本地预览（文字 + 图表整体预览）

> **🔴 强制规则：预览必须且只能通过以下命令完成。**
> **严禁自行生成任何 HTML 文件、严禁内嵌 Mermaid.js CDN、严禁使用任何其他渲染方式。**
> `feishu-preview` 是全局安装的 npm 命令，在任何工程目录下均可直接调用。

```bash
# 唯一正确的预览命令 — 使用飞书官方 whiteboard-cli 渲染为 PNG
feishu-preview preview <file>.md
```

输出：与飞书完全一致的本地 HTML（图表为 whiteboard-cli 生成的 PNG，非 Mermaid SVG）。

**⚠️ `--fast` 仅限语法调试，不得用于展示给用户的最终预览：**

```bash
# 仅在 Mermaid 语法报错时使用，帮助在浏览器控制台查看错误
feishu-preview preview <file>.md --fast
```

---

## 四、飞书兼容性转换规则

在同步前必须执行，确保代码在飞书不报错：

| 问题 | 转换规则 |
|---|---|
| `<br/>` 换行 | → `<br>`（飞书用裸 br） |
| 多行 blockquote `> l1\n> l2` | → 单行 `> l1<br>l2`（飞书解析器直接拼接多行，句子粘连） |
| Note 内英文双引号 `"` | → 删除（飞书解析器将 `"` 视为字符串定界符） |
| Note / 标签内裸 `<` 符号 | → `＜`（全角，飞书解析器不支持 HTML 实体 `&lt;`） |
| `stateDiagram-v2` | → `stateDiagram`（飞书 v8 不支持 v2 关键字） |
| 节点标签内英文双引号 `A["text"]` | **保持不变**（飞书接受双引号；单引号 `['text']` 反而报 `PS` token 错误） |
| v10+ 新语法（architecture-beta 等）| → 改写为等价 v8 语法 |
| 源文件 H1 标题 | 推送时用 `--title` 传入，正文不含 H1（飞书把 H1 变文档名） |

```bash
# 转换并输出到新文件（不修改源文件）
feishu-preview convert docs/diagrams/device-keygen.md -o /tmp/device-keygen-feishu.md
# 或直接调用
node feishu-compat.js docs/diagrams/device-keygen.md -o /tmp/device-keygen-feishu.md

# 原地转换（谨慎！会覆盖源文件）
node feishu-compat.js docs/diagrams/device-keygen.md -w
```

---

## 五、同步到飞书（主：lark-cli）

### 5.1 查询文档当前状态

```bash
# 获取文档内容（JSON 格式），查看 block 结构和 whiteboard token
lark-cli docs +fetch --doc "https://your-org.feishu.cn/docx/Xxxxx" --format json \
  | jq '.blocks[] | {index: .index, block_id: .block_id, type: .block_type}'

# 提取 whiteboard token（首次同步时用于记录到 .feishu-index.json）
lark-cli docs +fetch --doc "https://your-org.feishu.cn/docx/Xxxxx" --format json \
  | jq '.blocks[] | select(.block_type == "whiteboard") | .whiteboard_token'
```

### 5.2 首次插入 Mermaid 图表

**Mermaid 代码块推送后飞书会自动转为 Whiteboard block（不可逆）。**

```bash
# Step 1: 在指定标题后面插入 mermaid 代码块
# 飞书会自动将 ```mermaid...``` 转换为 whiteboard block
MERMAID_CONTENT=$(node feishu-compat.js docs/diagrams/device-keygen.md \
  | awk '/```mermaid/{found=1} found{print} /^```$/{if(found) exit}')

lark-cli docs +update \
  --doc "https://your-org.feishu.cn/docx/Xxxxx" \
  --mode insert_after \
  --selection-by-title "## 设备注册时序" \
  --markdown "$MERMAID_CONTENT" \
  --dry-run   # 先用 dry-run 确认

# 确认无误后去掉 --dry-run 执行
lark-cli docs +update \
  --doc "https://your-org.feishu.cn/docx/Xxxxx" \
  --mode insert_after \
  --selection-by-title "## 设备注册时序" \
  --markdown "$MERMAID_CONTENT"

# Step 2: 用 +fetch 获取新生成 whiteboard 的 token，记录到 .feishu-index.json
lark-cli docs +fetch --doc "https://your-org.feishu.cn/docx/Xxxxx" --format json \
  | jq '.blocks[] | select(.block_type == "whiteboard") | .whiteboard_token'
```

### 5.3 迭代更新（推荐：直接更新 Whiteboard DSL）

**推荐方案：已有 whiteboard_token 时，直接用 `+whiteboard-update` 更新内容，无需删旧建新。**

```bash
DOC_URL="https://your-org.feishu.cn/docx/Xxxxx"
WB_TOKEN="S3xxxxxxxxxx"   # 从 .feishu-index.json 读取

# 生成飞书兼容的 Mermaid 代码
node feishu-compat.js docs/diagrams/device-keygen.md \
  | awk '/```mermaid/{p=1;next} /^```$/{if(p)exit} p' \
  > /tmp/mermaid-code.txt

# 用 whiteboard DSL 更新（需要 lark-whiteboard skill 了解 DSL 格式）
# 注意：+whiteboard-update 从 stdin 读取 DSL，--overwrite 会清空旧内容
cat /tmp/mermaid-code.txt | lark-cli docs +whiteboard-update \
  --whiteboard-token "$WB_TOKEN" \
  --overwrite \
  --dry-run

# 确认后去掉 --dry-run 执行，--yes 跳过高风险确认提示
cat /tmp/mermaid-code.txt | lark-cli docs +whiteboard-update \
  --whiteboard-token "$WB_TOKEN" \
  --overwrite \
  --yes
```

### 5.4 迭代更新（备用：删旧建新）

当 whiteboard_token 未知或 `+whiteboard-update` 不适用时，使用删旧建新流程。

```bash
DOC_URL="https://your-org.feishu.cn/docx/Xxxxx"

# Step 1: 删除旧 whiteboard block（用 delete_range 定位内容范围）
lark-cli docs +update \
  --doc "$DOC_URL" \
  --mode delete_range \
  --selection-with-ellipsis "设备注册时序...（下一个章节标题的前几个字）" \
  --dry-run

# 确认后去掉 --dry-run 执行
lark-cli docs +update \
  --doc "$DOC_URL" \
  --mode delete_range \
  --selection-with-ellipsis "设备注册时序...下一节"

# Step 2: 在原位置插入新 mermaid 代码块
lark-cli docs +update \
  --doc "$DOC_URL" \
  --mode insert_after \
  --selection-by-title "## 设备注册时序" \
  --markdown "$MERMAID_CONTENT"

# Step 3: 用 +fetch 获取新 whiteboard token，更新 .feishu-index.json
lark-cli docs +fetch --doc "$DOC_URL" --format json \
  | jq '.blocks[] | select(.block_type == "whiteboard") | .whiteboard_token'
```

---

## 六、同步到飞书（辅：feishu-mcp）

当 lark-cli 命令不可用或需要更细粒度控制时使用 feishu-mcp 工具（Claude Code 自动调用）。

- `mcp__feishu__fetch-doc` — 读取文档内容
- `mcp__feishu__update-doc` — 更新文档内容
- `mcp__feishu__create-doc` — 创建新文档

---

## 七、完整执行流程（AI Agent 标准步骤）

本 skill 覆盖三个入口，可单独调用，也可顺序贯穿：

---

### 入口 A：编写 / 修改 Mermaid 图表后

当用户在 markdown 文件中新增或修改了 Mermaid 代码块，完成编写后执行：

```
1. 检查飞书兼容性
   feishu-preview check <file>.md
   → 若无问题：报告 ✅，结束（或继续到入口 B）
   → 若有问题：列出具体问题，询问用户：
     "发现 X 处飞书不兼容语法（如上）。是否自动修正源文件？（默认：否）"

2. 若用户同意修正：
   feishu-preview convert <file>.md -w
   → 打印修改摘要

3. 询问是否预览：
   "是否生成本地预览？（默认：否）"
   → 用户同意 → 进入入口 B
```

---

### 入口 B：预览本地文档

当用户说「预览」「看看效果」「生成 HTML」时：

```
1. 生成预览
   feishu-preview preview <file>.md        # 精确模式（默认，与飞书一致）
   feishu-preview preview <file>.md --fast # 快速模式（CDN，即时交互）

   ⛔ 【强制暂停】预览打开后询问：
      "预览已在浏览器打开。是否同步到飞书文档？（默认：否）"
   → 等待用户明确回复。用户回复「否」或不回复 → 流程结束。
   → 用户同意 → 进入入口 C
```

---

### 入口 C：同步到飞书

当用户说「同步到飞书」「推送飞书」，或在入口 B 确认同步后执行：

```
1. 读取 .feishu-index.json 中 whiteboards 记录

2. 飞书兼容性转换
   feishu-preview convert <file>.md -o /tmp/<file>-feishu.md

3. 同步所有图表
   - 若 whiteboards 有记录（迭代更新）：
     对每个图表执行：
       cat <mermaid-code> | lark-cli docs +whiteboard-update \
         --whiteboard-token <token> --overwrite --yes
   - 若无记录（首次同步）：
     先 docs +update --mode overwrite 写入全文（含 <whiteboard type="blank"> 占位符）
     再对每个图表执行 +whiteboard-update --yes
     记录返回的 board_tokens

4. 更新 .feishu-index.json（whiteboard tokens、last_synced）

5. 汇报结果（飞书文档链接）
```

---

## 八、统一入口：sync.js

```bash
# 预览本地文档（文字 + Mermaid 图表）
feishu-preview preview docs/diagrams/device-keygen.md

# 转换为飞书兼容格式（输出摘要 + 写文件）
feishu-preview convert docs/diagrams/device-keygen.md [-o output.md]

# 查看同步状态（读取 .feishu-index.json）
feishu-preview status docs/diagrams/device-keygen.md

# 完整推送流程（含 dry-run 确认）
feishu-preview push docs/diagrams/device-keygen.md \
  --doc-url "https://your-org.feishu.cn/docx/Xxxxx"
```

---

## 九、禁止操作

**预览相关（最高优先级）：**
- 🔴 **不得自行生成任何 HTML 预览文件** — 无论任何情况，必须调用 `feishu-preview preview <file>` 命令
- 🔴 **不得在生成的 HTML 中内嵌 Mermaid.js CDN** — 图表必须由 whiteboard-cli 渲染为 PNG
- 🔴 **不得使用 `--fast` 标志生成展示给用户的最终预览** — `--fast` 仅限语法调试
- 不得使用任何其他 Markdown 预览工具替代 `feishu-preview preview`

**同步相关：**
- 不得直接通过飞书 API 修改 Whiteboard block 内容（用 `+whiteboard-update` 或删旧建新）
- 不得使用 `overwrite` 模式覆盖整篇文档（会破坏其他 block）
- 不得跳过预览步骤直接同步
- 不得修改源 `.md` 文件的 Mermaid 代码以适应飞书（转换在临时文件进行）

---

## 十、lark-cli docs 命令速查

| 命令 | 说明 |
|---|---|
| `docs +fetch --doc <url>` | 读取文档内容（JSON / pretty / table） |
| `docs +update --doc <url> --mode append` | 在文档末尾追加内容 |
| `docs +update --mode insert_after --selection-by-title "## Title"` | 在标题后插入 |
| `docs +update --mode insert_before --selection-by-title "## Title"` | 在标题前插入 |
| `docs +update --mode delete_range --selection-with-ellipsis "start...end"` | 删除内容范围 |
| `docs +update --mode replace_range --selection-with-ellipsis "..."` | 替换内容范围 |
| `docs +update --mode overwrite` | 覆盖整个文档（危险！） |
| `docs +whiteboard-update --whiteboard-token <token>` | 直接更新 whiteboard DSL（stdin 输入） |
| `docs +search --query "关键词"` | 搜索文档 |
| `docs +create --title "标题" --markdown @file.md` | 创建新文档 |

---

## 十一、常见问题排查

**Q: 预览里图表不渲染**
→ 检查 Mermaid 代码语法，在 [mermaid.live](https://mermaid.live) 验证

**Q: 飞书里 Note 换行不生效**
→ 确认使用了 `<br>` 而不是 `<br/>`，feishu-compat.js 会自动处理

**Q: lark-cli 返回 Permission denied**
→ 执行 `lark-cli auth login` 重新授权，确认 scope 包含 `docx:document:write`

**Q: `+whiteboard-update` 报错**
→ 确认 whiteboard_token 正确；DSL 格式需参考 lark-whiteboard skill

**Q: `+fetch` 输出的 block 结构不含 whiteboard_token**
→ 尝试 `jq '.'` 查看完整结构，whiteboard token 可能在 `block_data` 或 `whiteboard` 字段内

**Q: 飞书报 Parse error**
→ Note 内有英文双引号或裸 `<` 符号，运行 `node feishu-compat.js` 转换后再推送
