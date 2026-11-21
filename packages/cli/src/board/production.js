// The production view: every project and series as the pipeline leaves them,
// with the next step to take in Claude Code.
import { addStrings, ago, api, bytes, copyButton, el, go, local, projectFile, setLang, showError, t, usd, viewTabs } from './lib.js';

addStrings({
  de: {
    production: 'Produktion', projects: 'Projekte', series: 'Serien', noWork: 'Noch kein Projekt und keine Serie im Workspace.',
    groupYou: 'Du bist dran', groupRunning: 'Läuft', groupReleased: 'Freigegeben', groupBroken: 'Nicht lesbar',
    phases: { setup: 'Setup', ready: 'Bereit', running: 'Läuft', failed: 'Fehlgeschlagen', done: 'Fertig' },
    kindVideo: 'Musikvideo', kindEpisode: function (s, n) { return 'Episode ' + n + ' · ' + s; },
    budget: 'Budget', spent: 'ausgegeben', reserved: 'reserviert', since: 'seit', stage: 'Stage', status: 'Status', attempts: 'Versuche', when: 'Zeit', error: 'Fehler',
    queue: 'Generierungs-Queue', queueStates: { pending: 'offen', generating: 'generiert', reviewing: 'im Review', passed: 'bestanden', 'needs-fix': 'braucht Fix', error: 'Fehler' },
    reviews: 'Art-Director-Reviews', failedReviews: function (n) { return n + ' Review(s) nicht bestanden'; }, documents: 'Dokumente', renders: 'Renders', contact: 'Contact Sheet',
    noRenders: 'Noch kein Render.', interactiveNote: 'interaktiv',
    next: {
      interactive: function (s) { return 'In Claude Code weitermachen (' + s + '):'; },
      pipeline: function (s) { return 'Pipeline weiterlaufen lassen (' + s + '):'; },
      retry: function (s) { return s + ' ist fehlgeschlagen. Erneut starten:'; },
      running: function (s) { return s + ' läuft gerade. Nichts zu tun.'; },
      release: 'Fertig. Weiter im Release-Tab.', released: 'Release freigegeben: der Autopilot postet.',
      canon: 'Canon fertigstellen:', episode: 'Nächste geplante Episode anlegen:', 'series-done': 'Alle geplanten Episoden sind angelegt.'
    },
    canon: 'Canon', characters: 'Figuren', sets: 'Sets', episodes: 'Episoden', notCreated: 'nicht angelegt', gaps: 'Lücken im Canon', format: 'Format',
    uncommitted: 'frei', canonSpent: 'Canon', episodeBudgets: 'Episoden-Budgets', updated: 'aktualisiert vor'
  },
  en: {
    production: 'Production', projects: 'Projects', series: 'Series', noWork: 'No project or series in this workspace yet.',
    groupYou: 'Your turn', groupRunning: 'Running', groupReleased: 'Approved for release', groupBroken: 'Unreadable',
    phases: { setup: 'Setup', ready: 'Ready', running: 'Running', failed: 'Failed', done: 'Done' },
    kindVideo: 'Music video', kindEpisode: function (s, n) { return 'Episode ' + n + ' · ' + s; },
    budget: 'Budget', spent: 'spent', reserved: 'reserved', since: 'for', stage: 'Stage', status: 'Status', attempts: 'Attempts', when: 'Time', error: 'Error',
    queue: 'Generation queue', queueStates: { pending: 'pending', generating: 'generating', reviewing: 'in review', passed: 'passed', 'needs-fix': 'needs a fix', error: 'error' },
    reviews: 'Art-director reviews', failedReviews: function (n) { return n + ' review(s) failed'; }, documents: 'Documents', renders: 'Renders', contact: 'Contact sheet',
    noRenders: 'No render yet.', interactiveNote: 'interactive',
    next: {
      interactive: function (s) { return 'Continue in Claude Code (' + s + '):'; },
      pipeline: function (s) { return 'Let the pipeline continue (' + s + '):'; },
      retry: function (s) { return s + ' failed. Run it again:'; },
      running: function (s) { return s + ' is running. Nothing to do.'; },
      release: 'Done. Continue in the release tab.', released: 'Release approved: the autopilot posts.',
      canon: 'Finish the canon:', episode: 'Create the next planned episode:', 'series-done': 'Every planned episode exists.'
    },
    canon: 'Canon', characters: 'Characters', sets: 'Sets', episodes: 'Episodes', notCreated: 'not created', gaps: 'Gaps in the canon', format: 'Format',
    uncommitted: 'uncommitted', canonSpent: 'canon', episodeBudgets: 'episode budgets', updated: 'updated'
  }
});

