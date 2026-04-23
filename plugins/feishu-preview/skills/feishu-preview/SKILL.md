---
name: feishu-preview
description: >
  Full Mermaid-in-Feishu workflow for Claude Code:
  Check Feishu compatibility, auto-fix incompatible syntax, accurate local preview using
  Feishu's own whiteboard-cli engine (pixel-accurate PNG), and sync to Feishu documents
  via lark-cli. Covers the complete lifecycle: write → check → fix → preview → sync.
  Prerequisite: npm install -g feishu-preview  OR  Claude Code plugin installed.
triggers:
  - write mermaid
  - add diagram
  - edit diagram
  - update diagram
  - draw flowchart
  - draw sequence diagram
  - draw state diagram
  - generate diagram
  - describe diagram
  - create diagram from description
  - check feishu compatibility
  - feishu preview
  - preview markdown
  - preview document
  - sync to feishu
  - push to feishu
  - update feishu diagram
  - 写 mermaid
  - 编写图表
  - 添加图表
  - 更新图表
  - 画流程图
  - 画时序图
  - 帮我画
  - 画一个图
  - 生成图表
  - 检查飞书兼容性
  - 预览文档
  - 预览 markdown
  - 同步到飞书
  - 推送飞书
---

# feishu-preview Skill

## Why This Skill Exists

Feishu (Lark) uses Mermaid rendering engine v8. Standard Mermaid is v10+.
Diagrams that render perfectly in VS Code, mermaid.live, or GitHub will silently break in Feishu.

This skill provides the complete fix pipeline: detect incompatible syntax before it reaches Feishu,
auto-correct it, preview using Feishu's exact rendering engine, and sync.

**Core rule: the local `.md` file is the single source of truth. Feishu documents are display-only.**
**Never edit Mermaid content directly in Feishu's Whiteboard editor — there is no way to export it back.**

---

## ⛔ CRITICAL PROHIBITIONS — READ BEFORE ANYTHING ELSE

These rules have the highest priority and override all other considerations.

### Preview — NEVER do these:
1. 🔴 **NEVER self-generate any HTML preview file** — always use `feishu-preview preview <file>`
2. 🔴 **NEVER embed Mermaid.js CDN in HTML** — diagrams MUST be PNG rendered by whiteboard-cli
3. 🔴 **NEVER use `--fast` for the final preview shown to the user** — it uses Mermaid.js v10, not Feishu's engine
4. 🔴 **NEVER substitute another Markdown preview tool** for `feishu-preview preview`

### Sync — do not do these:
5. 🔴 **NEVER use `replace_all` mode** — triggers full document re-render; every whiteboard token is invalidated and all diagrams disappear, even if only one character changed
6. 🔴 **NEVER use `replace_range` across a whiteboard block** — if the selection range includes a rendered whiteboard, it will be deleted
7. Do not use `overwrite` mode unless rebuilding the entire document from scratch (all whiteboards lost; must re-insert all diagrams)
8. Do not skip the preview step before syncing
9. Do not hand-edit Mermaid code in `.md` files to work around compatibility — run `convert` instead

---

## Full Workflow

```
Write/Edit Mermaid in .md file
    │
    ├── CHECK   → feishu-preview check <file>.md
    │             read-only; exit 1 = incompatible syntax found
    │
    ├── FIX     → feishu-preview convert <file>.md -w
    │             auto-corrects all known Feishu incompatibilities in-place
    │
    ├── PREVIEW → feishu-preview preview <file>.md          ← ACCURATE MODE ONLY
    │             whiteboard-cli renders each diagram as PNG (Feishu's own engine)
    │             output: <file>.preview.html with base64 PNG diagrams
    │
    └── SYNC    → lark-cli (primary) or feishu-mcp (fallback)
                  iterative update via +whiteboard-update if tokens are known
                  first-time: insert mermaid block → Feishu auto-converts to whiteboard
```

