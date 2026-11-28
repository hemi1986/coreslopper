// The project list (#/projects, ADR 0058): every music video, meme, episode and series as one row of a table, newest
// activity first. Search, filters, sort and the series grouping live in the address hash
// (`#/projects?q=…&kind=…&status=…&series=…&group=series&sort=title&dir=asc`), so a refresh, Back and a link keep
// them. It reads /api/production and /api/projects and writes nothing.
import { addStrings, ago, api, el, go, local, setLang, showError, t } from './lib.js';

addStrings({
  de: {
    plTitle: 'Projekte', plEmpty: 'Noch keine Projekte', plNew: '+ Neu', plNoMatch: 'Kein Projekt passt zu diesen Filtern', plReset: 'Filter zurücksetzen',
    plSearch: 'Suche in Titel und Slug …', plKind: 'Art', plStatus: 'Status', plSeries: 'Serie', plAll: 'alle', plGroup: 'Nach Serie gruppieren',
    plKinds: { video: 'Musikvideo', episode: 'Folge', meme: 'Meme', series: 'Serie' },
    plStates: { yours: 'Du bist dran', running: 'Läuft', done: 'Fertig', released: 'Veröffentlicht' },
    plPlanned: 'geplant', plNoSeries: 'Ohne Serie', plUnreadable: 'nicht lesbar',
    plCols: { title: 'Titel', kind: 'Art', status: 'Status', phase: 'Phase', next: 'Nächster Schritt', release: 'Veröffentlichung', activity: 'Letzte Aktivität' },
    plPhases: { setup: 'Setup', ready: 'Bereit', running: 'Läuft', failed: 'Fehlgeschlagen', done: 'Fertig' },
    plEpisode: function (n, series) { return 'Folge ' + n + (series ? ' · ' + series : ''); },
    plEpisodes: function (made, all) { return made + '/' + all + ' Folgen angelegt'; },
    plCount: function (n, all) { return n + ' von ' + all; },
    plNext: { release: 'Release freigeben', released: 'Der Autopilot postet', running: 'Läuft – nichts zu tun', 'internal-done': 'Fertig – nicht öffentlich', 'series-done': 'Alle Folgen angelegt' }
  },
  en: {
    plTitle: 'Projects', plEmpty: 'No projects yet', plNew: '+ New', plNoMatch: 'No project matches these filters', plReset: 'Reset filters',
    plSearch: 'Search title and slug …', plKind: 'Kind', plStatus: 'Status', plSeries: 'Series', plAll: 'all', plGroup: 'Group by series',
    plKinds: { video: 'Music video', episode: 'Episode', meme: 'Meme', series: 'Series' },
    plStates: { yours: 'Your turn', running: 'Running', done: 'Done', released: 'Released' },
    plPlanned: 'planned', plNoSeries: 'Not in a series', plUnreadable: 'unreadable',
    plCols: { title: 'Title', kind: 'Kind', status: 'Status', phase: 'Phase', next: 'Next step', release: 'Release day', activity: 'Last activity' },
    plPhases: { setup: 'Setup', ready: 'Ready', running: 'Running', failed: 'Failed', done: 'Done' },
    plEpisode: function (n, series) { return 'Episode ' + n + (series ? ' · ' + series : ''); },
    plEpisodes: function (made, all) { return made + '/' + all + ' episodes created'; },
    plCount: function (n, all) { return n + ' of ' + all; },
    plNext: { release: 'Approve the release', released: 'The autopilot posts', running: 'Running – nothing to do', 'internal-done': 'Done – not released publicly', 'series-done': 'Every planned episode exists' }
  }
});

/** The list's route; its query may hold any character, a decoded line break too. */
export const PROJECTS_ROUTE = /^#\/projects(?:\?[\s\S]*)?$/;

export const KINDS = ['video', 'episode', 'meme', 'series'];
export const STATES = ['yours', 'running', 'done', 'released'];
const SORTS = ['activity', 'title', 'release'];

function defaultDir(sort) { return sort === 'title' ? 'asc' : 'desc'; }

