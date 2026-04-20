#!/usr/bin/env node
/**
 * feishu-compat.js
 * 将标准 Mermaid 代码转换为飞书兼容格式
 *
 * 使用方式:
 *   node feishu-compat.js input.md          → 输出到 stdout
 *   node feishu-compat.js input.md -w       → 原地写入（覆盖源文件）
 *   node feishu-compat.js input.md -o out.md → 写到指定文件
 */

const fs = require('fs');

const args = process.argv.slice(2);
const inputFile = args[0];
const writeInPlace = args.includes('-w');
const outIdx = args.indexOf('-o');
const outputFile = outIdx !== -1 ? args[outIdx + 1] : null;

if (!inputFile) {
  console.error('用法: node feishu-compat.js <input.md> [-w] [-o output.md]');
  process.exit(1);
}

const content = fs.readFileSync(inputFile, 'utf-8');
const changes = [];

function convertMermaidBlock(code, blockIndex) {
  let result = code;

  // 1. <br/> → <br>（飞书用裸 br，不加斜杠）
  const brCount = (result.match(/<br\/>/gi) || []).length;
  result = result.replace(/<br\/>/gi, '<br>');
  if (brCount > 0) changes.push(`  block${blockIndex}: ${brCount}处 <br/> → <br>`);

  // 2. stateDiagram-v2 → stateDiagram（飞书 v8 不支持 v2 关键字）
  if (/^stateDiagram-v2$/m.test(result)) {
    result = result.replace(/^stateDiagram-v2$/gm, 'stateDiagram');
    changes.push(`  block${blockIndex}: stateDiagram-v2 → stateDiagram`);
  }

  // 3. Note 行：去除英文双引号，用全角 ＜ 替代裸 <
  //    匹配: Note over A,B: text  /  Note left of A: text  /  Note right of A: text
  //    注意: 飞书 Mermaid 解析器不支持 HTML 实体（&lt; 会触发 INVALID token），
  //          必须用全角字符 ＜ (U+FF1C) 替代，而非 &lt;
  result = result.replace(
    /(Note\s+(?:over|left\s+of|right\s+of)\s+[^:\n]+:[^\n]*)/g,
    (line) => {
      let out = line.replace(/"/g, '');
      // 用全角 ＜ 替代裸 <（排除 <br> 标签）
      out = out.replace(/(<)(?!br[ >\/])/gi, '＜');
      if (out !== line) changes.push(`  block${blockIndex}: Note 行修正: ${line.trim().slice(0, 60)}`);
      return out;
    }
  );

  // 4. 节点标签双引号：保持不变
  //    实测结论：飞书解析器接受 A["text"] 原始双引号语法；
  //    若转为单引号 A['text'] 反而触发 'PS' token 错误，故不做转换。

  // 5. 其他标签文字行（participant alias、classDef label 等）中的裸 <
  //    飞书解析器不支持 HTML 实体，用全角 ＜ 替代
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

// 文档级转换（在 Mermaid block 处理后，对全文做）

// 6. 多行 blockquote 合并（飞书解析器把连续 > 行直接拼接，不加任何空格）
//    转换: 多行 > 合并为单行，行间加 <br>，避免句子粘连
converted = converted.replace(
  /(^>[^\n]*\n)((?:>[^\n]*\n?)+)/gm,
  (match) => {
    const lines = match.split('\n').filter(l => l.trim() !== '');
    if (lines.length <= 1) return match;
    // 取每行 > 后的内容，用 <br> 连接，输出为单行 blockquote
    const joined = lines.map(l => l.replace(/^>\s?/, '')).join('<br>');
    changes.push(`  文档级: 多行 blockquote 合并 (${lines.length}行) → 单行+<br>`);
    return '> ' + joined + '\n';
  }
);

// 输出
if (writeInPlace) {
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
    console.error(`✅ 无需修改 → ${dest}`);
  } else {
    console.error(`✅ 已转换 (${changes.length} 处修改) → ${dest}`);
    changes.forEach(c => console.error(c));
  }
}
