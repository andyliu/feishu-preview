#!/usr/bin/env node
/**
 * feishu-compat.js
 * Converts standard Mermaid syntax to Feishu-compatible format.
 *
 * Usage:
 *   node feishu-compat.js input.md              → stdout
 *   node feishu-compat.js input.md --check      → report issues (read-only, exit 1 if found)
 *   node feishu-compat.js input.md -w           → overwrite source file in-place
 *   node feishu-compat.js input.md -o out.md    → write to new file
 */

const fs = require('fs');

const args = process.argv.slice(2);
const inputFile = args[0];
const writeInPlace = args.includes('-w');
const checkOnly = args.includes('--check');
const outIdx = args.indexOf('-o');
const outputFile = outIdx !== -1 ? args[outIdx + 1] : null;

if (!inputFile) {
  console.error('Usage: node feishu-compat.js <input.md> [--check] [-w] [-o output.md]');
  process.exit(1);
}

const content = fs.readFileSync(inputFile, 'utf-8');
const changes = [];

function convertMermaidBlock(code, blockIndex) {
  let result = code;

  // 1. <br/> → <br>  (Feishu parser rejects XML self-closing tags)
  const brCount = (result.match(/<br\/>/gi) || []).length;
  result = result.replace(/<br\/>/gi, '<br>');
  if (brCount > 0) changes.push(`  block${blockIndex}: ${brCount}x <br/> → <br>`);

  // 2. stateDiagram-v2 → stateDiagram  (Feishu v8 engine does not support v2 keyword)
  if (/^stateDiagram-v2$/m.test(result)) {
    result = result.replace(/^stateDiagram-v2$/gm, 'stateDiagram');
    changes.push(`  block${blockIndex}: stateDiagram-v2 → stateDiagram`);
  }

  // 3. Note lines: remove double-quotes, replace bare < with fullwidth ＜
  //    Matches: Note over A,B: text  /  Note left of A: text  /  Note right of A: text
  //    Feishu's parser does not support HTML entities — &lt; triggers INVALID token.
  //    Must use fullwidth ＜ (U+FF1C) instead.
  result = result.replace(
    /(Note\s+(?:over|left\s+of|right\s+of)\s+[^:\n]+:[^\n]*)/g,
    (line) => {
      let out = line.replace(/"/g, '');
      // Replace bare < (excluding <br> tags) with fullwidth ＜
      out = out.replace(/(<)(?!br[ >\/])/gi, '＜');
      if (out !== line) changes.push(`  block${blockIndex}: Note line fixed: ${line.trim().slice(0, 60)}`);
      return out;
    }
  );

  // 4. Node label double-quotes A["text"]: leave unchanged.
  //    Feishu accepts double-quotes in node labels.
  //    Single-quotes A['text'] trigger a 'PS' token parse error — do NOT convert.

  // 5. Other label lines (participant, actor, classDef, etc.): replace bare < with ＜
  result = result.replace(
    /^(participant|actor|classDef|style|linkStyle|click)\s+.*/gm,
    (line) => line.replace(/(<)(?!br[ >\/])/gi, '＜')
  );

  return result;
}

let blockIndex = 0;
let converted = content.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
  const idx = blockIndex++;
  return '```mermaid\n' + convertMermaidBlock(code, idx) + '```';
});

// Document-level conversion (after Mermaid block processing)

// 6. Multi-line blockquotes: merge into single line with <br> separator.
//    Feishu's parser concatenates consecutive > lines without any separator,
//    causing adjacent words to run together.
converted = converted.replace(
  /(^>[^\n]*\n)((?:>[^\n]*\n?)+)/gm,
  (match) => {
    const lines = match.split('\n').filter(l => l.trim() !== '');
    if (lines.length <= 1) return match;
    const joined = lines.map(l => l.replace(/^>\s?/, '')).join('<br>');
    changes.push(`  doc-level: multi-line blockquote merged (${lines.length} lines) → single line + <br>`);
    return '> ' + joined + '\n';
  }
);

// Output
if (checkOnly) {
  if (changes.length === 0) {
    console.log('✅ Feishu compatibility check passed — no changes needed');
  } else {
    console.log(`⚠️  Found ${changes.length} Feishu-incompatible syntax issue(s):`);
    changes.forEach(c => console.log(c));
    console.log('\nTo auto-fix, run:');
    console.log(`  feishu-preview convert "${inputFile}" -w`);
    process.exit(1);
  }
} else if (writeInPlace) {
  fs.writeFileSync(inputFile, converted, 'utf-8');
  printSummary(inputFile);
} else if (outputFile) {
  fs.writeFileSync(outputFile, converted, 'utf-8');
  printSummary(outputFile);
} else {
  process.stdout.write(converted);
}

function printSummary(dest) {
  if (changes.length === 0) {
    console.error(`✅ No changes needed → ${dest}`);
  } else {
    console.error(`✅ Converted (${changes.length} change(s)) → ${dest}`);
    changes.forEach(c => console.error(c));
  }
}
