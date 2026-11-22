// The board's shell: navigation, routes, and the user's refresh.
//   #/               production overview      #/calendar               release calendar
//   #/p/<slug>       a project's production   #/p/<slug>/release[/<platform>[/<event>]]
//   #/p/<slug>/review[/<render>]             the review player
//   #/p/<slug>/doc/<path>                    a project document (brief, treatment, …)
//   #/s/<slug>       a series                #/new[/video|series|episode[/<slug>]]  the wizard
//   #/characters[/<id>]                     the character library
//   #/guide[/<doc>]                          the board guide, or another page of docs/
import { addStrings, api, el, go, showError, t } from './lib.js';
import { showDocument, showProduction } from './production.js';
import { onReleaseChange, showCalendar, showRelease } from './release.js';
import { showReview } from './review.js';
import { showWizard } from './wizard.js';
import { showCharacters } from './characters.js';
import { showGuide } from './guide.js';

addStrings({
  de: { board: 'Board', navProduction: 'Produktion', navCalendar: 'Release-Kalender', navCharacters: 'Figuren', navNew: '+ Neu', navGuide: 'Anleitung', refresh: 'Aktualisieren', refreshKept: 'Ansicht behalten: ein Video läuft oder eine Eingabe ist nicht gespeichert.', navReleased: 'Veröffentlicht' },
  en: { board: 'Board', navProduction: 'Production', navCalendar: 'Release calendar', navCharacters: 'Characters', navNew: '+ New', navGuide: 'Guide', refresh: 'Refresh', refreshKept: 'View kept: a video is playing or an input is not saved.', navReleased: 'Released' },
});

let active = 'overview';
let overview = { projects: [], series: [] };
let releases = {};
let kept = false;
let releasedOpen = false;

function navButton(text, sub, selected, hash, dot) {
  return el('button', { class: 'nav-item' + (selected ? ' active' : ''), onclick: function () { go(hash); } }, [
    dot ? el('span', { class: 'dot ' + dot }) : null, text, sub ? el('span', { class: 'sub', text: sub }) : null
  ]);
}

function renderNav() {
  document.getElementById('board-title').textContent = t('board');
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  nav.appendChild(el('button', { class: 'small refresh', text: '↻ ' + t('refresh'), onclick: refresh }));
  if (kept) nav.appendChild(el('p', { class: 'sub refresh-kept', text: t('refreshKept') }));
  nav.appendChild(navButton(t('navProduction'), null, active === 'overview', '#/'));
  nav.appendChild(navButton(t('navCalendar'), null, active === 'calendar', '#/calendar'));
  nav.appendChild(navButton(t('navCharacters'), null, active === 'characters', '#/characters'));
  nav.appendChild(navButton(t('navNew'), null, active === 'new', '#/new'));
  nav.appendChild(navButton(t('navGuide'), null, active === 'guide', '#/guide'));
  if (overview.projects.length) nav.appendChild(el('h2', { text: t('projects') }));
  // A released project folds away below the others (G-208): done, and every release event ticked off or the
  // release day past – the user may post by hand without ticking.
  const released = [];
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  function isReleased(project, release) {
    if (project.phase !== 'done' || !release) return false;
    return Boolean((release.total && release.done === release.total) || (release.releaseDate && release.releaseDate < today));
  }
  overview.projects.forEach(function (project) {
    if (project.error) { nav.appendChild(el('div', { class: 'nav-item error', text: project.slug + ': ' + project.error })); return; }
    const release = releases[project.slug];
    const current = project.stages.filter(function (s) { return s.id === project.current; })[0];
    const sub = release && release.total && project.phase === 'done' ? (release.releaseDate || '—') + ' · ' + release.done + '/' + release.total : current ? current.label : t('phases')[project.phase];
    const selected = active === 'project:' + project.slug || active === 'release:' + project.slug || active === 'review:' + project.slug;
    const button = navButton(project.title, sub, selected, '#/p/' + project.slug, project.phase);
    if (isReleased(project, release)) released.push({ button: button, selected: selected });
    else nav.appendChild(button);
  });
  if (released.length) {
    const open = releasedOpen || released.some(function (entry) { return entry.selected; });
    const group = el('details', { class: 'nav-group', open: open }, [el('summary', { text: t('navReleased') + ' (' + released.length + ')' })].concat(released.map(function (entry) { return entry.button; })));
    group.addEventListener('toggle', function () { releasedOpen = group.open; });
    nav.appendChild(group);
  }
  if (overview.series.length) nav.appendChild(el('h2', { text: t('series') }));
  overview.series.forEach(function (series) {
    if (series.error) { nav.appendChild(el('div', { class: 'nav-item error', text: series.slug + ': ' + series.error })); return; }
    nav.appendChild(navButton(series.title, series.episodes.filter(function (e) { return e.slug; }).length + '/' + series.episodes.length + ' ' + t('episodes'), active === 'series:' + series.slug, '#/s/' + series.slug));
  });
}

