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
5. Do not use `overwrite` mode on the whole document — it destroys blocks other than the target
6. Do not skip the preview step before syncing
7. Do not hand-edit Mermaid code in `.md` files to work around compatibility — run `convert` instead

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
