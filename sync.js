#!/usr/bin/env node
/**
 * feishu-preview — 飞书 Mermaid 图表全流程 CLI 入口
 *
 * 子命令:
 *   feishu-preview install-skill                         安装 Claude Code 技能定义
 *   feishu-preview check   <file>                        检查飞书兼容性（只读）
 *   feishu-preview convert <file> [-w] [-o output.md]    飞书兼容转换
 *   feishu-preview preview <file> [--fast]               本地预览
 *   feishu-preview status  <file>                        显示同步状态
 *   feishu-preview push    <file> --doc-url <url>        推送到飞书
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const SCRIPTS_DIR = __dirname;
const INDEX_FILE = '.feishu-index.json';

function usage() {
  console.log(`
用法: feishu-preview <command> [file] [options]

命令:
  install-skill                      安装 Claude Code 技能到 ~/.claude/skills/
  check   <file>                     检查飞书兼容性（不修改文件，exit 1 表示有问题）
  convert <file> [-o output.md]      转换为飞书兼容格式（不修改源文件）
          <file> -w                  原地修正源文件
  preview <file> [--fast]            生成 HTML 预览并打开浏览器
                                       默认：whiteboard-cli 精确模式（与飞书一致）
                                       --fast：Mermaid.js 快速模式（即时交互）
  status  <file>                     显示 .feishu-index.json 中的同步状态
  push    <file> --doc-url <url>     推送到飞书（需要 lark-cli）

工作流:
  1. feishu-preview check   docs/my-diagram.md    # 编写完检查兼容性
  2. feishu-preview convert docs/my-diagram.md -w # 自动修正
  3. feishu-preview preview docs/my-diagram.md    # 预览效果
  # 同步到飞书由 Claude Code 技能引导完成
`);
  process.exit(1);
}

const args = process.argv.slice(2);
const command = args[0];

if (!command) usage();

// ── install-skill ──────────────────────────────────────────────────────────────
if (command === 'install-skill') {
  const os = require('os');
  const skillsDir = path.join(os.homedir(), '.claude', 'skills', 'feishu-preview');
  const srcSkill = path.join(SCRIPTS_DIR, 'SKILL.md');
  if (!fs.existsSync(srcSkill)) {
    console.error(`错误: SKILL.md 不存在: ${srcSkill}`);
    process.exit(1);
  }
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.copyFileSync(srcSkill, path.join(skillsDir, 'SKILL.md'));
  console.log(`✅ Claude Code 技能已安装`);
  console.log(`   位置: ${path.join(skillsDir, 'SKILL.md')}`);
  console.log(`\n在 Claude Code 中可以说:`);
  console.log(`   "检查 my-doc.md 的飞书兼容性"`);
  console.log(`   "预览 my-doc.md"`);
  console.log(`   "同步 my-doc.md 到飞书文档"`);
  process.exit(0);
}

// 以下命令需要 <file> 参数
const inputFile = args[1];
if (!inputFile) usage();
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

// ── check ─────────────────────────────────────────────────────────────────────
if (command === 'check') {
  const compatScript = path.join(SCRIPTS_DIR, 'feishu-compat.js');
  const result = spawnSync(process.execPath, [compatScript, absInput, '--check'], { stdio: 'inherit' });
  process.exit(result.status ?? 0);
}

// ── convert ───────────────────────────────────────────────────────────────────
if (command === 'convert') {
  const compatScript = path.join(SCRIPTS_DIR, 'feishu-compat.js');
  const outIdx = args.indexOf('-o');
  const outputFile = outIdx !== -1 ? args[outIdx + 1] : null;
  const writeInPlace = args.includes('-w');
  const extra = outputFile ? ['-o', outputFile] : writeInPlace ? ['-w'] : [];
  const result = spawnSync(process.execPath, [compatScript, absInput, ...extra], { stdio: 'inherit' });
  process.exit(result.status ?? 0);
}

// ── preview ───────────────────────────────────────────────────────────────────
if (command === 'preview') {
  const previewScript = path.join(SCRIPTS_DIR, 'render-preview.js');
  const extraFlags = args.filter(a => a.startsWith('--'));
  const result = spawnSync(process.execPath, [previewScript, absInput, ...extraFlags], { stdio: 'inherit' });
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
    console.log(`  doc_url:     ${entry.doc_url || '(未记录)'}`);
    console.log(`  last_synced: ${entry.last_synced || '(从未同步)'}`);
    const wbs = entry.whiteboards || {};
    const wbCount = Object.keys(wbs).length;
    if (wbCount > 0) {
      console.log(`  whiteboards: ${wbCount} 个图表`);
      Object.entries(wbs).forEach(([title, token]) => {
        console.log(`    ${title}: ${token}`);
      });
    }
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

  console.log(`\n=== feishu-preview push: ${basename} ===\n`);

  // Step 1: 本地预览
  console.log('步骤 1/4: 生成本地预览...');
  const previewScript = path.join(SCRIPTS_DIR, 'render-preview.js');
  spawnSync(process.execPath, [previewScript, absInput], { stdio: 'inherit' });
  console.log('请在浏览器确认预览效果，然后继续...\n');

  // Step 2: 飞书兼容转换
  console.log('步骤 2/4: 飞书兼容性转换...');
  const tmpFile = path.join(require('os').tmpdir(), `${basename}-feishu.md`);
  const compatScript = path.join(SCRIPTS_DIR, 'feishu-compat.js');
  spawnSync(process.execPath, [compatScript, absInput, '-o', tmpFile], { stdio: 'inherit' });

  // Step 3: 读取文档当前状态
  console.log('\n步骤 3/4: 读取飞书文档当前状态...');
  console.log(`  lark-cli docs +fetch --doc "${docUrl}" --format json\n`);
  try {
    const fetchOut = execFileSync('lark-cli', ['docs', '+fetch', '--doc', docUrl, '--format', 'json'], {
      encoding: 'utf-8',
    });
    const doc = JSON.parse(fetchOut);
    const wbTokens = extractWhiteboardTokens(doc);
    if (wbTokens.length > 0) {
      console.log('  发现 whiteboard block token(s):');
      wbTokens.forEach(t => console.log(`    - ${t}`));
    } else {
      console.log('  未找到 whiteboard block（文档中尚无 Mermaid 图表）');
    }
  } catch (e) {
    console.error(`  警告: lark-cli +fetch 失败: ${e.message}`);
  }

  // Step 4: 显示推送命令
  console.log('\n步骤 4/4: 推送计划...');
  if (wbToken) {
    console.log(`  [推荐] 使用 +whiteboard-update 更新 whiteboard (token: ${wbToken})`);
    console.log(`  命令:`);
    console.log(`    node feishu-compat.js "${absInput}" | awk '/\`\`\`mermaid/{p=1;next} /^\`\`\`$/{if(p)exit} p' \\`);
    console.log(`      | lark-cli docs +whiteboard-update --whiteboard-token "${wbToken}" --overwrite --yes`);
  } else {
    const title = entry.diagram_title || '（请在 .feishu-index.json 中设置 diagram_title）';
    console.log(`  [备用] 在标题 "${title}" 后插入 mermaid 代码块`);
    console.log(`  命令:`);
    console.log(`    lark-cli docs +update --doc "${docUrl}" --mode insert_after \\`);
    console.log(`      --selection-by-title "${title}" --markdown @"${tmpFile}"`);
  }

  idx[basename] = { ...entry, doc_url: docUrl, last_synced: new Date().toISOString() };
  writeIndex(idx);
  console.log(`\n✅ ${INDEX_FILE} 已更新`);
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
