// The production view: every project and series as the pipeline leaves them,
// with the next step to take in Claude Code.
import { addStrings, ago, api, bytes, copyButton, el, go, local, projectFile, setLang, showError, t, usd, viewTabs } from './lib.js';
import { renderMarkdown } from './markdown.js';

addStrings({
  de: {
    production: 'Produktion', projects: 'Projekte', series: 'Serien', noWork: 'Noch kein Projekt und keine Serie im Workspace.',
    groupYou: 'Du bist dran', groupRunning: 'Läuft', groupReleased: 'Freigegeben', groupInternal: 'Fertig – nicht öffentlich', groupBroken: 'Nicht lesbar', groupDemo: 'Demos',
    phases: { setup: 'Setup', ready: 'Bereit', running: 'Läuft', failed: 'Fehlgeschlagen', done: 'Fertig' },
    kindVideo: 'Musikvideo', kindMeme: 'Meme', kindEpisode: function (s, n) { return 'Episode ' + n + ' · ' + s; },
    budget: 'Budget', spent: 'ausgegeben', reserved: 'reserviert', since: 'seit', stage: 'Stage', status: 'Status', attempts: 'Versuche', when: 'Zeit', error: 'Fehler',
    queue: 'Generierungs-Queue', queueStates: { pending: 'offen', generating: 'generiert', reviewing: 'im Review', passed: 'bestanden', 'needs-fix': 'braucht Fix', error: 'Fehler' },
    reviews: 'Art-Director-Reviews', failedReviews: function (n) { return n + ' Review(s) nicht bestanden'; }, documents: 'Dokumente', noDocument: 'Dokument nicht gefunden', renders: 'Renders',
    noRenders: 'Noch kein Render.', interactiveNote: 'interaktiv',
    next: {
      interactive: function (s) { return 'In Claude Code weitermachen (' + s + '):'; },
      pipeline: function (s) { return 'Pipeline weiterlaufen lassen (' + s + '):'; },
      retry: function (s) { return s + ' ist fehlgeschlagen. Erneut starten:'; },
      review: 'Review-Runde an den Agenten gesendet. Abarbeiten lassen:',
      running: function (s) { return s + ' läuft gerade. Nichts zu tun.'; },
      release: 'Fertig. Weiter im Release-Tab.', 'release-missing': 'Alle Stages fertig, aber der Release-Ordner fehlt. qa-export neu bauen lassen:', released: 'Release freigegeben: der Autopilot postet.', 'internal-done': 'Fertig – nicht öffentlich.',
      canon: 'Canon fertigstellen:', episode: 'Nächste geplante Episode anlegen:', 'series-done': 'Alle geplanten Episoden sind angelegt.',
      demo: 'Demo-Produktion – nichts zu tun.'
    },
    drafts: function (n) { return n + ' Notiz(en) noch nicht an den Agenten gesendet'; }, wizard: 'oder im Assistenten',
    canon: 'Canon', characters: 'Figuren', sets: 'Sets', episodes: 'Episoden', notCreated: 'nicht angelegt', gaps: 'Lücken im Canon', format: 'Format',
    uncommitted: 'frei', canonSpent: 'Canon', episodeBudgets: 'Episoden-Budgets', updated: 'aktualisiert vor',
    activity: 'Aktivität', watchdog: function (at) { return 'Watchdog: letzte Runde vor ' + at; },
    noWatchdog: 'Der Watchdog ist noch nie gelaufen: Board-Container starten oder npm run cli -- release-timer install.',
    staleWatchdog: 'Der Watchdog hat mehrere Runden verpasst: läuft der Container oder der Timer?',
    stalled: function (at) { return 'Seit ' + at + ' hat sich keine Datei geändert. Läuft Claude Code noch?'; },
    rendering: 'Render', interrupted: 'abgebrochen?', renderFailed: 'fehlgeschlagen',
    events: {
      'stage-started': function (e) { return e.stage + ' gestartet'; }, 'stage-done': function (e) { return e.stage + ' fertig'; },
      'stage-failed': function (e) { return e.stage + ' fehlgeschlagen'; }, 'render-ready': function (e) { return 'Render fertig: ' + e.file; },
      'render-failed': function (e) { return 'Render fehlgeschlagen: ' + e.file; }, 'render-interrupted': function (e) { return 'Render bleibt stehen: ' + e.file; },
      stalled: function (e) { return (e.stage || 'Stage') + ' hängt (keine Dateiänderung)'; }, 'needs-fix': function (e) { return e.detail + ' Queue-Element(e) brauchen einen Fix'; },
      budget: function (e) { return e.detail + ' des Budgets ausgegeben'; }, unreadable: function (e) { return 'nicht lesbar: ' + e.detail; },
      'comfyui-restarted': function (e) { return 'neu gestartet, ' + e.detail; }
    }
  },
  en: {
    production: 'Production', projects: 'Projects', series: 'Series', noWork: 'No project or series in this workspace yet.',
    groupYou: 'Your turn', groupRunning: 'Running', groupReleased: 'Approved for release', groupInternal: 'Done – not released publicly', groupBroken: 'Unreadable', groupDemo: 'Demos',
    phases: { setup: 'Setup', ready: 'Ready', running: 'Running', failed: 'Failed', done: 'Done' },
    kindVideo: 'Music video', kindMeme: 'Meme', kindEpisode: function (s, n) { return 'Episode ' + n + ' · ' + s; },
    budget: 'Budget', spent: 'spent', reserved: 'reserved', since: 'for', stage: 'Stage', status: 'Status', attempts: 'Attempts', when: 'Time', error: 'Error',
    queue: 'Generation queue', queueStates: { pending: 'pending', generating: 'generating', reviewing: 'in review', passed: 'passed', 'needs-fix': 'needs a fix', error: 'error' },
    reviews: 'Art-director reviews', failedReviews: function (n) { return n + ' review(s) failed'; }, documents: 'Documents', noDocument: 'Document not found', renders: 'Renders',
    noRenders: 'No render yet.', interactiveNote: 'interactive',
    next: {
      interactive: function (s) { return 'Continue in Claude Code (' + s + '):'; },
      pipeline: function (s) { return 'Let the pipeline continue (' + s + '):'; },
      retry: function (s) { return s + ' failed. Run it again:'; },
      review: 'A review round is waiting for the agent. Let it work through it:',
      running: function (s) { return s + ' is running. Nothing to do.'; },
      release: 'Done. Continue in the release tab.', 'release-missing': 'Every stage is done, but the release folder is missing. Let qa-export build it again:', released: 'Release approved: the autopilot posts.', 'internal-done': 'Done – not released publicly.',
      canon: 'Finish the canon:', episode: 'Create the next planned episode:', 'series-done': 'Every planned episode exists.',
      demo: 'Demo production – nothing to do.'
    },
    drafts: function (n) { return n + ' note(s) not sent to the agent yet'; }, wizard: 'or in the wizard',
    canon: 'Canon', characters: 'Characters', sets: 'Sets', episodes: 'Episodes', notCreated: 'not created', gaps: 'Gaps in the canon', format: 'Format',
    uncommitted: 'uncommitted', canonSpent: 'canon', episodeBudgets: 'episode budgets', updated: 'updated',
    activity: 'Activity', watchdog: function (at) { return 'Watchdog: last round ' + at + ' ago'; },
    noWatchdog: 'The watchdog has never run: start the board container or npm run cli -- release-timer install.',
    staleWatchdog: 'The watchdog has missed several rounds: is the container or the timer running?',
    stalled: function (at) { return 'No file has changed for ' + at + '. Is Claude Code still running?'; },
    rendering: 'Render', interrupted: 'interrupted?', renderFailed: 'failed',
    events: {
      'stage-started': function (e) { return e.stage + ' started'; }, 'stage-done': function (e) { return e.stage + ' done'; },
      'stage-failed': function (e) { return e.stage + ' failed'; }, 'render-ready': function (e) { return 'Render ready: ' + e.file; },
      'render-failed': function (e) { return 'Render failed: ' + e.file; }, 'render-interrupted': function (e) { return 'Render stopped moving: ' + e.file; },
      stalled: function (e) { return (e.stage || 'A stage') + ' is stalled (no file changes)'; }, 'needs-fix': function (e) { return e.detail + ' queue item(s) need a fix'; },
      budget: function (e) { return e.detail + ' of the budget spent'; }, unreadable: function (e) { return 'unreadable: ' + e.detail; },
      'comfyui-restarted': function (e) { return 'restarted, ' + e.detail; }
    }
  }
});