---

## Entry Point 0 — Generate Diagram from Natural Language

Triggered when: user describes a diagram in plain language and there is no existing Mermaid code to edit.
("画一个 X 的流程图", "draw a sequence diagram showing Y", "help me visualize Z")

```
1. Identify target file
   - If user specifies a file: use it
   - If not: ask "Which file should I write this into?" before proceeding

2. Write Mermaid code directly into the file (Edit or Write tool)
   Guidelines for Feishu-compatible output from the start:
   - Use stateDiagram (not stateDiagram-v2)
   - Use <br> (not <br/>) for line breaks in notes
   - Use ＜ (U+FF1C fullwidth) instead of < inside Note blocks
   - Remove double-quotes from Note text (they break Feishu's parser)
   - Do not use v10+ syntax (architecture-beta, etc.)

3. Run: feishu-preview check <file>.md
   → ✅ No issues: "Diagram written, Feishu-compatible." Done.
   → ⚠️ Issues found: DO NOT blindly run `convert -w`.
     Instead, apply reasoning:
     - Read the exact incompatible construct(s) reported
     - Understand why each is incompatible (see Compatibility Rules)
     - Edit the Mermaid block directly with corrected syntax
     - Re-run `feishu-preview check` to verify the fix
     This produces cleaner fixes than mechanical rule substitution.

4. Ask: "Diagram written and verified. Preview? (default: no)"
   If yes → Entry B.
```

---

## Entry Point A — After Writing or Editing Mermaid

Triggered when: user creates or modifies a Mermaid code block in any Markdown file.

```
1. Check Feishu compatibility
   feishu-preview check <file>.md

   → ✅ No issues: report result, done (optionally continue to Entry B)
   → ⚠️ Issues found: list each issue, then ask:
     "Found N Feishu-incompatible syntax issues (listed above). Auto-fix source file? (default: no)"

2. If user agrees to fix:
   feishu-preview convert <file>.md -w
   Print the change summary.

3. Ask whether to preview:
   "Generate local preview? (default: no)"
   If yes → continue to Entry B.
```

---

## Entry Point B — Preview Local Document

Triggered when: user says "preview", "check the result", "generate HTML", or similar.

```
1. Run:
   feishu-preview preview <file>.md        ← accurate mode (default, matches Feishu)
   feishu-preview preview <file>.md --fast ← syntax debugging only, NOT for final preview

⛔ MANDATORY PAUSE after preview opens:
   "Preview opened in browser. Sync to Feishu document? (default: no)"
   Wait for explicit user confirmation. If no/silent → end.
   If yes → continue to Entry C.
```

---

## Entry Point C — Sync to Feishu

Triggered when: user says "sync to Feishu", "push to Feishu", or confirms after Entry B.

```
1. Read .feishu-index.json
   feishu-preview status <file>.md

2. Convert to Feishu-compatible format (do not modify source file)
   feishu-preview convert <file>.md -o /tmp/<basename>-feishu.md

3. Sync diagrams:

   If whiteboard tokens are known (iterative update — preferred):
     For each diagram section:
       feishu-preview convert <file>.md \
         | awk '/```mermaid/{p=1;next} /^```$/{if(p)exit} p' \
         | lark-cli docs +whiteboard-update \
             --whiteboard-token <token> \
             --overwrite \
             --dry-run    ← always dry-run first
       # After confirming: remove --dry-run, add --yes

   If no tokens exist (first-time sync):
     Option A: Insert mermaid block after target heading
       lark-cli docs +update --doc <url> --mode insert_after \
         --selection-by-title "## Heading" \
         --markdown "$MERMAID_CONTENT" --dry-run
     Option B: Overwrite full document with whiteboard placeholders
       (use <whiteboard type="blank"></whiteboard> as placeholder per diagram)
     Then: fetch new whiteboard tokens via +fetch, save to .feishu-index.json

4. Update .feishu-index.json with whiteboard tokens and last_synced timestamp

5. Report result with Feishu document link
```

