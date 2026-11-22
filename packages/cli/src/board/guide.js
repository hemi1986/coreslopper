// The workspace's docs on the board, read from docs/ of the workspace, so they match its version and work offline.
//   #/guide          the board guide in the browser's language
//   #/guide/<doc>    docs/<doc>.md (top-level docs only; links between them stay on the board)
// The markdown is the docs' own small subset: headings, paragraphs, lists, tables, fenced code, images, links,
// bold, italics, and inline code. Everything is built as DOM nodes, never as HTML.
import { addStrings, el, getLang, setLang, showError, t } from './lib.js';

addStrings({
  de: { guideMissing: 'Diese Seite gibt es in docs/ dieses Workspaces nicht.' },
  en: { guideMissing: 'This page is not in the workspace\'s docs/.' },
});

const DOC = /^[a-z][a-z0-9-]*(\.de)?$/;

/** The board guide in the browser's language. */
export function guideDoc() { return getLang() === 'de' ? 'board-guide.de' : 'board-guide'; }

/** A link target inside a doc: another top-level doc, an image under assets/, a web address, or nothing. */
function target(href) {
  if (/^https?:\/\//.test(href)) return { href: href, external: true };
  const doc = /^([a-z][a-z0-9-]*(?:\.de)?)\.md(?:#.*)?$/.exec(href);
  if (doc) return { href: '#/guide/' + doc[1] };
  if (/^assets\/[a-z0-9/_.-]+$/.test(href) && href.indexOf('..') < 0) return { href: '/docs/' + href };
  return null;
}

/** Inline markdown: `code`, ![image](src), [link](href), **bold**, *italics* or _italics_. */
function inline(text) {
  const nodes = [];
  const pattern = /`([^`]+)`|!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|\b_([^_]+)_\b/g;
  let last = 0, match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) nodes.push(el('code', { text: match[1] }));
    else if (match[3] !== undefined) {
      const image = target(match[3]);
      nodes.push(image ? el('img', { src: image.href, alt: match[2], loading: 'lazy' }) : match[2]);
    } else if (match[5] !== undefined) {
      const link = target(match[5]);
      const label = inline(match[4]);
      nodes.push(link ? el('a', { href: link.href, target: link.external ? '_blank' : undefined, rel: link.external ? 'noopener' : undefined }, label) : el('span', {}, label));
    } else if (match[6] !== undefined) nodes.push(el('strong', {}, inline(match[6])));
    else nodes.push(el('em', {}, inline(match[7] !== undefined ? match[7] : match[8])));
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function cells(row) { return row.trim().replace(/^\||\|$/g, '').split('|').map(function (cell) { return cell.trim(); }); }

/** Block markdown, line by line. */
export function renderMarkdown(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let match;
    if (!line.trim()) { i += 1; continue; }
    if (/^```/.test(line)) {
      const code = [];
      for (i += 1; i < lines.length && !/^```/.test(lines[i]); i += 1) code.push(lines[i]);
      out.push(el('pre', {}, [el('code', { text: code.join('\n') })]));
      i += 1;
    } else if ((match = /^(#{1,4})\s+(.*)$/.exec(line))) {
      out.push(el('h' + Math.min(4, match[1].length + 1), {}, inline(match[2])));
      i += 1;
    } else if (/^\|/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && /^\|/.test(lines[i]); i += 1) rows.push(cells(lines[i]));
      out.push(el('table', {}, [
        el('thead', {}, [el('tr', {}, head.map(function (cell) { return el('th', {}, inline(cell)); }))]),
        el('tbody', {}, rows.map(function (row) { return el('tr', {}, row.map(function (cell) { return el('td', {}, inline(cell)); })); })),
      ]));
    } else if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && lines[i].trim()) {
        const item = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (item) items.push(item[1]);
        else if (items.length) items[items.length - 1] += ' ' + lines[i].trim();
        i += 1;
      }
      out.push(el(ordered ? 'ol' : 'ul', {}, items.map(function (item) { return el('li', {}, inline(item)); })));
    } else {
      const text = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\||\s*(?:[-*]|\d+\.)\s)/.test(lines[i])) { text.push(lines[i].trim()); i += 1; }
      const nodes = inline(text.join(' '));
      // A paragraph that is a single image shows it as a figure.
      out.push(nodes.length === 1 && nodes[0].tagName === 'IMG' ? el('figure', {}, nodes) : el('p', {}, nodes));
    }
  }
  return out;
}

export function showGuide(doc) {
  setLang(null);
  const name = doc && DOC.test(doc) ? doc : guideDoc();
  const main = document.getElementById('main');
  return fetch('/docs/' + name + '.md').then(function (res) {
    if (!res.ok) throw new Error(t('guideMissing') + ' (docs/' + name + '.md)');
    return res.text();
  }).then(function (source) {
    main.innerHTML = '';
    main.appendChild(el('article', { class: 'guide' }, renderMarkdown(source)));
    window.scrollTo(0, 0);
  }).catch(showError);
}
