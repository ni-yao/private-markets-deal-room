// Tiny, dependency-free, XSS-safe Markdown renderer for agent replies.
// Escapes all HTML first, then applies a limited, safe set of Markdown rules
// (headings, bold/italic, inline code, fenced code, lists, links, paragraphs).

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(s: string): string {
  let t = escapeHtml(s);
  // inline code
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bold then italic
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  // links [text](http…) — only http/https targets
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return t;
}

export function renderMarkdown(src: string): string {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCode = false;
  const code: string[] = [];
  let para: string[] = [];

  const flushList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };
  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
  };

  for (const raw of lines) {
    const line = raw;
    if (line.trim().startsWith('```')) {
      if (inCode) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code.length = 0; inCode = false; }
      else { flushPara(); flushList(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(line); continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (h) {
      flushPara(); flushList();
      const level = Math.min(h[1].length + 2, 6); // h1->h3
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (ul) {
      flushPara();
      if (listType !== 'ul') { flushList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
    } else if (ol) {
      flushPara();
      if (listType !== 'ol') { flushList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`);
    } else if (line.trim() === '') {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  if (inCode) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  flushPara(); flushList();
  return out.join('\n');
}
