---
name: feishu-mermaid-sync
description: >
  本地 Markdown 文档（含 Mermaid 图表）的完整预览、飞书兼容性转换，
  以及通过 lark-cli（主）/ feishu-mcp（辅）同步到飞书文档。
  支持文档整体预览（文字+图表）、图表迭代更新（删旧建新）。
  当用户需要预览本地文档、同步到飞书、更新飞书图表时触发。
triggers:
  - 预览文档
  - 预览 markdown
  - 同步到飞书
  - 更新飞书图表
  - 推送飞书
  - 飞书文档更新
---

# feishu-mermaid-sync Skill

## 一、整体工作流

```
本地 .md 文件（唯一事实来源）
    │
    ├─── [预览] → render-preview.js → .preview.html → 浏览器打开
    │
    ├─── [转换] → feishu-compat.js  → 飞书兼容版 .md
    │
    └─── [同步] → lark-cli（主）/ feishu-mcp（辅）→ 飞书文档
                   删除旧 block → 在原位置插入新 block
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

```bash
# 生成预览 HTML 并自动在浏览器打开
node sync.js preview docs/diagrams/device-keygen.md
# 或直接调用
node render-preview.js docs/diagrams/device-keygen.md

# 生成后文件在同目录: device-keygen.preview.html
```

**预览说明：**
- 文字部分：完整 Markdown 渲染（标题、列表、表格、代码块、加粗等）
- 图表部分：使用 Mermaid v9（CDN，不需要本地安装）渲染
- `<br>` 换行：预览脚本自动将飞书格式的 `<br>` 转为 `<br/>` 供浏览器渲染
- 预览效果 ≈ 飞书实际效果（v8/v9 差异极小，仅个别新语法）

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
node sync.js convert docs/diagrams/device-keygen.md -o /tmp/device-keygen-feishu.md
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

当用户说"同步文档到飞书"或"更新飞书图表"时，严格按以下顺序执行：

> **⚠️ 强制暂停规则**：步骤 2 完成后，AI **必须停下来等待用户明确指令**。
> 没有用户的显式确认，绝对不执行任何写入飞书的操作。

```
1. 读取源文件和 .feishu-index.json

2. 生成本地预览
   node sync.js preview <file>.md

   ⛔ 【强制暂停】预览打开后，询问用户：
      "预览已在浏览器打开。是否同步到飞书文档？（默认：否）"
   → 等待用户明确回复，不得自行继续。
   → 若用户回复「否」或不回复，流程结束。

3. 飞书兼容性转换（仅当用户明确同意同步后）
   node sync.js convert <file>.md -o /tmp/<file>-feishu.md

4. 同步所有图表到飞书
   - 若 .feishu-index.json 中有 whiteboards 记录：
     对每个图表执行 +whiteboard-update --overwrite --yes
   - 若无记录（首次同步）：
     先 docs +update --mode overwrite 写入全文（含空白 whiteboard 占位符）
     再对每个图表执行 +whiteboard-update --yes

5. 更新 .feishu-index.json（whiteboard tokens、last_synced）

6. 汇报结果（飞书文档链接）
```

---

## 八、统一入口：sync.js

```bash
# 预览本地文档（文字 + Mermaid 图表）
node sync.js preview docs/diagrams/device-keygen.md

# 转换为飞书兼容格式（输出摘要 + 写文件）
node sync.js convert docs/diagrams/device-keygen.md [-o output.md]

# 查看同步状态（读取 .feishu-index.json）
node sync.js status docs/diagrams/device-keygen.md

# 完整推送流程（含 dry-run 确认）
node sync.js push docs/diagrams/device-keygen.md \
  --doc-url "https://your-org.feishu.cn/docx/Xxxxx"
```

---

## 九、禁止操作

- 不得直接通过飞书 API 修改 Whiteboard block 内容（用 `+whiteboard-update` 或删旧建新）
- 不得使用 `overwrite` 模式覆盖整篇文档（会破坏其他 block）
- 不得跳过预览步骤直接同步
- 不得跳过 `--dry-run` 直接执行修改
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
