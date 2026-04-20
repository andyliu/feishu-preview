#!/usr/bin/env node
/**
 * sync.js — feishu-mermaid-sync 统一入口
 *
 * 子命令:
 *   node sync.js preview <file>                    本地预览（文字 + Mermaid）
 *   node sync.js convert <file> [-o output.md]     飞书兼容转换
 *   node sync.js status  <file>                    显示同步状态
 *   node sync.js push    <file> --doc-url <url>    完整推送流程
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const SCRIPTS_DIR = __dirname;
const INDEX_FILE = '.feishu-index.json';

function usage() {
  console.log(`
用法: node sync.js <command> <file> [options]

命令:
  preview <file> [--fast]            生成 HTML 预览并打开浏览器
                                       默认：whiteboard-cli 精确模式（与飞书视觉一致）
                                       --fast：Mermaid.js 快速模式（可交互，即时渲染）
  convert <file> [-o output.md]      转换为飞书兼容格式（不修改源文件）
  status  <file>                     显示 .feishu-index.json 中的同步状态
  push    <file> --doc-url <url>     推送到飞书（需要 lark-cli）

示例:
  node sync.js preview docs/device-keygen.md
  node sync.js preview docs/device-keygen.md --fast
  node sync.js convert docs/device-keygen.md -o /tmp/feishu.md
  node sync.js status  docs/device-keygen.md
  node sync.js push    docs/device-keygen.md --doc-url https://your-org.feishu.cn/docx/Xxx
`);
  process.exit(1);
}

const args = process.argv.slice(2);
const command = args[0];
const inputFile = args[1];

if (!command || !inputFile) usage();
if (!fs.existsSync(inputFile)) {
  console.error(`错误: 文件不存在: ${inputFile}`);
  process.exit(1);
}

const absInput = path.resolve(inputFile);
const dir = path.dirname(absInput);
const basename = path.basename(absInput);
const indexPath = path.join(dir, INDEX_FILE);

function readIndex() {
  if (!fs.existsSync(indexPath)) return {};
  try { return JSON.parse(fs.readFileSync(indexPath, 'utf-8')); }
  catch (_) { return {}; }
}

function writeIndex(data) {
  fs.writeFileSync(indexPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ── preview ───────────────────────────────────────────────────────────────────
if (command === 'preview') {
  const previewScript = path.join(SCRIPTS_DIR, 'render-preview.js');
  const extraFlags = args.filter(a => a.startsWith('--'));
  const result = spawnSync(process.execPath, [previewScript, absInput, ...extraFlags], { stdio: 'inherit' });
  process.exit(result.status ?? 0);
}

// ── convert ───────────────────────────────────────────────────────────────────
if (command === 'convert') {
  const compatScript = path.join(SCRIPTS_DIR, 'feishu-compat.js');
  const outIdx = args.indexOf('-o');
  const outputFile = outIdx !== -1 ? args[outIdx + 1] : null;
  const extra = outputFile ? ['-o', outputFile] : [];
  const result = spawnSync(process.execPath, [compatScript, absInput, ...extra], { stdio: 'inherit' });
  process.exit(result.status ?? 0);
}

// ── status ────────────────────────────────────────────────────────────────────
if (command === 'status') {
  const idx = readIndex();
  const entry = idx[basename];
  if (!entry) {
    console.log(`[${basename}] 未在 ${INDEX_FILE} 中记录，尚未同步过。`);
  } else {
    console.log(`[${basename}] 同步状态:`);
    console.log(`  doc_url:          ${entry.doc_url || '(未记录)'}`);
    console.log(`  diagram_title:    ${entry.diagram_title || '(未记录)'}`);
    console.log(`  whiteboard_token: ${entry.whiteboard_token || '(未记录)'}`);
    console.log(`  last_synced:      ${entry.last_synced || '(从未同步)'}`);
  }
  process.exit(0);
}

// ── push ──────────────────────────────────────────────────────────────────────
if (command === 'push') {
  const docUrlIdx = args.indexOf('--doc-url');
  const docUrl = docUrlIdx !== -1 ? args[docUrlIdx + 1] : null;

  if (!docUrl) {
    console.error('错误: push 命令需要 --doc-url <url>');
    process.exit(1);
  }

  const idx = readIndex();
  const entry = idx[basename] || {};
  const wbToken = entry.whiteboard_token;

  console.log(`\n=== feishu-mermaid-sync push: ${basename} ===\n`);

  // Step 1: 本地预览
  console.log('步骤 1/5: 生成本地预览...');
  const previewScript = path.join(SCRIPTS_DIR, 'render-preview.js');
  spawnSync(process.execPath, [previewScript, absInput], { stdio: 'inherit' });
  console.log('请在浏览器确认预览效果，然后按 Ctrl+C 中止或继续等待自动继续...\n');

  // Step 2: 飞书兼容转换
  console.log('步骤 2/5: 飞书兼容性转换...');
  const tmpFile = path.join(require('os').tmpdir(), `${basename}-feishu.md`);
  const compatScript = path.join(SCRIPTS_DIR, 'feishu-compat.js');
  spawnSync(process.execPath, [compatScript, absInput, '-o', tmpFile], { stdio: 'inherit' });

  // Step 3: 读取文档当前状态
  console.log('\n步骤 3/5: 读取飞书文档当前状态...');
  console.log(`  lark-cli docs +fetch --doc "${docUrl}" --format json\n`);
  try {
    const fetchOut = execFileSync('lark-cli', ['docs', '+fetch', '--doc', docUrl, '--format', 'json'], {
      encoding: 'utf-8',
    });
    const doc = JSON.parse(fetchOut);
    // 尝试提取 whiteboard token（JSON 结构可能因版本不同而异）
    const wbTokens = extractWhiteboardTokens(doc);
    if (wbTokens.length > 0) {
      console.log('  发现 whiteboard block token(s):');
      wbTokens.forEach(t => console.log(`    - ${t}`));
      if (!wbToken) {
        console.log(`  提示: 可将 whiteboard_token 记录到 ${INDEX_FILE} 以便后续更新`);
      }
    } else {
      console.log('  未找到 whiteboard block（文档中尚无 Mermaid 图表）');
    }
  } catch (e) {
    console.error(`  警告: lark-cli +fetch 失败: ${e.message}`);
    console.error('  请手动执行上方命令查看文档结构');
  }

  // Step 4: 显示推送命令（dry-run）
  console.log('\n步骤 4/5: 推送计划（dry-run）...');
  if (wbToken) {
    console.log(`  [推荐] 使用 +whiteboard-update 直接更新 whiteboard (token: ${wbToken})`);
    console.log(`  命令:`);
    console.log(`    node feishu-compat.js "${absInput}" | awk '/\`\`\`mermaid/{p=1;next} /^\`\`\`$/{if(p)exit} p' \\`);
    console.log(`      | lark-cli docs +whiteboard-update --whiteboard-token "${wbToken}" --overwrite --dry-run`);
  } else {
    const title = entry.diagram_title || '（未知标题，请在 .feishu-index.json 中设置 diagram_title）';
    console.log(`  [备用] 使用 +update insert_after 插入新 mermaid 代码块`);
    console.log(`  在标题 "${title}" 后插入`);
    console.log(`  命令（dry-run）:`);
    console.log(`    lark-cli docs +update --doc "${docUrl}" --mode insert_after \\`);
    console.log(`      --selection-by-title "${title}" --markdown @"${tmpFile}" --dry-run`);
  }

  console.log('\n步骤 5/5: 准备就绪');
  console.log('  请手动执行上方命令（去掉 --dry-run）完成推送。');
  console.log(`  推送成功后，运行以下命令记录 whiteboard_token：`);
  console.log(`    lark-cli docs +fetch --doc "${docUrl}" --format json | jq '.blocks[] | select(.block_type == "whiteboard")'`);
  console.log(`  然后将 token 更新到 ${indexPath}`);

  // 更新 index（记录 doc_url 和时间）
  idx[basename] = {
    ...entry,
    doc_url: docUrl,
    last_synced: new Date().toISOString(),
  };
  writeIndex(idx);
  console.log(`\n✅ ${INDEX_FILE} 已更新 (doc_url + last_synced)`);
  process.exit(0);
}

usage();

// ── helpers ───────────────────────────────────────────────────────────────────
function extractWhiteboardTokens(obj, tokens = []) {
  if (!obj || typeof obj !== 'object') return tokens;
  if (Array.isArray(obj)) {
    obj.forEach(item => extractWhiteboardTokens(item, tokens));
  } else {
    const type = obj.block_type || obj.type || '';
    if (typeof type === 'string' && type.toLowerCase().includes('whiteboard')) {
      const t = obj.whiteboard_token || obj.token || obj.block_id;
      if (t) tokens.push(t);
    }
    Object.values(obj).forEach(v => extractWhiteboardTokens(v, tokens));
  }
  return tokens;
}
