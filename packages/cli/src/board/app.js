// The board's shell: navigation, routes, and the refresh of the production pages.
//   #/               production overview      #/calendar               release calendar
//   #/p/<slug>       a project's production   #/p/<slug>/release[/<platform>[/<event>]]
//   #/p/<slug>/review[/<render>]             the review player
//   #/s/<slug>       a series                #/new[/video|series|episode[/<slug>]]  the wizard
import { addStrings, api, el, go, showError, t } from './lib.js';
import { currentProductionKey, forgetProduction, showProduction } from './production.js';
import { onReleaseChange, showCalendar, showRelease } from './release.js';
import { showReview } from './review.js';
import { showWizard } from './wizard.js';

addStrings({
  de: { board: 'Board', navProduction: 'Produktion', navCalendar: 'Release-Kalender', navNew: '+ Neu' },
  en: { board: 'Board', navProduction: 'Production', navCalendar: 'Release calendar', navNew: '+ New' },
});

const REFRESH_MS = 10000;
let active = 'overview';
let overview = { projects: [], series: [] };
let releases = {};

function navButton(text, sub, selected, hash, dot) {
  return el('button', { class: 'nav-item' + (selected ? ' active' : ''), onclick: function () { go(hash); } }, [
    dot ? el('span', { class: 'dot ' + dot }) : null, text, sub ? el('span', { class: 'sub', text: sub }) : null
  ]);
}

function renderNav() {
  document.getElementById('board-title').textContent = t('board');
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  nav.appendChild(navButton(t('navProduction'), null, active === 'overview', '#/'));
  nav.appendChild(navButton(t('navCalendar'), null, active === 'calendar', '#/calendar'));
  nav.appendChild(navButton(t('navNew'), null, active === 'new', '#/new'));
  if (overview.projects.length) nav.appendChild(el('h2', { text: t('projects') }));
  overview.projects.forEach(function (project) {
    if (project.error) { nav.appendChild(el('div', { class: 'nav-item error', text: project.slug + ': ' + project.error })); return; }
    const release = releases[project.slug];
    const current = project.stages.filter(function (s) { return s.id === project.current; })[0];
    const sub = release && release.total && project.phase === 'done' ? (release.releaseDate || '—') + ' · ' + release.done + '/' + release.total : current ? current.label : t('phases')[project.phase];
    nav.appendChild(navButton(project.title, sub, active === 'project:' + project.slug || active === 'release:' + project.slug || active === 'review:' + project.slug, '#/p/' + project.slug, project.phase));
  });
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
  const hash = decodeURIComponent(location.hash || '#/');
  let match;
  if ((match = /^#\/new(?:\/(video|series|episode)(?:\/([a-z0-9-]+))?)?\/?$/.exec(hash))) { active = 'new'; forgetProduction(); showWizard(match[1], match[2]); }
  else if (hash === '#/calendar') { active = 'calendar'; forgetProduction(); showCalendar(); }
  else if ((match = /^#\/p\/([a-z0-9-]+)\/release(?:\/([a-z]+))?(?:\/(.+))?$/.exec(hash))) { active = 'release:' + match[1]; forgetProduction(); showRelease(match[1], match[2], match[3]); }
  else if ((match = /^#\/p\/([a-z0-9-]+)\/review(?:\/(.+))?$/.exec(hash))) { active = 'review:' + match[1]; forgetProduction(); showReview(match[1], match[2]); }
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

// The pipeline runs elsewhere (Claude Code, the queue, renders): poll while the page is visible.
setInterval(function () {
  if (document.visibilityState !== 'visible') return;
  loadNav();
  if (currentProductionKey() === active) showProduction(active, true);
}, REFRESH_MS);

loadNav().then(route);