const view = { key: null, json: null };

function stageLabel(project, id) {
  const stage = project.stages && project.stages.filter(function (s) { return s.id === id; })[0];
  return stage ? stage.label : id;
}

function nextBox(next, label, slug) {
  const words = t('next')[next.reason];
  const text = typeof words === 'function' ? words(label || next.stage || '') : words;
  const box = el('div', { class: 'next' }, [el('span', { text: text })]);
  if (next.command) box.appendChild(el('code', { text: next.command }));
  if (next.command) box.appendChild(copyButton(next.command, { copy: t('copy'), copied: t('copied') }));
  if (next.where === 'board' && slug) box.appendChild(el('a', { href: '#/p/' + slug + '/release', text: t('tabRelease') + ' →', onclick: function (e) { e.stopPropagation(); } }));
  return box;
}

function budgetBar(total, spent) {
  const share = total ? Math.min(100, Math.round(100 * spent / total)) : 0;
  return el('div', { class: 'budget' }, [el('i', { class: share >= 100 ? 'over' : share >= 80 ? 'high' : '', style: 'width:' + share + '%' })]);
}

function stageStrip(stages) {
  return el('div', { class: 'stages' }, stages.map(function (stage) {
    return el('i', { class: stage.status + (stage.interactive ? ' interactive' : ''), title: stage.label + ': ' + stage.status });
  }));
}

function kindLabel(project) {
  return project.kind === 'episode' ? t('kindEpisode')(project.series, project.episode) : t('kindVideo');
}

function queueLine(queue) {
  return Object.keys(queue).map(function (status) { return queue[status] + ' ' + (t('queueStates')[status] || status); }).join(' · ');
}

function projectCard(project) {
  if (project.error) return el('section', { class: 'card' }, [el('h3', { text: project.slug }), el('p', { class: 'error', text: project.error })]);
  const current = project.stages.filter(function (s) { return s.id === project.current; })[0];
  const running = current && current.status === 'running';
  return el('section', { class: 'card', onclick: function () { go('#/p/' + project.slug); } }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: (project.artist ? project.artist + ' – ' : '') + project.title }),
      el('span', { class: 'phase ' + project.phase, text: t('phases')[project.phase] })
    ]),
    el('div', { class: 'meta' }, [kindLabel(project), project.releaseDate ? ' · ' + t('release') + ' ' + project.releaseDate : null]),
    stageStrip(project.stages),
    current ? el('div', { class: 'meta' }, [el('b', { text: current.label }), running && current.startedAt ? ' · ' + t('since') + ' ' + ago(current.startedAt) : null, current.lastError && current.status === 'failed' ? el('div', { class: 'error', text: current.lastError }) : null]) : null,
    el('div', { class: 'meta' }, [t('budget') + ': ' + usd(project.budget.spentUsd) + ' / ' + usd(project.budget.totalUsd)]),
    budgetBar(project.budget.totalUsd, project.budget.spentUsd),
    project.queue ? el('div', { class: 'meta' }, [t('queue') + ': ' + queueLine(project.queue)]) : null,
    project.failedReviews ? el('div', { class: 'meta error', text: t('failedReviews')(project.failedReviews) }) : null,
    nextBox(project.next, project.next.stage && stageLabel(project, project.next.stage), project.slug)
  ]);
}

function seriesCard(series) {
  if (series.error) return el('section', { class: 'card' }, [el('h3', { text: series.slug }), el('p', { class: 'error', text: series.error })]);
  const created = series.episodes.filter(function (e) { return e.slug; }).length;
  return el('section', { class: 'card', onclick: function () { go('#/s/' + series.slug); } }, [
    el('div', { class: 'card-head' }, [el('h3', { text: series.title }), el('span', { class: 'chip', text: series.format })]),
    el('div', { class: 'meta' }, [t('characters') + ' ' + series.characters + ' · ' + t('sets') + ' ' + series.sets + ' · ' + t('episodes') + ' ' + created + '/' + series.episodes.length]),
    series.budget.totalUsd !== undefined ? budgetBar(series.budget.totalUsd, series.budget.canonSpentUsd + series.budget.episodeBudgetsUsd) : null,
    series.canonGaps.length ? el('div', { class: 'meta error', text: t('gaps') + ': ' + series.canonGaps.length }) : null,
    nextBox(series.next)
  ]);
}