let activity = { events: [], stalled: [] };
const RENDER_STALE_MIN = 15;

function stageLabel(project, id) {
  const stage = project.stages && project.stages.filter(function (s) { return s.id === id; })[0];
  return stage ? stage.label : id;
}

function nextBox(next, label, slug, kind) {
  const words = t('next')[next.reason];
  const text = typeof words === 'function' ? words(label || next.stage || '') : words;
  const box = el('div', { class: 'next' }, [el('span', { text: text })]);
  if (next.command) box.appendChild(el('code', { text: next.command }));
  if (next.command) box.appendChild(copyButton(next.command, { copy: t('copy'), copied: t('copied') }));
  // A music video's setup the wizard can finish: project data, lyrics, song, references.
  if (next.reason === 'interactive' && next.stage === 'setup' && slug && (kind || 'music-video') === 'music-video') box.appendChild(el('a', { href: '#/new/video/' + slug, text: t('wizard') + ' →', onclick: function (e) { e.stopPropagation(); } }));
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

function progressRows(project) {
  return (project.progress || []).map(function (p) {
    const share = p.framesTotal ? Math.round(100 * p.framesDone / p.framesTotal) : 0;
    const stale = !p.error && p.updatedAt && Date.now() - Date.parse(p.updatedAt) > RENDER_STALE_MIN * 60000;
    const state = p.error ? t('renderFailed') : stale ? t('interrupted') : share + '%';
    return el('div', { class: 'meta' + (p.error || stale ? ' error' : '') }, [
      t('rendering') + ' ' + p.output + ' · ' + state, p.error ? el('div', { text: p.error }) : null,
      el('div', { class: 'budget' }, [el('i', { class: p.error || stale ? 'over' : '', style: 'width:' + share + '%' })])
    ]);
  });
}

function stalledNote(project) {
  if (activity.stalled.indexOf(project.slug) < 0 || project.phase !== 'running') return null;
  return el('div', { class: 'meta error', text: t('stalled')(project.lastActivity ? ago(project.lastActivity) : '?') });
}

function eventLine(e) {
  const words = t('events')[e.kind];
  return el('li', {}, [
    el('span', { class: 'when', text: local(e.at) + ' · ' }),
    e.project ? el('a', { href: '#/p/' + e.project, text: e.project }) : 'ComfyUI', ': ' + (words ? words(e) : e.kind)
  ]);
}

function watchdogLine() {
  if (!activity.lastRound) return el('p', { class: 'sub error', text: t('noWatchdog') });
  const stale = Date.now() - Date.parse(activity.lastRound) > Math.max(15, 3 * (activity.every || 5)) * 60000;
  return el('p', { class: 'sub' + (stale ? ' error' : '') }, [stale ? t('staleWatchdog') + ' ' : '', t('watchdog')(ago(activity.lastRound))]);
}

function kindLabel(project) {
  if (project.kind === 'episode') return t('kindEpisode')(project.series, project.episode);
  return project.kind === 'meme' ? t('kindMeme') : t('kindVideo');
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
    stalledNote(project),
    el('div', { class: 'meta' }, [t('budget') + ': ' + usd(project.budget.spentUsd) + ' / ' + usd(project.budget.totalUsd)]),
    budgetBar(project.budget.totalUsd, project.budget.spentUsd),
    project.queue ? el('div', { class: 'meta' }, [t('queue') + ': ' + queueLine(project.queue)]) : null,
    project.failedReviews ? el('div', { class: 'meta error', text: t('failedReviews')(project.failedReviews) }) : null,
    project.review && project.review.drafts ? el('div', { class: 'meta', text: t('drafts')(project.review.drafts) }) : null
  ].concat(progressRows(project)).concat([
    nextBox(project.next, project.next.stage && stageLabel(project, project.next.stage), project.slug, project.kind)
  ]));
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
  main.appendChild(el('div', { class: 'toolbar' }, [el('h2', { text: t('production'), style: 'margin:0;font-size:20px' }), watchdogLine()]));
  if (!data.projects.length && !data.series.length) { main.appendChild(el('p', { class: 'empty', text: t('noWork') })); return; }
  const ok = data.projects.filter(function (p) { return !p.error; });
  const order = { failed: 0, setup: 1, ready: 2, done: 3, running: 4 };
  const yours = ok.filter(function (p) { return p.next.where !== 'none'; }).sort(function (a, b) { return order[a.phase] - order[b.phase]; });
  [
    group(t('groupYou'), yours.map(projectCard)),
    group(t('groupRunning'), ok.filter(function (p) { return p.next.reason === 'running'; }).map(projectCard)),
    group(t('series'), data.series.map(seriesCard)),
    group(t('groupReleased'), ok.filter(function (p) { return p.next.reason === 'released'; }).map(projectCard)),
    group(t('groupInternal'), ok.filter(function (p) { return p.next.reason === 'internal-done'; }).map(projectCard)),
    group(t('groupDemo'), ok.filter(function (p) { return p.next.reason === 'demo'; }).map(projectCard)),
    group(t('groupBroken'), data.projects.filter(function (p) { return p.error; }).map(projectCard))
  ].forEach(function (node) { if (node) main.appendChild(node); });
  if (activity.events.length) {
    main.appendChild(el('h3', { class: 'section-title', text: t('activity') }));
    main.appendChild(el('ul', { class: 'activity' }, activity.events.slice(0, 15).map(eventLine)));
  }
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
  main.appendChild(nextBox(p.next, p.next.stage && stageLabel(p, p.next.stage), p.slug, p.kind));
  const stalled = stalledNote(p);
  if (stalled) main.appendChild(stalled);
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
    return el('a', { href: documentHash(p.slug, doc.path), text: doc.label });
  }))]));

  main.appendChild(section(t('renders'), progressRows(p).concat(p.renders.length ? [el('div', { class: 'renders' }, p.renders.map(function (render) {
    return el('div', {}, [
      el('video', { src: projectFile(p.slug, render.path), controls: true, preload: 'metadata' }),
      el('div', { class: 'meta' }, [el('b', { text: render.name }), ' · ' + bytes(render.bytes) + ' · ' + local(render.modified) + ' · ', el('a', { href: '#/p/' + p.slug + '/review/' + encodeURIComponent(render.name), text: t('tabReview') + ' →' })])
    ]);
  }))] : p.progress.length ? [] : [el('p', { class: 'empty', text: t('noRenders') })])));

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