---

## Feishu Document Safety Rules

### lark-cli Operation Safety Hierarchy

From safest to most dangerous:

| Mode | Safety | Use When |
|---|---|---|
| `insert_before` / `insert_after` | ✅ Safest | Adding content near a heading — never touches existing blocks |
| `replace_range` (precise) | ⚠️ Safe if range excludes whiteboards | Editing text-only sections |
| `delete_range` | ⚠️ Safe if range excludes whiteboards | Removing text-only sections |
| `replace_all` | 🔴 **FORBIDDEN** | Never — destroys all whiteboard tokens |
| `overwrite` | 🔴 Destructive | Only when rebuilding entire document; all whiteboards lost |

### Why `replace_all` Destroys Diagrams

When `replace_all` is used (even to change a single character), Feishu triggers a full document re-render. All whiteboard blocks — which are rendered from the original Mermaid code — lose their token references. The diagrams visually disappear from the document. Recovery requires re-inserting every Mermaid code block from scratch.

### Safe `replace_range` Usage

Before using `replace_range`:
1. Run `lark-cli docs +fetch --doc <url> --format json` to inspect block positions
2. Confirm the selection range (`--selection-with-ellipsis "start...end"`) does NOT span any whiteboard block
3. Always use `--dry-run` first

### Whiteboard Recovery (if diagrams are lost)

If a whiteboard was destroyed (by `replace_all` or bad `replace_range`):
```bash
# Re-insert the mermaid code block before the section heading
# Feishu will re-render it as a new whiteboard block
lark-cli docs +update --doc <url> --mode insert_before \
  --selection-by-title "## Section Heading" \
  --markdown "$MERMAID_CONTENT" --dry-run
# After confirming: remove --dry-run
# Then fetch the new whiteboard token and update .feishu-index.json
```

### Document Format Conventions

These conventions apply when writing content that will be synced to Feishu:

- **Diagram callout**: every diagram must have a summary callout block (before or after the diagram)
- **Note block steps**: format as `1. 中文描述: pseudocode(params)` — e.g., `1. 派生会话密钥: HKDF(euid, "info", sn, 32)`
- **Step numbering**: use regular digits `1. 2. 3.` — do NOT use circled digits `①②③`
- **Phase numbering**: use Chinese numerals `阶段一、阶段二` — do NOT use `阶段1、阶段2`
- **Heading attributes**: do NOT write `{folded="true"}` or any `{...}` attributes in headings — Feishu may render them as literal text

---

## Feishu Callout Syntax

Feishu callout blocks (高亮提示块) are not standard Markdown. `lark-cli docs +update` supports two syntaxes:

### Option A — Standard `>` blockquote (auto-converted)

```markdown
> This text will be auto-converted to a Feishu callout by lark-cli.
```

Converts to a callout with `emoji="glass_of_milk"` + `background-color="light-orange"`. **Emoji and color cannot be controlled.**

### Option B — Explicit `<callout>` tag (recommended)

```html
<callout emoji="bulb" background-color="light-blue">
Content here. Supports **bold**, `code`, [links](url).

- Lists work
- Blank line = new paragraph inside callout
</callout>
```

### Callout Attributes

| Attribute | Required | Notes |
|---|---|---|
| `emoji` | No | Short code (see table below). Invalid code falls back to `gift` 🎁 |
| `background-color` | No | See color table below |
| `border-color` | No | Feishu ignores this — automatically matches background-color. Can omit. |

### Available Colors

| Value | Color | Use For |
|---|---|---|
| `light-orange` | Orange | Overview / document positioning |
| `light-blue` | Blue | Info / tips / explanations |
| `light-yellow` | Yellow | Warnings / cautions |
| `light-green` | Green | Security / verification / success |
| `light-purple` | Purple | References / citations |
| `light-red` | Red | Danger / prohibitions |
| `light-grey` | Grey | General / neutral |