function group(title, cards) {
  if (!cards.length) return null;
  return el('div', {}, [el('h3', { class: 'section-title', text: title }), el('div', { class: 'grid' }, cards)]);
}

function renderOverview(data) {
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.appendChild(el('div', { class: 'toolbar' }, [el('h2', { text: t('production'), style: 'margin:0;font-size:20px' })]));
  if (!data.projects.length && !data.series.length) { main.appendChild(el('p', { class: 'empty', text: t('noWork') })); return; }
  const ok = data.projects.filter(function (p) { return !p.error; });
  const order = { failed: 0, setup: 1, ready: 2, done: 3, running: 4 };
  const yours = ok.filter(function (p) { return p.next.where !== 'none'; }).sort(function (a, b) { return order[a.phase] - order[b.phase]; });
  [
    group(t('groupYou'), yours.map(projectCard)),
    group(t('groupRunning'), ok.filter(function (p) { return p.next.reason === 'running'; }).map(projectCard)),
    group(t('series'), data.series.map(seriesCard)),
    group(t('groupReleased'), ok.filter(function (p) { return p.next.reason === 'released'; }).map(projectCard)),
    group(t('groupBroken'), data.projects.filter(function (p) { return p.error; }).map(projectCard))
  ].forEach(function (node) { if (node) main.appendChild(node); });
}

function section(title, children) {
  return el('section', { class: 'card' }, [el('h3', { text: title, style: 'margin:0 0 10px;font-size:15px' })].concat(children));
}

function renderProject(p) {
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.appendChild(el('header', { class: 'project' }, [
    el('h2', { text: (p.artist ? p.artist + ' – ' : '') + p.title }),
    el('span', { class: 'phase ' + p.phase, text: t('phases')[p.phase] }),
    el('span', { class: 'chip', text: kindLabel(p) }),
    p.updatedAt ? el('span', { class: 'sub', text: t('updated') + ' ' + ago(p.updatedAt) }) : null
  ]));
  main.appendChild(viewTabs(p.slug, 'production', p.hasRelease));
  main.appendChild(nextBox(p.next, p.next.stage && stageLabel(p, p.next.stage), p.slug));
  main.appendChild(el('div', { style: 'height:14px' }));

  main.appendChild(section(t('stage'), [el('table', { class: 'list' }, [
    el('tr', {}, [el('th', { text: t('stage') }), el('th', { text: t('status') }), el('th', { text: t('attempts') }), el('th', { text: t('when') })]),
  ].concat(p.stages.map(function (stage) {
    const time = stage.status === 'running' && stage.startedAt ? t('since') + ' ' + ago(stage.startedAt) : stage.finishedAt ? local(stage.finishedAt) : '';
    return el('tr', {}, [
      el('td', {}, [stage.label, stage.interactive ? el('span', { class: 'sub', text: t('interactiveNote') }) : null, stage.lastError ? el('div', { class: stage.status === 'failed' ? 'error' : 'sub', text: stage.lastError }) : null]),
      el('td', {}, [el('span', { class: 'pill ' + stage.status, text: stage.status })]),
      el('td', { class: 'num', text: String(stage.attempts) }),
      el('td', { class: 'num', text: time })
    ]);
  })))]));

  const b = p.budget;
  main.appendChild(section(t('budget'), [
    el('div', { class: 'meta' }, [usd(b.spentUsd) + ' ' + t('spent') + ' · ' + usd(b.reservedUsd) + ' ' + t('reserved') + ' · ' + usd(b.totalUsd)]),
    budgetBar(b.totalUsd, b.spentUsd)
  ]));

  if (p.documents.length) main.appendChild(section(t('documents'), [el('div', { class: 'docs' }, p.documents.map(function (doc) {
    return el('a', { href: projectFile(p.slug, doc.path), target: '_blank', text: doc.label });
  }))]));

  main.appendChild(section(t('renders'), p.renders.length ? [el('div', { class: 'renders' }, p.renders.map(function (render) {
    return el('div', {}, [
      el('video', { src: projectFile(p.slug, render.path), controls: true, preload: 'metadata' }),
      el('div', { class: 'meta' }, [el('b', { text: render.name }), ' · ' + bytes(render.bytes) + ' · ' + local(render.modified)])
    ]);
  }))] : [el('p', { class: 'empty', text: t('noRenders') })]));

  if (p.contactSheet) main.appendChild(section(t('contact'), [el('a', { href: projectFile(p.slug, p.contactSheet), target: '_blank' }, [el('img', { class: 'contact', src: projectFile(p.slug, p.contactSheet), alt: t('contact') })])]));

  if (p.queueItems.length) main.appendChild(section(t('queue') + ' (' + queueLine(p.queue || {}) + ')', [el('table', { class: 'list' }, p.queueItems.map(function (item) {
    return el('tr', {}, [
      el('td', { text: item.id }), el('td', { text: item.kind || '' }),
      el('td', {}, [el('span', { class: 'pill ' + item.status, text: t('queueStates')[item.status] || item.status })]),
      el('td', { class: 'num', text: item.attempt ? '#' + item.attempt : '' }),
      el('td', {}, [item.error ? el('span', { class: 'error', text: item.error }) : item.note || ''])
    ]);
  }))]));

  if (p.verdicts.length) main.appendChild(section(t('reviews'), [el('div', { class: 'shots' }, p.verdicts.slice(0, 60).map(function (v) {
    const image = v.image && /^(assets|characters|sets|props|renders|review)\//.test(v.image) && /\.(png|jpe?g|webp)$/i.test(v.image);
    return el('figure', { title: v.issues.join('\n') }, [
      image ? el('img', { src: projectFile(p.slug, v.image), loading: 'lazy', alt: v.subject }) : null,
      el('figcaption', {}, [el('span', { class: 'pill ' + v.verdict, text: v.verdict + (v.score !== undefined ? ' ' + v.score : '') }), ' ' + v.subject, v.verdict === 'fail' && v.issues.length ? el('div', { class: 'error', text: v.issues[0] }) : null])
    ]);
  }))]));
}