function documentHash(slug, path) { return '#/p/' + slug + '/doc/' + encodeURIComponent(path); }

/** An address in a project document: a web link, or an image of the project's media folders, relative to the document. */
function documentTarget(slug, path) {
  const folder = path.indexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  return function (href, image) {
    if (/^https?:\/\//.test(href)) return { href: href, external: true };
    if (/^[a-z]+:|^\/|^#/.test(href)) return null;
    const parts = [];
    (folder + href.replace(/[?#].*$/, '')).split('/').forEach(function (part) { if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part); });
    const rel = parts.join('/');
    if (image && /^(renders|review|assets|characters|sets|props)\//.test(rel)) return { href: projectFile(slug, rel) };
    if (!image && /\.md$/.test(rel) && documents.some(function (doc) { return doc.path === rel; })) return { href: documentHash(slug, rel) };
    return null;
  };
}

let documents = [];

/** A project document on the board: markdown rendered, lyrics and script as text, the file itself one click away. */
export function showDocument(slug, path) {
  setLang(null);
  return api('/api/production/projects/' + encodeURIComponent(slug)).then(function (p) {
    documents = p.documents;
    const doc = p.documents.filter(function (d) { return d.path === path; })[0];
    if (!doc) throw new Error(t('noDocument') + ': ' + path);
    return fetch(projectFile(slug, path)).then(function (res) {
      if (!res.ok) throw new Error(t('noDocument') + ': ' + path);
      return res.text();
    }).then(function (source) {
      const main = document.getElementById('main');
      main.innerHTML = '';
      main.appendChild(el('header', { class: 'project' }, [el('h2', { text: (p.artist ? p.artist + ' – ' : '') + p.title }), el('span', { class: 'chip', text: kindLabel(p) })]));
      main.appendChild(viewTabs(slug, 'production', p.hasRelease));
      main.appendChild(el('div', { class: 'docs doc-bar' }, [el('a', { href: '#/p/' + slug, text: '← ' + t('documents') })].concat(p.documents.map(function (d) {
        return el('a', { href: documentHash(slug, d.path), class: d.path === path ? 'active' : undefined, text: d.label });
      })).concat([el('a', { class: 'raw', href: projectFile(slug, path), target: '_blank', text: path + ' ↗' })])));
      main.appendChild(el('article', { class: 'markdown card' }, /\.md$/.test(path) ? renderMarkdown(source, documentTarget(slug, path)) : [el('pre', { class: 'plain', text: source })]));
      window.scrollTo(0, 0);
    });
  }).catch(showError);
}

/** Show a production page: `overview`, `project:<slug>`, or `series:<slug>`. */
export function showProduction(key) {
  setLang(null);
  const parts = key.split(':');
  const path = parts[0] === 'overview' ? '/api/production' : '/api/production/' + (parts[0] === 'series' ? 'series/' : 'projects/') + encodeURIComponent(parts[1]);
  return Promise.all([api(path), api('/api/activity').catch(function () { return { events: [], stalled: [] }; })]).then(function (both) {
    const data = both[0];
    activity = both[1];
    if (parts[0] === 'overview') renderOverview(data);
    else if (parts[0] === 'series') renderSeries(data);
    else renderProject(data);
    return data;
  }).catch(showError);
}