### Verified Emoji Short Codes

| Code | Emoji | Use For |
|---|---|---|
| `glass_of_milk` | 🥛 | General / document overview |
| `bulb` | 💡 | Tips / explanations |
| `heart` | ❤️ | Purpose / importance |
| `star` | ⭐ | Highlights / features |
| `memo` | 📝 | Summary / spec |
| `pushpin` | 📌 | References |
| `rocket` | 🚀 | Performance / optimization |
| `lock` | 🔒 | Security / encryption |
| `fire` | 🔥 | Critical / urgent |

**Known broken codes** (fall back to 🎁): `warning`, `check_mark`, `exclamation`

### Callout Rules

- Do not nest callouts inside callouts — Feishu does not support this
- Use blank lines to create new paragraphs inside a callout
- Use `<br>` (not `<br/>`) for inline line breaks inside a callout
- `lark-cli docs +fetch` returns callouts in `<callout>` tag format
- `border-color` can always be omitted

---

## Compatibility Rules Reference

Applied automatically by `check` and `convert`. Listed here for understanding:

| Issue | Standard Mermaid | Feishu Requires | Reason |
|---|---|---|---|
| Line break | `<br/>` | `<br>` | Parser rejects XML self-closing tags |
| Less-than in Note | `x < 300ms` | `x ＜ 300ms` (fullwidth U+FF1C) | Parser treats `<` as HTML tag; `&lt;` is also broken |
| State diagram version | `stateDiagram-v2` | `stateDiagram` | Feishu supports v8 layout engine only |
| Multi-line blockquote | `> line1\n> line2` | `> line1<br>line2` | Parser concatenates `>` lines without separator |
| Node double-quotes | `A["text"]` | unchanged | Feishu accepts double-quotes; single-quotes trigger `PS` token error |
| v10+ syntax | `architecture-beta` etc. | rewrite to v8 equivalent | Engine is v8 |

---

## Preview Mode Details

| Mode | Command | Engine | When to Use |
|---|---|---|---|
| **Accurate** (default) | `feishu-preview preview <file>` | `@larksuite/whiteboard-cli` → PNG | **Always — final verification before sync** |
| **Fast** (debug only) | `feishu-preview preview <file> --fast` | Mermaid.js v10 CDN → SVG | Only when diagrams fail to render in accurate mode and you need browser console error details |

Accurate mode: first run requires internet (downloads whiteboard-cli once). PNGs are base64-embedded — output is offline-shareable.

---

## .feishu-index.json Format

Created in the same directory as the `.md` file. Tracks doc URL and whiteboard tokens.
**Git-ignored — do not commit.**

```json
{
  "my-diagram.md": {
    "doc_url": "https://your-org.feishu.cn/docx/Xxxxx",
    "last_synced": "2026-04-20T10:00:00Z",
    "whiteboards": {
      "## Section 2.1 Registration Sequence": "FY0FwuSKShMWuZbMjX0czKk6nLh",
      "## Section 3.1 Encryption Flowchart": "ARJXwDxhchVthfblGrCcH5jmnfc"
    }
  }
}
```

Keys in `whiteboards` are the heading text immediately before each Mermaid block.
Values are whiteboard tokens from `lark-cli docs +fetch --format json`.

---

## lark-cli Quick Reference

| Command | Description |
|---|---|
| `docs +fetch --doc <url> --format json` | Read document as JSON (blocks + tokens) |
| `docs +fetch --doc <url>` | Read document as formatted text |
| `docs +update --doc <url> --mode append --markdown "..."` | Append to end of document |
| `docs +update --mode insert_after --selection-by-title "## H" --markdown "..."` | Insert after heading |
| `docs +update --mode insert_before --selection-by-title "## H" --markdown "..."` | Insert before heading |
| `docs +update --mode delete_range --selection-with-ellipsis "start...end"` | Delete content range |
| `docs +update --mode replace_range --selection-with-ellipsis "..."` | Replace content range |
| `docs +whiteboard-update --whiteboard-token <token> --overwrite` | Update whiteboard (stdin DSL) |
| `docs +search --query "keyword"` | Search documents |
| `docs +create --title "Title" --markdown @file.md` | Create new document |