function loadNav() {
  return Promise.all([
    api('/api/production').then(function (data) { overview = data; }),
    api('/api/projects').then(function (list) { releases = {}; list.forEach(function (p) { if (!p.error) releases[p.slug] = p; }); })
  ]).then(renderNav).catch(showError);
}

function route() {
  kept = false;
  const hash = decodeURIComponent(location.hash || '#/');
  let match;
  if ((match = /^#\/new(?:\/(video|series|episode)(?:\/([a-z0-9-]+))?)?\/?$/.exec(hash))) { active = 'new'; showWizard(match[1], match[2]); }
  else if (hash === '#/calendar') { active = 'calendar'; showCalendar(); }
  else if ((match = /^#\/guide(?:\/([a-z][a-z0-9-]*(?:\.de)?))?\/?$/.exec(hash))) { active = 'guide'; showGuide(match[1]); }
  else if ((match = /^#\/characters(?:\/([a-z0-9][a-z0-9_-]*))?\/?$/.exec(hash))) { active = 'characters'; showCharacters(match[1]); }
  else if ((match = /^#\/p\/([a-z0-9-]+)\/release(?:\/([a-z]+))?(?:\/(.+))?$/.exec(hash))) { active = 'release:' + match[1]; showRelease(match[1], match[2], match[3]); }
  else if ((match = /^#\/p\/([a-z0-9-]+)\/doc\/(.+)$/.exec(hash))) { active = 'project:' + match[1]; showDocument(match[1], match[2]); }
  else if ((match = /^#\/p\/([a-z0-9-]+)\/review(?:\/(.+))?$/.exec(hash))) { active = 'review:' + match[1]; showReview(match[1], match[2]); }
  else if ((match = /^#\/p\/([a-z0-9-]+)\/([a-z]+)$/.exec(hash))) { go('#/p/' + match[1] + '/release/' + match[2]); return; } // the release board's old links
  else if ((match = /^#\/p\/([a-z0-9-]+)\/?$/.exec(hash))) { active = 'project:' + match[1]; showProduction(active); }
  else if ((match = /^#\/s\/([a-z0-9-]+)\/?$/.exec(hash))) { active = 'series:' + match[1]; showProduction(active); }
  else { active = 'overview'; showProduction('overview'); }
  renderNav();
}

onReleaseChange(loadNav);
window.addEventListener('hashchange', route);
api('/api/channel').then(function (channel) {
  if (channel.motto) { document.getElementById('motto').textContent = channel.motto; document.body.classList.add('has-motto'); }
}).catch(function () {});

// The pipeline runs elsewhere (Claude Code, the queue, renders), and the page does not poll (ADR 0049): the user
// refreshes. A refresh reloads the navigation and the current view, but keeps a view with a playing video or an
// edited field, so it never restarts the video or discards what the user typed.
const main = document.getElementById('main');
main.addEventListener('input', function (event) { if (event.target && event.target.setAttribute) event.target.setAttribute('data-edited', ''); });

function busy() {
  const playing = Array.prototype.some.call(main.querySelectorAll('video'), function (video) { return !video.paused && !video.ended; });
  return playing || main.querySelector('[data-edited]') !== null;
}

function refresh() {
  if (busy()) { kept = true; loadNav(); return; }
  loadNav().then(route);
}

loadNav().then(route);
