// The board navigation (ADR 0058): a bar across the top with fixed entries only – the work group and the library
// group, then + New as the one primary button, and Guide and Refresh set apart. It lists no project and no series;
// the project list (#/projects) does.
import { addStrings, el, go, t } from './lib.js';

addStrings({
  de: { board: 'Board', navWork: 'Arbeit', navLibrary: 'Bibliothek', navProduction: 'Produktion', navProjects: 'Projekte', navCalendar: 'Release-Kalender', navCharacters: 'Figuren', navSets: 'Sets', navSounds: 'Sounds', navNew: '+ Neu', navGuide: 'Anleitung', refresh: 'Aktualisieren', refreshKept: 'Ansicht behalten: ein Video läuft oder eine Eingabe ist nicht gespeichert.' },
  en: { board: 'Board', navWork: 'Work', navLibrary: 'Library', navProduction: 'Production', navProjects: 'Projects', navCalendar: 'Release calendar', navCharacters: 'Characters', navSets: 'Sets', navSounds: 'Sounds', navNew: '+ New', navGuide: 'Guide', refresh: 'Refresh', refreshKept: 'View kept: a video is playing or an input is not saved.' },
});

/** The fixed entries, in order: [key, string, hash]. */
export const NAV_GROUPS = [
  { label: 'navWork', entries: [['overview', 'navProduction', '#/'], ['projects', 'navProjects', '#/projects'], ['calendar', 'navCalendar', '#/calendar']] },
  { label: 'navLibrary', entries: [['characters', 'navCharacters', '#/characters'], ['sets', 'navSets', '#/sets'], ['sounds', 'navSounds', '#/sounds']] },
];

/** The entry a route marks: a project's views and a series mark Projects. */
export function activeEntry(active) {
  const kind = String(active || 'overview').split(':')[0];
  return kind === 'project' || kind === 'release' || kind === 'review' || kind === 'series' ? 'projects' : kind;
}

function entry(text, hash, selected, className) {
  return el('button', { class: className + (selected ? ' active' : ''), 'aria-current': selected ? 'page' : null, onclick: function () { go(hash); } }, [text]);
}

/** Draw the bar into `container`: `active` is the route's view key, `kept` whether the last refresh kept the view. */
export function renderNav(container, active, kept, onRefresh) {
  const current = activeEntry(active);
  container.innerHTML = '';
  container.appendChild(el('span', { class: 'brand', text: t('board') }));
  const groups = el('nav', { class: 'nav-groups', 'aria-label': t('board') }, NAV_GROUPS.map(function (group) {
    return el('div', { class: 'nav-group', role: 'group', 'aria-label': t(group.label) }, [el('span', { class: 'nav-label', text: t(group.label) })].concat(group.entries.map(function (item) {
      return entry(t(item[1]), item[2], current === item[0], 'nav-item');
    })));
  }));
  container.appendChild(groups);
  container.appendChild(el('div', { class: 'nav-tools' }, [
    entry(t('navNew'), '#/new', current === 'new', 'primary nav-new'),
    el('span', { class: 'nav-apart' }, [
      entry(t('navGuide'), '#/guide', current === 'guide', 'small nav-guide'),
      el('button', { class: 'small refresh', text: '↻ ' + t('refresh'), onclick: onRefresh })
    ])
  ]));
  if (kept) container.appendChild(el('p', { class: 'refresh-kept', role: 'status', text: t('refreshKept') }));
}

/** Whether a refresh keeps the view in `main`: a video or audio plays, or a field holds unsaved input (ADR 0049). */
export function viewBusy(main) {
  const playing = Array.prototype.some.call(main.querySelectorAll('video, audio'), function (media) { return !media.paused && !media.ended; });
  return playing || main.querySelector('[data-edited]') !== null;
}
