#!/usr/bin/env node
/**
 * render-preview.js
 * Generates a local preview of a Markdown file with Mermaid diagrams.
 *
 * Modes:
 *   default  — whiteboard-cli renders diagrams as PNG (same engine as Feishu, pixel-accurate).
 *              Slower (~3-5s per diagram). Best for final visual verification.
 *   --fast   — Mermaid.js v10 renders diagrams as interactive SVG in the browser.
 *              Instant, no local dependencies. Best for rapid iteration on content.
 *
 * Usage:
 *   node render-preview.js <input.md> [output.html]          # accurate mode
 *   node render-preview.js <input.md> [output.html] --fast   # fast/interactive mode
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawnSync } = require('child_process');

const args       = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags      = process.argv.slice(2).filter(a => a.startsWith('--'));
const fastMode   = flags.includes('--fast');

const inputFile  = args[0] || process.argv[2];
const outputFile = args[1] || (inputFile || '').replace(/\.md$/i, '.preview.html');

if (!inputFile) {
  console.error('用法: node render-preview.js <input.md> [output.html]');
  process.exit(1);
}

const markdown = fs.readFileSync(inputFile, 'utf8');
const title    = path.basename(inputFile);

// ── Feishu compat (server-side, mirrors feishu-compat.js) ────────────────────

function feishuCompatDoc(content) {
  // Multi-line blockquotes: join with <br> (Feishu parser merges them without separator)
  return content.replace(
    /(^>[^\n]*\n)((?:>[^\n]*\n?)+)/gm,
    (match) => {
      const lines = match.split('\n').filter(l => l.trim() !== '');
      if (lines.length <= 1) return match;
      return '> ' + lines.map(l => l.replace(/^>\s?/, '')).join('<br>') + '\n';
    }
  );
}

function feishuCompatMermaid(code) {
  let r = code;
  r = r.replace(/<br\/>/gi, '<br>');
  r = r.replace(/^stateDiagram-v2$/gm, 'stateDiagram');
  r = r.replace(
    /(Note\s+(?:over|left\s+of|right\s+of)\s+[^:\n]+:[^\n]*)/g,
    (line) => {
      let o = line.replace(/"/g, '');
      o = o.replace(/(<)(?!br[ >\/])/gi, '＜');
      return o;
    }
  );
  return r;
}

// ── Render one Mermaid block → PNG via whiteboard-cli ────────────────────────

function renderMermaidPng(code, idx) {
  const pid   = process.pid;
  const mmd   = path.join(os.tmpdir(), `fsprev_${pid}_${idx}.mmd`);
  const png   = path.join(os.tmpdir(), `fsprev_${pid}_${idx}.png`);

  try {
    fs.writeFileSync(mmd, code, 'utf-8');

    // shell:true required on Windows so that npx.cmd is found via PATH
    const r = spawnSync(
      'npx',
      ['-y', '@larksuite/whiteboard-cli@^0.2.9', '-i', mmd, '-o', png],
      { timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
    );

    if (r.status === 0 && fs.existsSync(png)) {
      const data = fs.readFileSync(png).toString('base64');
      return { ok: true, data };
    }

    const stderr = (r.stderr || Buffer.alloc(0)).toString().trim();
    const stdout = (r.stdout || Buffer.alloc(0)).toString().trim();
    return { ok: false, error: (stderr || stdout || 'whiteboard-cli 失败').split('\n')[0] };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { fs.unlinkSync(mmd); } catch (_) {}
    try { if (fs.existsSync(png)) fs.unlinkSync(png); } catch (_) {}
  }
}

// ── Process markdown: compat + render all diagrams ───────────────────────────

process.stderr.write(`📄 处理: ${title}${fastMode ? ' [快速模式]' : ' [精确模式]'}\n`);

let processed = feishuCompatDoc(markdown);
let total = 0, ok = 0, fail = 0;

if (fastMode) {
  // Fast mode: leave mermaid fences for browser-side Mermaid.js rendering
  // Count diagrams only
  (processed.match(/```mermaid\n/g) || []).forEach(() => total++);
  process.stderr.write(`  ${total} 个图表将在浏览器端渲染（Mermaid.js）\n`);
  ok = total;
} else {
  // Accurate mode: pre-render each diagram via whiteboard-cli → PNG → base64
  processed = processed.replace(/```mermaid\n([\s\S]*?)```/g, (_, raw) => {
    const idx    = total++;
    const compat = feishuCompatMermaid(raw);

    process.stderr.write(`  图表 ${idx + 1} 渲染中… `);
    const result = renderMermaidPng(compat, idx);

    if (result.ok) {
      ok++;
      process.stderr.write('✅\n');
      return `\n<div class="wb-img"><img src="data:image/png;base64,${result.data}" alt="图表${idx + 1}"></div>\n`;
    } else {
      fail++;
      process.stderr.write(`❌ ${result.error}\n`);
      const esc = compat.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return `\n<div class="wb-err"><strong>❌ 图表 ${idx + 1} 渲染失败</strong> — ${result.error}<pre class="wb-src">${esc}</pre></div>\n`;
    }
  });
  process.stderr.write(`\n图表渲染完成: ${ok} 成功 / ${fail} 失败 / ${total} 总计\n`);
}

const mdJson     = JSON.stringify(processed);
const bannerNote = fastMode
  ? '· <strong>快速模式</strong>：图表由 Mermaid.js v10 渲染（可交互，但与飞书视觉不同）<br>  · 运行不带 <code>--fast</code> 可切换为精确模式（whiteboard-cli 飞书同款）'
  : (ok === total && total > 0
      ? '· <strong>精确模式</strong>：图表由 whiteboard-cli（飞书同款引擎）预渲染，视觉与飞书一致'
      : '· ⚠ whiteboard-cli 渲染部分失败，失败图表显示为错误信息');

// ── HTML template ─────────────────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview: ${title}</title>
<style>
*{box-sizing:border-box;-webkit-font-smoothing:antialiased}
/* ── 飞书文档排版风格 ── */
body{margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif;font-size:15px;line-height:1.75;color:#1f2329}
/* ── 整体布局：左侧目录 + 右侧内容（对齐飞书文档结构）── */
.layout{display:flex;align-items:flex-start}
/* ── 左侧目录栏：fixed 定位，不参与文档流，避免影响缩放 ── */
.toc-panel{position:fixed;top:0;left:0;width:236px;height:100vh;overflow-y:auto;padding:48px 0;border-right:1px solid #ebebeb;background:#fff;z-index:10}
.toc-header{font-size:11px;font-weight:600;color:#8f959e;padding:0 12px 10px 20px;letter-spacing:.6px;text-transform:uppercase}
#toc-list{display:flex;flex-direction:column}
.toc-item{display:block;font-size:13px;color:#646a73;padding:5px 12px 5px 20px;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:2px solid transparent;transition:background .12s,color .12s,border-color .12s;line-height:1.6}
.toc-item:hover{background:#f2f3f5;color:#1f2329}
.toc-item.toc-active{color:#3370ff;border-left-color:#3370ff;background:#f0f4ff}
.toc-h1{padding-left:20px;font-weight:600;font-size:13px}
.toc-h2{padding-left:28px}
.toc-h3{padding-left:40px;font-size:12px;color:#8f959e}
.toc-h3.toc-active{color:#3370ff}
/* ── 右侧文档内容区：左边距留给 fixed TOC ── */
.main-area{margin-left:236px;min-width:0;width:100%}
.page{max-width:860px;margin:0 auto;padding:56px 48px 120px}
/* headings */
.doc h1{font-size:26px;font-weight:700;line-height:1.35;margin:0 0 24px}
.doc h2{font-size:20px;font-weight:700;line-height:1.4;margin:40px 0 12px}
.doc h3{font-size:17px;font-weight:600;line-height:1.4;margin:28px 0 8px}
.doc h4,.doc h5,.doc h6{font-size:15px;font-weight:600;margin:20px 0 6px}
/* text */
.doc p{margin:8px 0 14px}
.doc a{color:#3370ff;text-decoration:none}
.doc a:hover{text-decoration:underline}
/* blockquote */
.doc blockquote{border-left:3px solid #bbbfc4;margin:8px 0 14px;padding:2px 16px;background:transparent;color:#646a73}
.doc blockquote p{margin:4px 0}
/* code */
.doc code{background:#f2f3f5;padding:2px 6px;border-radius:4px;font-size:.875em;font-family:"SFMono-Regular",Consolas,"Courier New",monospace}
.doc pre{background:#f2f3f5;padding:16px;border-radius:6px;overflow-x:auto;margin:12px 0}
.doc pre code{background:none;padding:0;font-size:.85em}
/* lists */
.doc ul,.doc ol{margin:6px 0 14px;padding-left:24px}
.doc li{margin:4px 0}
/* tables */
.doc table{border-collapse:collapse;margin:12px 0;width:100%;font-size:14px}
.doc th,.doc td{border:1px solid #dee0e3;padding:9px 14px;text-align:left;vertical-align:top}
.doc th{background:#f2f3f5;font-weight:600}
.doc hr{border:none;border-top:1px solid #dee0e3;margin:28px 0}
/* whiteboard 块 — 对齐飞书画板嵌入容器样式 */
.wb-img{margin:16px 0;background:#fff;border:1px solid #e8e9eb;border-radius:6px;overflow:hidden;box-shadow:0 1px 4px rgba(31,35,41,.06)}
.wb-img img{width:100%;height:auto;display:block;padding:16px}
/* error fallback */
.wb-err{background:#fff2f0;border:1px solid #ffa39e;border-radius:4px;padding:12px 16px;margin:16px 0;font-size:13px;color:#a8071a}
.wb-src{background:#fafafa;border:1px solid #eee;border-radius:4px;padding:10px;font-size:12px;overflow-x:auto;white-space:pre;margin-top:8px;max-height:200px;overflow-y:auto}
/* banner */
#btoggle{position:fixed;bottom:16px;right:16px;background:#e8f4ff;border:1px solid #91caff;border-radius:20px;padding:5px 14px;font-size:12px;color:#0958d9;cursor:pointer;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.1);user-select:none}
#bbody{position:fixed;bottom:50px;right:16px;background:#e8f4ff;border:1px solid #91caff;border-radius:8px;padding:12px 16px;font-size:12px;color:#0958d9;line-height:1.7;z-index:99;max-width:420px;box-shadow:0 4px 16px rgba(0,0,0,.1);display:none}
</style>
</head>
<body>
<div class="layout">
  <!-- 左侧目录栏（对齐飞书文档大纲） -->
  <nav class="toc-panel" id="toc-panel">
    <div class="toc-header">目录</div>
    <div id="toc-list"></div>
  </nav>
  <!-- 右侧文档内容 -->
  <div class="main-area">
  <div class="page">
    <div class="doc" id="content"><p style="color:#aaa;padding:40px 0;text-align:center">正在渲染…</p></div>
  </div>
  </div>
</div>

<div id="btoggle" onclick="var b=document.getElementById('bbody');b.style.display=b.style.display==='block'?'none':'block'">ℹ 预览说明</div>
<div id="bbody">
  <strong>本地预览</strong> — 飞书文档近似<br>
  ${bannerNote}<br>
  · 文字/表格排版为飞书风格 CSS 近似（非像素级）<br>
  · 已应用飞书兼容转换（<code>br/</code>→<code>br</code>、Note引号删除、裸&lt;→全角＜、blockquote合并、stateDiagram-v2降级）<br>
  · 渲染统计：${ok}/${total} 成功${fastMode ? ' &nbsp;<span id="mver"></span>' : ''}
</div>

<script id="md" type="application/json">${mdJson}</script>
<script src="https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js" crossorigin="anonymous"></script>
<!-- TOC builder (shared by both modes) -->
<script>
function buildTOC() {
  var headings = document.querySelectorAll('#content h1,#content h2,#content h3');
  var list = document.getElementById('toc-list');
  if (!headings.length) { document.getElementById('toc-panel').style.display='none'; return; }
  headings.forEach(function(h, i) {
    h.id = 'h' + i;
    var level = parseInt(h.tagName[1]);
    var a = document.createElement('a');
    a.href = '#h' + i;
    a.className = 'toc-item toc-h' + level;
    a.dataset.id = 'h' + i;
    a.textContent = h.textContent;
    list.appendChild(a);
  });
  // Scroll-spy: highlight current section
  var items = list.querySelectorAll('.toc-item');
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      var link = list.querySelector('[data-id="' + e.target.id + '"]');
      if (link) link.classList.toggle('toc-active', e.isIntersecting);
    });
  }, { rootMargin: '-56px 0px -65% 0px', threshold: 0 });
  headings.forEach(function(h) { obs.observe(h); });
  // Smooth scroll
  items.forEach(function(a) {
    a.addEventListener('click', function(e) {
      e.preventDefault();
      var t = document.getElementById(this.dataset.id);
      if (t) t.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  });
}
</script>
${fastMode ? `
<!-- Fast mode: Mermaid.js for interactive diagram rendering -->
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad:false, theme:'neutral', securityLevel:'loose',
  sequence:{ wrap:true, useMaxWidth:true, noteMargin:12, messageMargin:50, fontSize:13 },
  flowchart:{ useMaxWidth:true, htmlLabels:false } });
document.getElementById('mver').textContent = 'Mermaid v' + mermaid.version;

function feishuCompat(r) {
  r = r.replace(/<br\\/>/gi,'<br>');
  r = r.replace(/^stateDiagram-v2$/gm,'stateDiagram');
  r = r.replace(/(Note\\s+(?:over|left\\s+of|right\\s+of)\\s+[^:\\n]+:[^\\n]*)/g,
    l => l.replace(/"/g,'').replace(/(<)(?!br[ >\\/])/gi,'＜'));
  return r;
}
const srcs = [];
marked.use({ renderer: { code(t,l) {
  var code=(t&&typeof t==='object')?t.text:t, lang=(t&&typeof t==='object')?t.lang:l;
  if((lang||'').toLowerCase()==='mermaid'){
    var i=srcs.length; srcs.push(code);
    return '<div class="wb-img" id="mw'+i+'"><p style="color:#aaa;padding:16px 0">⏳ 渲染中…</p></div>';
  }
  return false;
}}});
var raw=JSON.parse(document.getElementById('md').textContent);
document.getElementById('content').innerHTML=marked.parse(raw);
buildTOC();
for(var i=0;i<srcs.length;i++){
  var el=document.getElementById('mw'+i);
  if(!el)continue;
  try{
    var res=await mermaid.render('ms'+i,feishuCompat(srcs[i]));
    el.innerHTML=res.svg;
  }catch(e){
    var esc=srcs[i].replace(/&/g,'&amp;').replace(/</g,'&lt;');
    el.innerHTML='<div class="wb-err">❌ '+e.message.split('\\n')[0]+'<pre class="wb-src">'+esc+'</pre></div>';
  }
}
</script>` : `
<script>
(function(){
  var raw=JSON.parse(document.getElementById('md').textContent);
  marked.setOptions({ mangle:false, headerIds:false });
  document.getElementById('content').innerHTML=marked.parse(raw);
  buildTOC();
})();
</script>`}
</body>
</html>`;

fs.writeFileSync(outputFile, html, 'utf8');

const absPath = path.resolve(outputFile);
console.log('✅ 预览已生成: ' + absPath);
if (fail > 0) console.log(`⚠ ${fail} 个图表渲染失败，详见 HTML 内错误信息`);

// ── Cross-platform browser open ───────────────────────────────────────────────
function detectPlatform() {
  if (process.platform === 'linux') {
    try {
      const ver = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
      if (ver.includes('microsoft') || ver.includes('wsl')) return 'wsl';
    } catch (_) {}
  }
  return process.platform;
}

function openBrowser(filePath) {
  const platform = detectPlatform();
  if (platform === 'wsl') {
    let winPath = filePath;
    try {
      winPath = require('child_process')
        .execSync('wslpath -w "' + filePath + '"').toString().trim();
    } catch (_) {
      winPath = filePath
        .replace(/^\/mnt\/([a-z])\//, (_, d) => d.toUpperCase() + ':\\')
        .replace(/\//g, '\\');
    }
    const hasWslview = spawnSync('which', ['wslview']).status === 0;
    if (hasWslview) spawnSync('wslview', [filePath], { detached: true, stdio: 'ignore' });
    else spawnSync('cmd.exe', ['/c', 'start', '', winPath], { detached: true, stdio: 'ignore' });
    console.log('🌐 已在 Windows 浏览器打开（WSL）');
  } else if (platform === 'win32') {
    spawnSync('cmd.exe', ['/c', 'start', '', filePath], { detached: true, stdio: 'ignore' });
    console.log('🌐 已在浏览器打开（Windows）');
  } else if (platform === 'darwin') {
    spawnSync('open', [filePath], { detached: true, stdio: 'ignore' });
    console.log('🌐 已在浏览器打开（macOS）');
  } else {
    const cmds = ['xdg-open', 'sensible-browser', 'firefox', 'chromium-browser', 'chromium'];
    for (const cmd of cmds) {
      if (spawnSync('which', [cmd]).status === 0) {
        spawnSync(cmd, [filePath], { detached: true, stdio: 'ignore' });
        console.log('🌐 已在浏览器打开（Linux, ' + cmd + ')');
        return;
      }
    }
    console.log('⚠ 未找到浏览器，请手动打开: ' + filePath);
  }
}

openBrowser(absPath);
