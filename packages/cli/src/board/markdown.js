// A small markdown renderer for the board: the subset the docs and the project documents use. It builds DOM
// nodes, never HTML, so a document can show text but never run anything. What it does not know stays text.
//   blocks: headings, paragraphs (line breaks kept), lists (an indented item is a nested one, `[ ]`/`[x]` a task), tables, fenced
//           code, block quotes, rules
//   inline: `code`, ![image](src), [link](href), **bold**, *italics* or _italics_
// `resolve(href, image)` turns a link or image address into { href, external } or null; null shows the text only.
import { el } from './lib.js';

function inline(text, resolve) {
  const nodes = [];
  const pattern = /`([^`]+)`|!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|\b_([^_]+)_\b/g;
  let last = 0, match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) nodes.push(el('code', { text: match[1] }));
    else if (match[3] !== undefined) {
      const image = resolve(match[3], true);
      nodes.push(image ? el('img', { src: image.href, alt: match[2], loading: 'lazy' }) : match[2]);
    } else if (match[5] !== undefined) {
      const link = resolve(match[5], false);
      const label = inline(match[4], resolve);
      nodes.push(link ? el('a', { href: link.href, target: link.external ? '_blank' : undefined, rel: link.external ? 'noopener' : undefined }, label) : el('span', {}, label));
    } else if (match[6] !== undefined) nodes.push(el('strong', {}, inline(match[6], resolve)));
    else nodes.push(el('em', {}, inline(match[7] !== undefined ? match[7] : match[8], resolve)));
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function cells(row) { return row.trim().replace(/^\||\|$/g, '').split('|').map(function (cell) { return cell.trim(); }); }

const TABLE_RULE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
const BLOCK_START = /^(#{1,6}\s|```|~~~|>|\||\s*(?:[-*+]|\d+[.)])\s|(?:-{3,}|\*{3,}|_{3,})\s*$)/;

function listItem(text, resolve) {
  const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
  if (!task) return inline(text, resolve);
  return [el('input', { type: 'checkbox', disabled: true, checked: task[1] !== ' ' ? true : undefined }), ' '].concat(inline(task[2], resolve));
}

/** The blocks of a markdown text as DOM nodes. */
export function renderMarkdown(source, resolve) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let match;
    if (!line.trim()) { i += 1; continue; }
    if (/^(```|~~~)/.test(line)) {
      const fence = line.slice(0, 3);
      const code = [];
      for (i += 1; i < lines.length && lines[i].slice(0, 3) !== fence; i += 1) code.push(lines[i]);
      out.push(el('pre', {}, [el('code', { text: code.join('\n') })]));
      i += 1;
    } else if ((match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      out.push(el('h' + Math.min(6, match[1].length + 1), {}, inline(match[2], resolve)));
      i += 1;
    } else if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(el('hr'));
      i += 1;
    } else if (/^>/.test(line)) {
      const quote = [];
      for (; i < lines.length && /^>/.test(lines[i]); i += 1) quote.push(lines[i].replace(/^>\s?/, ''));
      out.push(el('blockquote', {}, renderMarkdown(quote.join('\n'), resolve)));
    } else if (/^\|/.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      const head = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && /^\|/.test(lines[i]); i += 1) rows.push(cells(lines[i]));
      out.push(el('div', { class: 'table' }, [el('table', {}, [
        el('thead', {}, [el('tr', {}, head.map(function (cell) { return el('th', {}, inline(cell, resolve)); }))]),
        el('tbody', {}, rows.map(function (row) { return el('tr', {}, row.map(function (cell) { return el('td', {}, inline(cell, resolve)); })); })),
      ])]));
    } else if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && lines[i].trim()) {
        const item = LIST_ITEM.exec(lines[i]);
        // A top-level item of the other kind starts a new list.
        if (item && items.length && !item[1] && /^\s*\d/.test(lines[i]) !== ordered) break;
        if (item) items.push({ depth: Math.floor(item[1].replace(/\t/g, '  ').length / 2), text: item[2] });
        else if (items.length && !BLOCK_START.test(lines[i])) items[items.length - 1].text += ' ' + lines[i].trim();
        else break;
        i += 1;
      }
      out.push(el(ordered ? 'ol' : 'ul', {}, items.map(function (item) {
        return el('li', { class: item.depth ? 'nested' : undefined, style: item.depth ? 'margin-left:' + item.depth * 1.4 + 'em' : undefined }, listItem(item.text, resolve));
      })));
    } else {
      const text = [];
      while (i < lines.length && lines[i].trim() && (text.length === 0 || !BLOCK_START.test(lines[i]))) { text.push(lines[i].trim()); i += 1; }
      // A line break inside a paragraph stays one: agents write facts line by line.
      const nodes = [];
      text.forEach(function (part, index) { if (index) nodes.push(el('br')); Array.prototype.push.apply(nodes, inline(part, resolve)); });
      // A paragraph that is a single image shows it as a figure.
      out.push(nodes.length === 1 && nodes[0].tagName === 'IMG' ? el('figure', {}, nodes) : el('p', {}, nodes));
    }
  }
  return out;
}