**Always use `--dry-run` first. Use `--yes` to skip confirmation on destructive operations.**

**Feishu MCP fallback** (when lark-cli is unavailable):
- `mcp__feishu__fetch-doc` — read document
- `mcp__feishu__update-doc` — update document
- `mcp__feishu__create-doc` — create document

---

## Error Recovery — Reasoning-Based Repair

When `feishu-preview check` or `whiteboard-cli` reports an error, use reasoning first before
falling back to mechanical conversion. This produces cleaner results for edge cases.

### When `feishu-preview check` reports issues

**Before running `convert -w`**, ask: "Can I understand exactly what's wrong and fix it precisely?"

```
1. Read the reported incompatible construct (line number, type)
2. Look up the Compatibility Rules table above
3. Apply minimal targeted edit to the Mermaid block (Edit tool)
4. Re-run: feishu-preview check <file>.md
5. If still failing after one reasoning attempt → fall back to: feishu-preview convert <file>.md -w
```

Why: `convert -w` applies all rules uniformly. For generated code that's almost correct,
a targeted edit avoids accidental changes to unrelated constructs.

### When accurate preview fails (blank diagram or error box)

```
1. Read whiteboard-cli stderr — it often identifies the exact line or construct
2. Cross-reference with the Compatibility Rules table
3. If the cause is identifiable: edit <file>.md to fix that specific construct
4. Re-run accurate preview: feishu-preview preview <file>.md
5. If cause is unclear: switch to fast mode for browser console details
   feishu-preview preview <file>.md --fast
   → Open browser console (F12) → Console tab → read the Mermaid parse error
   → Fix the source, then switch back to accurate mode to verify
```

### When lark-cli sync fails

```
1. Check if it's an auth issue: lark-cli auth login
2. Check if the whiteboard token is stale (document was recreated):
   lark-cli docs +fetch --doc <url> --format json | jq '.blocks[] | select(.block_type == "whiteboard")'
   Update .feishu-index.json with the new token.
3. Check if the Mermaid code has Feishu incompatibilities that slipped through:
   feishu-preview check <file>.md
```

---

## Troubleshooting

**Diagram blank or red error box in accurate mode?**
→ Debug with fast mode: `feishu-preview preview <file>.md --fast`
   Browser console shows detailed Mermaid parse errors. Fix, then switch back to accurate mode.

**Feishu shows Parse error after sync?**
→ Note block has unescaped `<` or `"`. Run `feishu-preview convert` before pushing.

**`lark-cli` returns Permission denied?**
→ Run `lark-cli auth login`. Ensure scope includes `docx:document:write`.

**`+whiteboard-update` fails?**
→ Confirm whiteboard_token is correct. Refer to lark-whiteboard skill for DSL format.

**`+fetch` output missing whiteboard_token?**
→ Run `jq '.'` to inspect full block structure. Token may be in `block_data.whiteboard_token`.

**Diagram looks different from preview?**
→ Only accurate mode (`feishu-preview preview` without `--fast`) matches Feishu exactly.
   Fast mode uses Mermaid.js v10 — visually different for some diagram types.

**`feishu-preview` command not found?**
→ Install via Claude Code plugin: `/plugin marketplace add andyliu/feishu-preview`
   Then run: `feishu-preview doctor` to set up all dependencies interactively.

**`lark-cli` not found or sync fails with "command not found"?**
→ Run `feishu-preview doctor` — it will detect missing dependencies and prompt to install them,
   including running `lark-cli auth login` for Feishu account authorization.