/** The list's state from the query of `#/projects?…`; unknown values are ignored. */
export function parseListState(query, seriesSlugs) {
  const params = new URLSearchParams(query || '');
  const list = function (key, known) {
    const seen = [];
    (params.get(key) || '').split(',').forEach(function (value) { if (known.indexOf(value) >= 0 && seen.indexOf(value) < 0) seen.push(value); });
    return seen;
  };
  const sort = SORTS.indexOf(params.get('sort')) >= 0 ? params.get('sort') : 'activity';
  const dir = params.get('dir') === 'asc' || params.get('dir') === 'desc' ? params.get('dir') : defaultDir(sort);
  const series = params.get('series') || '';
  return {
    q: params.get('q') || '',
    kind: list('kind', KINDS),
    status: list('status', STATES),
    series: series && (!seriesSlugs || seriesSlugs.indexOf(series) >= 0) ? series : '',
    group: params.get('group') === 'series',
    sort: sort,
    dir: dir
  };
}

/** The address of a list state; defaults are left out. */
export function listHash(state) {
  const parts = [];
  if (state.q) parts.push('q=' + encodeURIComponent(state.q));
  if (state.kind.length) parts.push('kind=' + state.kind.join(','));
  if (state.status.length) parts.push('status=' + state.status.join(','));
  if (state.series) parts.push('series=' + encodeURIComponent(state.series));
  if (state.group) parts.push('group=series');
  if (state.sort !== 'activity') parts.push('sort=' + state.sort);
  if (state.dir !== defaultDir(state.sort)) parts.push('dir=' + state.dir);
  return '#/projects' + (parts.length ? '?' + parts.join('&') : '');
}

/** The rule of the old Released group (G-208): done, and every release event ticked off or the release day past, or internal and done. */
export function isReleased(project, release, today) {
  if (project.next && project.next.reason === 'internal-done') return true;
  if (project.phase !== 'done' || !release) return false;
  return Boolean((release.total && release.done === release.total) || (release.releaseDate && release.releaseDate < today));
}

function projectState(project, release, today) {
  if (isReleased(project, release, today)) return 'released';
  if (project.next.reason === 'running') return 'running';
  return project.next.where !== 'none' ? 'yours' : 'done';
}

