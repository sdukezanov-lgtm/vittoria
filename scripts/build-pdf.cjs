/* Combine the docs/*.md guides into one self-contained HTML (no external deps),
   ready to be printed to PDF by headless Edge/Chrome. Dependency-free Markdown->HTML
   covering the subset used in our guides: headings, code fences, tables, lists,
   blockquotes, hr, bold, inline code, links. */
const fs = require('fs');
const path = require('path');

const DOCS = path.resolve(__dirname, '..', 'docs');
const GUIDES = [
  ['usage-guide.md', 'Руководство по работе с приложением'],
  ['managers-guide.md', 'Инструкция для менеджеров'],
  ['deployment-guide.md', 'Деплой на сервер'],
  ['store-accounts-and-publishing.md', 'Регистрация и публикация в магазинах'],
  ['mobile-build-and-publish.md', 'Сборка и публикация мобильных приложений'],
];

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inline(s) {
  // s is already HTML-escaped. Code spans first, then bold, then links.
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, b) => `<strong>${b}</strong>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t) => t); // keep link text only
  return s;
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let inCode = false;
  let codeBuf = [];
  let listStack = []; // 'ul' | 'ol'
  function closeLists() { while (listStack.length) out.push(`</${listStack.pop()}>`); }

  while (i < lines.length) {
    const line = lines[i];

    // code fence
    if (/^```/.test(line)) {
      if (!inCode) { closeLists(); inCode = true; codeBuf = []; }
      else { out.push(`<pre><code>${codeBuf.map(esc).join('\n')}</code></pre>`); inCode = false; }
      i++; continue;
    }
    if (inCode) { codeBuf.push(line); i++; continue; }

    // table: header row followed by a |---| separator
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeLists();
      const parseRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inline(esc(c.trim())));
      const header = parseRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(parseRow(lines[i])); i++; }
      let t = '<table><thead><tr>' + header.map((h) => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
      for (const r of rows) t += '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>';
      t += '</tbody></table>';
      out.push(t);
      continue;
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { closeLists(); out.push(`<h${h[1].length}>${inline(esc(h[2]))}</h${h[1].length}>`); i++; continue; }

    // hr
    if (/^---+\s*$/.test(line)) { closeLists(); out.push('<hr/>'); i++; continue; }

    // blockquote
    if (/^>\s?/.test(line)) {
      closeLists();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${inline(esc(buf.join(' ')))}</blockquote>`);
      continue;
    }

    // unordered list item
    const ul = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (listStack[listStack.length - 1] !== 'ul') { closeLists(); listStack.push('ul'); out.push('<ul>'); }
      out.push(`<li>${inline(esc(ul[2]))}</li>`); i++; continue;
    }
    // ordered list item
    const ol = /^(\s*)\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      if (listStack[listStack.length - 1] !== 'ol') { closeLists(); listStack.push('ol'); out.push('<ol>'); }
      out.push(`<li>${inline(esc(ol[2]))}</li>`); i++; continue;
    }

    // blank line
    if (/^\s*$/.test(line)) { closeLists(); i++; continue; }

    // paragraph
    closeLists();
    out.push(`<p>${inline(esc(line))}</p>`);
    i++;
  }
  closeLists();
  return out.join('\n');
}

let body = '';
GUIDES.forEach(([file, title], idx) => {
  const p = path.join(DOCS, file);
  if (!fs.existsSync(p)) { console.error('missing', file); return; }
  const md = fs.readFileSync(p, 'utf8');
  body += `<section class="${idx > 0 ? 'pagebreak' : ''}"><div class="doc-title">${esc(title)}</div>\n${mdToHtml(md)}</section>\n`;
});

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>VITTORIA HOME — Инструкции</title>
<style>
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; }
.cover { text-align:center; padding-top: 60mm; }
.cover h1 { font-size: 30pt; margin: 0; }
.cover p { color:#666; }
.doc-title { font-size: 20pt; font-weight: 700; border-bottom: 3px solid #2b6cb0; padding-bottom: 6px; margin: 0 0 12px; color:#2b6cb0; }
.pagebreak { page-break-before: always; }
h1{font-size:18pt;} h2{font-size:15pt;margin-top:18px;} h3{font-size:13pt;} h4{font-size:12pt;}
h1,h2,h3,h4{ color:#143; }
code { font-family: Consolas, 'Courier New', monospace; background:#f2f3f5; padding:1px 4px; border-radius:3px; font-size:10pt; }
pre { background:#f6f8fa; border:1px solid #e1e4e8; border-radius:6px; padding:10px; overflow:auto; white-space:pre-wrap; word-break:break-word; }
pre code { background:none; padding:0; font-size:9.5pt; }
table { border-collapse: collapse; width:100%; margin:10px 0; font-size:10pt; }
th,td { border:1px solid #cbd5e0; padding:5px 8px; text-align:left; vertical-align:top; }
th { background:#edf2f7; }
blockquote { border-left:4px solid #2b6cb0; background:#f7fafc; margin:8px 0; padding:6px 12px; color:#444; }
hr { border:none; border-top:1px solid #e2e8f0; margin:14px 0; }
ul,ol { margin:6px 0 6px 22px; } li { margin:3px 0; }
a { color:#2b6cb0; }
section { }
</style></head><body>
<div class="cover"><h1>VITTORIA HOME</h1><p>Полное руководство: работа, менеджеры, деплой, публикация в магазинах</p><p>Сгенерировано из docs/*.md</p></div>
${body}
</body></html>`;

const outHtml = path.join(DOCS, '_instrukcii.html');
fs.writeFileSync(outHtml, html, 'utf8');
console.log('HTML written:', outHtml);
