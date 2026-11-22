// The workspace's docs on the board, read from docs/ of the workspace, so they match its version and work offline.
//   #/guide          the board guide in the browser's language
//   #/guide/<doc>    docs/<doc>.md (top-level docs only; links between them stay on the board)
import { addStrings, el, getLang, setLang, showError, t } from './lib.js';
import { renderMarkdown } from './markdown.js';

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

export function showGuide(doc) {
  setLang(null);
  const name = doc && DOC.test(doc) ? doc : guideDoc();
  const main = document.getElementById('main');
  return fetch('/docs/' + name + '.md').then(function (res) {
    if (!res.ok) throw new Error(t('guideMissing') + ' (docs/' + name + '.md)');
    return res.text();
  }).then(function (source) {
    main.innerHTML = '';
    main.appendChild(el('article', { class: 'markdown' }, renderMarkdown(source, target)));
    window.scrollTo(0, 0);
  }).catch(showError);
}