function localToday(now) {
  const d = now || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * One item per project and series of `/api/production`, with the release progress of `/api/projects` (`releases`, a
 * list), and the planned episodes of every series apart. `today` is the browser's date (YYYY-MM-DD).
 */
export function listItems(production, releases, today) {
  const bySlug = {};
  (releases || []).forEach(function (r) { if (!r.error) bySlug[r.slug] = r; });
  const seriesOf = {};
  const seriesTitle = {};
  production.series.forEach(function (s) {
    if (s.error) return;
    seriesTitle[s.slug] = s.title;
    s.episodes.forEach(function (e) { if (e.slug) seriesOf[e.slug] = s.slug; });
  });
  const items = production.projects.map(function (p) {
    if (p.error) return { kind: null, slug: p.slug, title: p.slug, error: p.error, state: null };
    const kind = p.kind === 'episode' ? 'episode' : p.kind === 'meme' ? 'meme' : 'video';
    const series = kind === 'episode' ? seriesOf[p.slug] || p.series : undefined;
    const release = bySlug[p.slug];
    const current = p.stages.filter(function (s) { return s.id === p.current; })[0];
    return {
      kind: kind, slug: p.slug, title: p.title, artist: p.artist, series: series, seriesTitle: series ? seriesTitle[series] || series : undefined, episode: p.episode,
      state: projectState(p, release, today), phase: p.phase, stage: p.phase !== 'done' && current ? current.label : undefined, next: p.next,
      releaseDate: (release && release.releaseDate) || p.releaseDate, releaseDone: release && release.total ? release.done : undefined, releaseTotal: release && release.total ? release.total : undefined,
      lastActivity: p.lastActivity, href: '#/p/' + p.slug
    };
  });
  const planned = {};
  production.series.forEach(function (s) {
    if (s.error) { items.push({ kind: 'series', slug: s.slug, title: s.slug, error: s.error, state: null }); return; }
    const episodes = items.filter(function (i) { return i.kind === 'episode' && i.series === s.slug; });
    const newest = episodes.map(function (i) { return i.lastActivity || ''; }).sort().pop();
    items.push({
      kind: 'series', slug: s.slug, title: s.title, state: s.next.where !== 'none' ? 'yours' : 'done', next: s.next,
      created: s.episodes.filter(function (e) { return e.slug; }).length, total: s.episodes.length,
      lastActivity: newest || undefined, href: '#/s/' + s.slug
    });
    planned[s.slug] = s.episodes.filter(function (e) { return !e.slug; }).map(function (e) {
      return { kind: 'episode', planned: true, slug: '', title: e.title, episode: e.episode, series: s.slug, seriesTitle: s.title, state: null };
    });
  });
  return { items: items, planned: planned };
}

function matches(item, state) {
  if (state.q && (item.title + ' ' + item.slug).toLowerCase().indexOf(state.q.toLowerCase()) < 0) return false;
  if (state.kind.length && state.kind.indexOf(item.kind) < 0) return false;
  if (state.status.length && state.status.indexOf(item.state) < 0) return false;
  if (state.series && !(item.kind === 'episode' && item.series === state.series)) return false;
  return true;
}

function sorted(items, state) {
  const sign = state.dir === 'asc' ? 1 : -1;
  const byTitle = function (a, b) { return a.title.localeCompare(b.title); };
  return items.slice().sort(function (a, b) {
    if (state.sort === 'title') return sign * byTitle(a, b);
    const key = state.sort === 'release' ? 'releaseDate' : 'lastActivity';
    const x = a[key] || '', y = b[key] || '';
    if (!x || !y) return x === y ? byTitle(a, b) : x ? -1 : 1; // without a value last, either way
    return x === y ? byTitle(a, b) : sign * (x < y ? -1 : 1);
  });
}

function anyFilter(state) { return Boolean(state.q || state.kind.length || state.status.length || state.series || state.group); }

/**
 * The rows to show: `{ item, indent, head, match }` (`match`: whether a series row matches itself, not only through
 * its episodes). Off, one flat list; grouped, every series row with its episodes below
 * it, the planned episodes after them while no search and no state filter is active, then the projects in no series.
 */
export function listRows(list, state) {
  const hit = list.items.filter(function (i) { return matches(i, state); });
  if (!state.group) return sorted(hit, state).map(function (item) { return { item: item }; });
  const heads = list.items.filter(function (i) { return i.kind === 'series' && !i.error; });
  const known = heads.map(function (s) { return s.slug; });
  const showPlanned = !state.q && !state.status.length && (!state.kind.length || state.kind.indexOf('episode') >= 0);
  const rows = [];
  sorted(heads, state).forEach(function (head) {
    if (state.series && head.slug !== state.series) return;
    const episodes = sorted(hit.filter(function (i) { return i.kind === 'episode' && i.series === head.slug; }), state);
    const planned = showPlanned ? list.planned[head.slug] || [] : [];
    const match = matches(head, state);
    if (!match && !episodes.length && !planned.length) return;
    rows.push({ item: head, head: true, match: match });
    episodes.concat(planned).forEach(function (item) { rows.push({ item: item, indent: true }); });
  });
  const rest = sorted(hit.filter(function (i) { return !(i.kind === 'series' && !i.error) && !(i.kind === 'episode' && known.indexOf(i.series) >= 0); }), state);
  if (rest.length && rows.length) rows.push({ divider: true });
  rest.forEach(function (item) { rows.push({ item: item }); });
  return rows;
}

// ---- drawing ----

let view = null; // { list, state, results, reset }

function setState(state, full) {
  view.state = state;
  const hash = listHash(state);
  // The list's state goes into the current history entry, so Back from a project returns to it; replacing it sends no
  // hashchange, so the search field keeps its focus while the user types.
  if (typeof history !== 'undefined' && history.replaceState) history.replaceState(null, '', hash);
  else location.hash = hash;
  if (full) draw(); else drawResults();
}

function toggle(values, value) {
  return values.indexOf(value) >= 0 ? values.filter(function (v) { return v !== value; }) : values.concat([value]);
}

function quiet(event) { if (event && event.stopPropagation) event.stopPropagation(); }

function chips(label, key, values, names) {
  return el('div', { class: 'pl-filter', role: 'group', 'aria-label': t(label) }, [el('span', { class: 'pl-label', text: t(label) })].concat(values.map(function (value) {
    const on = view.state[key].indexOf(value) >= 0;
    return el('button', { class: 'pl-chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-value': value, onclick: function () {
      const next = Object.assign({}, view.state); next[key] = toggle(view.state[key], value); setState(next, true);
    } }, [t(names)[value]]);
  })));
}

function resetButton(className) {
  return el('button', { class: className, onclick: function () { setState(parseListState(''), true); } }, [t('plReset')]);
}

function filterBar() {
  const state = view.state;
  view.reset = el('span', { class: 'pl-reset' });
  const search = el('input', { type: 'search', class: 'pl-search', placeholder: t('plSearch'), 'aria-label': t('plSearch'), value: state.q, oninput: function (event) {
    // The search is in the address, so a refresh need not keep the view for it (app.js marks other input as edited).
    quiet(event);
    setState(Object.assign({}, view.state, { q: event.target.value }), false);
  } });
  search.value = state.q;
  const series = view.list.items.filter(function (i) { return i.kind === 'series' && !i.error; });
  const select = el('select', { class: 'pl-select', 'aria-label': t('plSeries'), oninput: quiet, onchange: function (event) {
    setState(Object.assign({}, view.state, { series: event.target.value }), true);
  } }, [el('option', { value: '', text: t('plAll') })].concat(series.map(function (s) {
    return el('option', { value: s.slug, selected: s.slug === state.series, text: s.title });
  })));
  select.value = state.series;
  const group = el('input', { type: 'checkbox', class: 'pl-group', checked: state.group, oninput: quiet, onchange: function (event) {
    setState(Object.assign({}, view.state, { group: Boolean(event.target.checked) }), true);
  } });
  group.checked = state.group;
  return el('div', { class: 'pl-filters' }, [
    search,
    chips('plKind', 'kind', KINDS, 'plKinds'),
    chips('plStatus', 'status', STATES, 'plStates'),
    el('label', { class: 'pl-filter' }, [el('span', { class: 'pl-label', text: t('plSeries') }), select]),
    el('label', { class: 'pl-filter pl-switch' }, [group, ' ' + t('plGroup')]),
    view.reset
  ]);
}

function header() {
  const cols = t('plCols');
  const th = function (col, sortable) {
    if (!sortable) return el('th', { text: cols[col] });
    const on = view.state.sort === col;
    return el('th', { class: 'pl-sort' + (on ? ' on' : ''), 'data-sort': col, 'aria-sort': on ? (view.state.dir === 'asc' ? 'ascending' : 'descending') : null, onclick: function () {
      const next = Object.assign({}, view.state);
      if (on) next.dir = view.state.dir === 'asc' ? 'desc' : 'asc';
      else { next.sort = col; next.dir = defaultDir(col); }
      setState(next, false);
    } }, [cols[col] + (on ? (view.state.dir === 'asc' ? ' ▲' : ' ▼') : '')]);
  };
  return el('thead', {}, [el('tr', {}, [th('title', true), th('kind'), th('status'), th('phase'), th('next'), th('release', true), th('activity', true)])]);
}

function kindText(item) {
  if (item.kind === 'episode') return t('plEpisode')(item.episode !== undefined ? item.episode : '?', item.seriesTitle);
  return item.kind ? t('plKinds')[item.kind] : '';
}

function nextCell(item) {
  if (!item.next) return '';
  if (item.next.command) return el('code', { text: item.next.command });
  return t('plNext')[item.next.reason] || item.next.reason;
}

function row(entry) {
  if (entry.divider) return el('tr', { class: 'pl-divider' }, [el('td', { colspan: '7', text: t('plNoSeries') })]);
  const item = entry.item;
  const cls = (entry.indent ? 'pl-indent ' : '') + (entry.head ? 'pl-head ' : '');
  if (item.error) return el('tr', { class: cls + 'pl-error' }, [
    el('td', {}, [el('b', { text: item.slug })]), el('td', { text: kindText(item) }),
    el('td', {}, [el('span', { class: 'pill failed', text: t('plUnreadable') })]), el('td', { colspan: '4', class: 'error', text: item.error })
  ]);
  if (item.planned) return el('tr', { class: cls + 'pl-planned' }, [
    el('td', { text: item.title }), el('td', { text: kindText(item) }), el('td', {}, [el('span', { class: 'pill', text: t('plPlanned') })]),
    el('td', { text: '' }), el('td', { text: '' }), el('td', { text: '' }), el('td', { text: '' })
  ]);
  const phase = item.kind === 'series' ? t('plEpisodes')(item.created, item.total) : item.stage || t('plPhases')[item.phase] || '';
  const release = item.releaseDate ? item.releaseDate + (item.releaseTotal ? ' · ' + item.releaseDone + '/' + item.releaseTotal : '') : '—';
  return el('tr', { class: cls + 'link-row', 'data-slug': item.slug, onclick: function () { go(item.href); } }, [
    el('td', {}, [el('b', { text: (item.artist ? item.artist + ' – ' : '') + item.title }), el('span', { class: 'sub', text: item.slug })]),
    el('td', { text: kindText(item) }),
    el('td', {}, [el('span', { class: 'pill pl-' + item.state, text: t('plStates')[item.state] })]),
    el('td', { text: phase }),
    el('td', {}, [nextCell(item)]),
    el('td', { class: 'num', text: release }),
    el('td', { class: 'num', title: item.lastActivity ? local(item.lastActivity) : null, text: item.lastActivity ? ago(item.lastActivity) : '—' })
  ]);
}

function drawResults() {
  const results = view.results;
  results.innerHTML = '';
  // The search redraws only the results, so the reset button of the bar is drawn here too.
  view.reset.innerHTML = '';
  if (anyFilter(view.state)) view.reset.appendChild(resetButton('small'));
  const rows = listRows(view.list, view.state);
  if (!rows.length) {
    results.appendChild(el('div', { class: 'empty pl-nomatch' }, [el('p', { text: t('plNoMatch') }), resetButton('primary')]));
    return;
  }
  const shown = rows.filter(function (r) { return r.item && !r.item.planned && (!r.head || r.match); }).length;
  results.appendChild(el('p', { class: 'sub pl-count', text: t('plCount')(shown, view.list.items.length) }));
  results.appendChild(el('table', { class: 'list pl-table' }, [header(), el('tbody', {}, rows.map(row))]));
}

function draw() {
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.appendChild(el('h2', { text: t('plTitle'), style: 'margin:0 0 14px;font-size:20px' }));
  if (!view.list.items.length) {
    main.appendChild(el('div', { class: 'empty pl-empty' }, [el('p', { text: t('plEmpty') }), el('a', { href: '#/new', class: 'pl-new', text: t('plNew') })]));
    return;
  }
  main.appendChild(filterBar());
  view.results = el('div', { class: 'pl-results' });
  main.appendChild(view.results);
  drawResults();
}

/** Show the list for the current address. */
export function showProjects() {
  setLang(null);
  const hash = location.hash || '';
  const query = hash.indexOf('?') >= 0 ? hash.slice(hash.indexOf('?') + 1) : '';
  return Promise.all([api('/api/production'), api('/api/projects')]).then(function (both) {
    const list = listItems(both[0], both[1], localToday());
    const slugs = list.items.filter(function (i) { return i.kind === 'series' && !i.error; }).map(function (i) { return i.slug; });
    view = { list: list, state: parseListState(query, slugs), results: null, reset: null };
    draw();
  }).catch(showError);
}
