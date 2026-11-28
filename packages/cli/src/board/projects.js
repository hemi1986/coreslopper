// The project list (#/projects, ADR 0058). A placeholder until ST-057 builds the table with search, filters and
// series groups: every project and series as a link, an unreadable one with its error.
import { addStrings, api, el, go, setLang, showError, t } from './lib.js';

addStrings({
  de: { listProjects: 'Projekte', listSeries: 'Serien', listEmpty: 'Noch keine Projekte.' },
  en: { listProjects: 'Projects', listSeries: 'Series', listEmpty: 'No projects yet.' },
});

function row(item, hash) {
  if (item.error) return el('tr', {}, [el('td', { text: item.slug }), el('td', { class: 'error', text: item.error })]);
  return el('tr', { class: 'link-row', onclick: function () { go(hash + item.slug); } }, [el('td', {}, [el('b', { text: item.title })]), el('td', { class: 'sub', text: item.slug })]);
}

function table(items, hash) {
  return el('table', { class: 'list' }, [el('tbody', {}, items.map(function (item) { return row(item, hash); }))]);
}

export function showProjects() {
  setLang(null);
  return api('/api/production').then(function (data) {
    const main = document.getElementById('main');
    main.innerHTML = '';
    main.appendChild(el('h2', { text: t('listProjects'), style: 'margin:0 0 14px;font-size:20px' }));
    if (!data.projects.length && !data.series.length) { main.appendChild(el('p', { class: 'empty', text: t('listEmpty') })); return; }
    if (data.projects.length) main.appendChild(table(data.projects, '#/p/'));
    if (data.series.length) {
      main.appendChild(el('h3', { class: 'section-title', text: t('listSeries') }));
      main.appendChild(table(data.series, '#/s/'));
    }
  }).catch(showError);
}