function renderSeries(s) {
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.appendChild(el('header', { class: 'project' }, [el('h2', { text: s.title }), el('span', { class: 'chip', text: t('format') + ' ' + s.format })]));
  main.appendChild(el('div', { style: 'height:12px' }));
  main.appendChild(nextBox(s.next));
  main.appendChild(el('div', { style: 'height:14px' }));
  const b = s.budget;
  if (b.totalUsd !== undefined) main.appendChild(section(t('budget'), [
    el('div', { class: 'meta' }, [usd(b.canonSpentUsd) + ' ' + t('canonSpent') + ' · ' + usd(b.episodeBudgetsUsd) + ' ' + t('episodeBudgets') + ' · ' + usd(b.remainingUsd) + ' ' + t('uncommitted') + ' / ' + usd(b.totalUsd)]),
    budgetBar(b.totalUsd, b.canonSpentUsd + b.episodeBudgetsUsd)
  ]));
  main.appendChild(section(t('canon'), [
    el('div', { class: 'meta' }, [t('characters') + ' ' + s.characters + ' · ' + t('sets') + ' ' + s.sets]),
    s.canonGaps.length ? el('ul', {}, s.canonGaps.map(function (gap) { return el('li', { class: 'error', text: gap }); })) : null
  ]));
  main.appendChild(section(t('episodes'), [el('table', { class: 'list' }, s.episodes.map(function (e) {
    return el('tr', { style: e.slug ? 'cursor:pointer' : '', onclick: e.slug ? function () { go('#/p/' + e.slug); } : null }, [
      el('td', { class: 'num', text: String(e.episode) }), el('td', { text: e.title }),
      el('td', { text: e.slug || t('notCreated') }),
      el('td', {}, [e.status ? el('span', { class: 'pill ' + e.status, text: e.status }) : null, e.next && e.next !== 'done' ? ' → ' + e.next : ''])
    ]);
  }))]));
}

/** A playing video keeps its page: a refresh would restart it. */
function playing() {
  return Array.prototype.some.call(document.querySelectorAll('#main video'), function (video) { return !video.paused; });
}

/** Show (or refresh) a production page: `overview`, `project:<slug>`, or `series:<slug>`. Re-renders only when the data changed. */
export function showProduction(key, refresh) {
  setLang(null);
  const parts = key.split(':');
  const path = parts[0] === 'overview' ? '/api/production' : '/api/production/' + (parts[0] === 'series' ? 'series/' : 'projects/') + encodeURIComponent(parts[1]);
  return api(path).then(function (data) {
    const json = JSON.stringify(data);
    if (refresh && (view.key !== key || view.json === json || playing())) return data;
    view.key = key; view.json = json;
    if (parts[0] === 'overview') renderOverview(data);
    else if (parts[0] === 'series') renderSeries(data);
    else renderProject(data);
    return data;
  }).catch(function (error) { if (!refresh) showError(error); });
}

export function currentProductionKey() { return view.key; }
export function forgetProduction() { view.key = null; view.json = null; }
