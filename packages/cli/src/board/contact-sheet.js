// The contact sheet tab of a project page (RM-ContactSheet): one card per shot of the resolved storyboard, in playing
// order, with its keyframe once assets/keyframes/<shot>.png exists, else a placeholder with the shot's source. The
// server builds it on every request, so the user's refresh shows a keyframe filed after the page loaded.
import { addStrings, api, el, projectFile, setLang, showError, t, viewTabs } from './lib.js';

addStrings({
  de: {
    sheetNone: 'Noch kein Storyboard.', sheetInvalid: 'Das Storyboard ist nicht gültig:', sheetUnchecked: 'Das Storyboard lässt sich nicht prüfen, weil das Projekt nicht gültig ist:', sheetEmpty: 'Das Storyboard hat keine Shots.',
    sheetShots: function (n) { return n + ' Shots'; }, sheetNoKeyframe: 'noch kein Keyframe',
    sources: { motion: 'Motion', 'ai-clip': 'AI-Clip', footage: 'Footage', mixed: 'Gemischt' }
  },
  en: {
    sheetNone: 'No storyboard yet.', sheetInvalid: 'The storyboard is not valid:', sheetUnchecked: 'The storyboard cannot be checked because the project is not valid:', sheetEmpty: 'The storyboard has no shots.',
    sheetShots: function (n) { return n + ' shots'; }, sheetNoKeyframe: 'no keyframe yet',
    sources: { motion: 'Motion', 'ai-clip': 'AI clip', footage: 'Footage', mixed: 'Mixed' }
  }
});

/** Seconds as m:ss.s. */
export function clock(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds - minutes * 60).toFixed(1);
  return minutes + ':' + (rest.length < 4 ? '0' : '') + rest;
}

function sourceLabel(source) { return t('sources')[source] || source; }

/** One shot's card: the keyframe, opening full size, or a placeholder with the source; then the shot's facts. */
export function shotCard(slug, card) {
  const file = card.keyframe && projectFile(slug, card.keyframe.path) + '?v=' + encodeURIComponent(card.keyframe.modified);
  return el('figure', { class: 'sheet-card', 'data-shot': card.id }, [
    file
      ? el('a', { class: 'sheet-frame', href: file, target: '_blank', rel: 'noopener' }, [el('img', { src: file, loading: 'lazy', alt: card.id })])
      : el('div', { class: 'sheet-frame placeholder' }, [el('b', { text: sourceLabel(card.source) }), el('span', { text: t('sheetNoKeyframe') })]),
    el('figcaption', {}, [
      el('div', { class: 'sheet-head' }, [el('b', { text: card.id }), el('span', { class: 'chip', text: sourceLabel(card.source) })]),
      el('div', { class: 'sub', text: card.section + ' · ' + clock(card.startSeconds) + '–' + clock(card.endSeconds) }),
      el('p', { text: card.description }),
      card.text ? el('p', { class: 'sheet-text', text: '“' + card.text + '”' }) : null
    ])
  ]);
}

/** What the tab shows for a contact sheet: no storyboard, the validation error, or the grid. */
export function sheetBody(slug, sheet) {
  if (sheet.status === 'none') return [el('p', { class: 'empty', text: t('sheetNone') })];
  if (sheet.status === 'invalid') {
    return [el('div', { class: 'card sheet-invalid' }, [
      el('p', { class: 'error', text: (sheet.scope === 'storyboard' ? t('sheetInvalid') : t('sheetUnchecked')) + ' ' + sheet.error }),
      sheet.details.length ? el('ul', {}, sheet.details.map(function (line) { return el('li', { class: 'error', text: line }); })) : null
    ])];
  }
  if (!sheet.cards.length) return [el('p', { class: 'empty', text: t('sheetEmpty') })];
  return [
    el('p', { class: 'sub', text: t('sheetShots')(sheet.cards.length) + ' · ' + clock(sheet.durationSeconds) }),
    el('div', { class: 'sheet' }, sheet.cards.map(function (card) { return shotCard(slug, card); }))
  ];
}

/** The contact sheet tab of a project: `#/p/<slug>/contact-sheet`. */
export function showContactSheet(slug) {
  setLang(null);
  const base = '/api/production/projects/' + encodeURIComponent(slug);
  return Promise.all([api(base), api(base + '/contact-sheet')]).then(function (both) {
    const p = both[0];
    const main = document.getElementById('main');
    main.innerHTML = '';
    main.appendChild(el('header', { class: 'project' }, [el('h2', { text: (p.artist ? p.artist + ' – ' : '') + p.title })]));
    main.appendChild(viewTabs(slug, 'contact-sheet', p.hasRelease));
    sheetBody(slug, both[1]).forEach(function (node) { main.appendChild(node); });
  }).catch(showError);
}
