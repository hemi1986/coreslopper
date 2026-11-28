// The release view: per project and platform the posts with their files,
// texts, checklists, and autopilot state; and the calendar of all projects.
import { addStrings, api, copyButton, el, getLang, go, loading, local, media, pending, post, setLang, showError, t, viewTabs, when } from './lib.js';

addStrings({
  de: {
    calendar: 'Release-Kalender', open: 'nur offene', ics: 'Kalender als .ics', release: 'Release', proposed: 'vorgeschlagen',
    done: 'erledigt', posted: 'Gepostet', finished: 'Erledigt', url: 'Live-URL', chars: 'Zeichen', bytes: 'Bytes',
    todos: 'Offene TODOs', none: 'Hier gibt es nichts zu posten.', profile: 'Profil', points: 'Verweist auf',
    week: 'Woche ab', progress: 'erledigt', noEvents: 'Keine Termine.', open_file: 'öffnen',
    pilot: 'Autopilot', approve: 'Release freigeben', approveDate: function (d, p) { return 'Release am ' + d + ' freigeben' + (p ? ' (Datum wird festgelegt)' : ''); },
    approved: function (at) { return 'Freigegeben am ' + at + ': die API-Posts gehen zu ihren Kalenderzeiten raus.'; }, revoke: 'Freigabe zurückziehen',
    summary: function (a, m) { return a + ' Posts gehen per API raus, ' + m + ' bleiben bei dir.'; }, missingAccess: 'Ohne Zugang (diese Posts warten, bis du publish-auth ausführst):',
    lastRun: function (at) { return 'Letzter Lauf von release-run: ' + at; }, noRun: 'release-run ist noch nie gelaufen: npm run cli -- release-timer install', staleRun: 'release-run lief seit mehreren Runden nicht: läuft der Timer?',
    attention: 'Braucht dich:', staleApproval: function (was, now) { return 'Freigegeben war der ' + was + ', das Release liegt jetzt am ' + now + ': bis zur neuen Freigabe geht nichts raus.'; }, confirmApprove: 'Release freigeben? Ab jetzt postet der Autopilot zu den Kalenderzeiten auf den Plattformen mit Zugang.',
    states: { manual: 'von Hand', done: 'erledigt', unapproved: 'nach Freigabe automatisch', waiting: 'automatisch', due: 'ist dran', blocked: 'wartet', running: 'läuft …', pending: 'hochgeladen', failed: 'fehlgeschlagen', stuck: 'unklar, ob online', missed: 'verpasst' },
    blocks: { credentials: 'Zugang fehlt: npm run cli -- publish-auth ', youtube: 'wartet, bis das Hauptvideo öffentlich ist', spotify: 'wartet auf den Spotify-Link (Spotify-Tab, „Song“)' },
    byPilot: 'vom Autopiloten', takeOver: 'Selbst machen', giveBack: 'Dem Autopiloten geben', retry: 'Erneut versuchen', force: 'Jetzt posten', isLive: 'Ist online', at: 'um', upload: 'Upload', retryAt: 'nächster Versuch'
  },
  en: {
    calendar: 'Release calendar', open: 'open only', ics: 'Calendar as .ics', release: 'Release', proposed: 'proposed',
    done: 'done', posted: 'Posted', finished: 'Done', url: 'Live URL', chars: 'characters', bytes: 'bytes',
    todos: 'Open TODOs', none: 'Nothing to post here.', profile: 'Profile', points: 'Points to',
    week: 'Week of', progress: 'done', noEvents: 'No events.', open_file: 'open',
    pilot: 'Autopilot', approve: 'Approve release', approveDate: function (d, p) { return 'Approve the release on ' + d + (p ? ' (fixes the date)' : ''); },
    approved: function (at) { return 'Approved on ' + at + ': the API posts go out at their calendar times.'; }, revoke: 'Withdraw approval',
    summary: function (a, m) { return a + ' posts go out by API, ' + m + ' stay with you.'; }, missingAccess: 'No access (these posts wait until you run publish-auth):',
    lastRun: function (at) { return 'Last release-run: ' + at; }, noRun: 'release-run has never run: npm run cli -- release-timer install', staleRun: 'release-run has missed several rounds: is the timer on?',
    attention: 'Needs you:', staleApproval: function (was, now) { return 'You approved ' + was + '; the release is now on ' + now + ': nothing goes out until you approve the new day.'; }, confirmApprove: 'Approve the release? From now on the autopilot posts at the calendar times on every platform it has access to.',
    states: { manual: 'manual', done: 'done', unapproved: 'automatic after approval', waiting: 'automatic', due: 'due', blocked: 'waiting', running: 'running …', pending: 'uploaded', failed: 'failed', stuck: 'not sure it is live', missed: 'missed' },
    blocks: { credentials: 'no access: npm run cli -- publish-auth ', youtube: 'waits until the main video is public', spotify: 'waits for the Spotify link (Spotify tab, "Song")' },
    byPilot: 'by the autopilot', takeOver: 'Do it myself', giveBack: 'Give it to the autopilot', retry: 'Try again', force: 'Post now', isLive: 'It is live', at: 'at', upload: 'Upload', retryAt: 'next attempt'
  }
});

const view = { slug: null, tab: null, data: null, focus: null, openOnly: true };
let changed = function () {};
/** Called after every write, so the navigation can refresh its counts. */
export function onReleaseChange(fn) { changed = fn; }

export function count(value, field) {
  if (field.unit === 'bytes') return new TextEncoder().encode(value).length;
  const text = field.counting === 'x' ? value.replace(/https?:\/\/\S+/g, 'xxxxxxxxxxxxxxxxxxxxxxx') : value;
  return Array.from(text).length;
}

function hash() { return '#/p/' + view.slug + '/release' + (view.tab ? '/' + view.tab : ''); }

/** Open a project's release view on a platform tab, optionally scrolled to one post. */
export function showRelease(slug, tab, focus) {
  view.slug = slug; view.focus = focus || null;
  return api('/api/projects/' + encodeURIComponent(slug)).then(function (data) {
    view.data = data;
    setLang(data.language || 'en');
    const ids = data.platforms.map(function (p) { return p.id; });
    if (tab && ids.indexOf(tab) >= 0) view.tab = tab;
    else if (ids.indexOf(view.tab) < 0) view.tab = ids[0];
    if (location.hash !== hash()) history.replaceState(null, '', hash());
    renderProject();
  }).catch(showError);
}

function reload(focus) { return showRelease(view.slug, view.tab, focus); }

function setStatus(id, change) {
  return post('/api/projects/' + encodeURIComponent(view.slug) + '/status', Object.assign({ id: id }, change))
    .then(function (status) { view.data.status = status; changed(); })
    .catch(showError);
}

function pilotCall(path, payload) {
  return post('/api/projects/' + encodeURIComponent(view.slug) + path, payload)
    .then(function () { changed(); return reload(); })
    .catch(showError);
}

/** The events that need the user, as links to their posts. */
function attention(pilot) {
  const events = view.data.calendar.filter(function (e) { const a = pilot.events[e.id]; return a && a.needsUser; });
  if (!events.length) return null;
  return el('div', {}, [el('strong', { text: t('attention') }), el('ul', {}, events.map(function (e) {
    return el('li', {}, [el('a', { href: '#', onclick: function (ev) { ev.preventDefault(); showRelease(view.slug, tabOf(e), e.id); }, text: e.label }), ' — ' + t('states')[pilot.events[e.id].state]]);
  }))]);
}

function renderPilot() {
  const pilot = view.data.autopilot;
  if (!pilot) return null;
  const box = el('section', { class: 'pilot' + (pilot.approval ? ' on' : '') }, [el('h3', { text: t('pilot') })]);
  const missing = Object.keys(pilot.ready).filter(function (p) { return !pilot.ready[p] && p !== 'microsite'; });
  if (pilot.approval && pilot.approvalStale) {
    box.appendChild(el('p', { class: 'error', text: t('staleApproval')(pilot.approval.release_date, view.data.releaseDate) }));
    const again = el('button', { class: 'primary', text: t('approveDate')(view.data.releaseDate, view.data.proposed) });
    again.onclick = pending(function () { if (confirm(t('confirmApprove'))) return pilotCall('/approve', { release_date: view.data.releaseDate }); });
    box.appendChild(el('p', {}, [again, ' ', el('button', { class: 'small', text: t('revoke'), onclick: pending(function () { return pilotCall('/revoke'); }) })]));
  } else if (pilot.approval) {
    box.appendChild(el('p', { text: t('approved')(local(pilot.approval.at)) }));
    const list = attention(pilot);
    if (list) box.appendChild(list);
    box.appendChild(el('p', {}, [el('button', { class: 'small', text: t('revoke'), onclick: pending(function () { return pilotCall('/revoke'); }) })]));
  } else {
    const button = el('button', { class: 'primary', text: view.data.releaseDate ? t('approveDate')(view.data.releaseDate, view.data.proposed) : t('approve'), disabled: pilot.blockers.length ? true : undefined });
    button.onclick = pending(function () { if (confirm(t('confirmApprove'))) return pilotCall('/approve', { release_date: view.data.releaseDate }); });
    box.appendChild(el('p', { text: t('summary')(pilot.automatic, pilot.manual) }));
    // Withdrawn: what went out, or may have, still needs the user.
    const list = attention(pilot);
    if (list) box.appendChild(list);
    if (pilot.blockers.length) box.appendChild(el('ul', {}, pilot.blockers.map(function (b) { return el('li', { class: 'error', text: b }); })));
    box.appendChild(el('p', {}, [button]));
  }
  if (missing.length) box.appendChild(el('p', { text: t('missingAccess') + ' ' + missing.join(', ') }));
  if (pilot.notes.length) box.appendChild(el('ul', {}, pilot.notes.map(function (n) { return el('li', { text: n }); })));
  // Stale after three missed rounds of the timer (30 minutes when the interval is unknown).
  const staleAfter = Math.max(15, 3 * (pilot.lastRunEvery || 10)) * 60000;
  const stale = pilot.lastRun && Date.now() - Date.parse(pilot.lastRun) > staleAfter;
  box.appendChild(el('p', { class: 'sub' + (stale || !pilot.lastRun ? ' error' : ''), text: pilot.lastRun ? (stale ? t('staleRun') + ' ' : '') + t('lastRun')(local(pilot.lastRun)) : t('noRun') }));
  return box;
}

function renderAuto(entry) {
  const pilot = view.data.autopilot, a = pilot && pilot.events[entry.id];
  if (!a || (a.state === 'manual' && !a.platform)) return null;
  const cls = a.state === 'failed' || a.state === 'stuck' || a.state === 'missed' ? 'bad' : a.needsUser ? 'you' : a.state === 'done' || a.state === 'manual' ? '' : 'go';
  let label = t('states')[a.state];
  if (a.state === 'done' && a.byAutopilot) label += ' · ' + t('byPilot');
  if ((a.state === 'waiting' || a.state === 'unapproved') && a.dueAt) label += ' ' + (a.platform === 'youtube' && entry.id.indexOf('links') < 0 ? t('upload') + ' ' : '') + local(a.dueAt);
  if (a.retryAt) label += ' · ' + t('retryAt') + ' ' + local(a.retryAt);
  if (a.state === 'blocked' && a.block) label += ': ' + t('blocks')[a.block] + (a.block === 'credentials' ? a.platform : '');
  const row = el('div', { class: 'auto' }, [el('span', { class: 'badge ' + cls, text: t('pilot') + ': ' + label })]);
  const button = function (text, action) { return el('button', { class: 'small', text: text, onclick: pending(function () { return pilotCall('/autopilot', { id: entry.id, action: action }); }) }); };
  if (a.state === 'manual') row.appendChild(button(t('giveBack'), 'auto'));
  else if (a.state === 'failed') { row.appendChild(button(t('retry'), 'retry')); row.appendChild(button(t('takeOver'), 'manual')); }
  else if (a.state === 'stuck') { row.appendChild(el('button', { class: 'small', text: t('isLive'), onclick: pending(function () { return setStatus(entry.id, { done: true }).then(function () { return reload(); }); }) })); row.appendChild(button(t('retry'), 'retry')); }
  else if (a.state === 'missed') { row.appendChild(button(t('force'), 'force')); row.appendChild(button(t('takeOver'), 'manual')); }
  else if (a.state !== 'done' && a.state !== 'running' && a.state !== 'pending') row.appendChild(button(t('takeOver'), 'manual'));
  if (a.error) row.appendChild(el('span', { class: 'error', text: a.error }));
  if (a.manualSteps.length && a.state !== 'done') row.appendChild(el('ul', {}, a.manualSteps.map(function (step) { return el('li', { text: step }); })));
  return row;
}

function renderField(field) {
  const value = field.value;
  const n = count(value, field);
  const over = field.limit && n > field.limit;
  const counter = field.limit ? el('span', { class: 'count' + (over ? ' over' : ''), text: n + '/' + field.limit + ' ' + t(field.unit === 'bytes' ? 'bytes' : 'chars') }) : null;
  return el('div', { class: 'field' }, [
    el('div', { class: 'field-head' }, [el('strong', { text: field.label }), el('span', {}, [counter, field.note ? ' · ' + field.note : null, ' ', copyButton(value, { copy: t('copy'), copied: t('copied') })])]),
    el('pre', { class: 'value', text: value })
  ]);
}

function renderFile(file) {
  const src = media(view.slug, file.path);
  let box;
  if (file.kind === 'image') box = el('div', { class: 'media' }, [el('img', { src: src, alt: file.label, loading: 'lazy' })]);
  else if (file.kind === 'video') box = el('div', { class: 'media' + (/9x16/.test(file.path) ? ' tall' : '') }, [el('video', { src: src, controls: true, preload: 'metadata' })]);
  else if (file.kind === 'audio') box = el('audio', { src: src, controls: true, preload: 'none' });
  else box = el('div', { class: 'media' }, [el('a', { href: src, target: '_blank', text: t('open_file') })]);
  return el('div', { class: 'file' }, [box, el('div', { class: 'name' }, [el('b', { text: file.label }), el('a', { href: src, target: '_blank', text: 'release/' + file.path })])]);
}

function renderPost(entry) {
  const status = view.data.status.items[entry.id] || {};
  const done = el('input', { type: 'checkbox', checked: status.done ? true : undefined });
  done.onchange = function () { setStatus(entry.id, { done: done.checked }).then(renderProject); };
  const posted = el('div', { class: 'posted' }, [el('label', { class: 'done-toggle' }, [done, t(entry.task ? 'finished' : 'posted')])]);
  if (entry.url) {
    const input = el('input', { type: 'url', placeholder: t('url'), value: status.url || '' });
    input.onchange = function () { setStatus(entry.id, { url: input.value.trim() || null }).then(function () { reload(entry.id); }); };
    posted.insertBefore(input, posted.firstChild);
  }
  const checklist = entry.checklist.length ? el('ul', { class: 'check' }, entry.checklist.map(function (item) {
    // The key is the line's record key from the server: a line appearing or going leaves the other ticks (G-163).
    const box = el('input', { type: 'checkbox', checked: (view.data.status.items[item.key] || {}).done ? true : undefined });
    box.onchange = function () { setStatus(item.key, { done: box.checked }); };
    const link = item.href && /^https?:/.test(item.href) ? el('a', { href: item.href, target: '_blank', rel: 'noopener', text: item.href }) : null;
    return el('li', {}, [el('label', {}, [box, ' ', item.label]), link ? ' — ' : null, link]);
  })) : null;
  const pointer = entry.pointer ? el('div', { class: 'pointer' }, [t('points') + ': ', /^https?:/.test(entry.pointer) ? el('a', { href: entry.pointer, target: '_blank', text: entry.pointer }) : entry.pointer]) : null;
  return el('section', { class: 'card' + (status.done ? ' done' : ''), id: 'post-' + entry.id }, [
    el('div', { class: 'card-head' }, [el('h3', { text: entry.heading }), entry.at ? el('span', { class: 'when', text: when(entry.at) }) : null, posted]),
    renderAuto(entry),
    entry.files.length ? el('div', { class: 'files' }, entry.files.map(renderFile)) : null,
  ].concat(entry.fields.map(renderField)).concat([checklist, pointer]));
}

function renderProject() {
  const data = view.data, main = document.getElementById('main');
  main.innerHTML = '';
  const total = data.calendar.length, done = data.calendar.filter(function (e) { return (data.status.items[e.id] || {}).done; }).length;
  main.appendChild(el('header', { class: 'project' }, [
    el('h2', { text: (data.artist ? data.artist + ' – ' : '') + data.title }),
    data.releaseDate ? el('span', { class: 'chip', text: t('release') + ' ' + data.releaseDate + (data.proposed ? ' (' + t('proposed') + ')' : '') }) : null,
    el('span', { class: 'chip', text: done + '/' + total + ' ' + t('progress') })
  ]));
  main.appendChild(viewTabs(view.slug, 'release', true));
  const pilotBox = renderPilot();
  if (pilotBox) main.appendChild(pilotBox);
  if (data.todos.length) {
    main.appendChild(el('details', { class: 'todos' }, [el('summary', { text: t('todos') + ' (' + data.todos.length + ')' }), el('ul', {}, data.todos.map(function (todo) { return el('li', { text: todo }); }))]));
  }
  // The release shape and why, above the platform tabs (ADR 0057); a music video and a meme have none.
  if (data.shapeLine) main.appendChild(el('p', { class: 'shape', text: data.shapeLine }));
  const tabs = el('nav', { class: 'tabs' });
  data.platforms.forEach(function (platform) {
    const open = platform.posts.filter(function (p) { return !(data.status.items[p.id] || {}).done; }).length;
    tabs.appendChild(el('button', { class: 'tab' + (view.tab === platform.id ? ' active' : ''), onclick: function () { view.tab = platform.id; view.focus = null; history.replaceState(null, '', hash()); renderProject(); } },
      [platform.label, el('span', { class: 'count', text: platform.posts.length ? open + '/' + platform.posts.length : '–' })]));
  });
  main.appendChild(tabs);
  const platform = data.platforms.filter(function (p) { return p.id === view.tab; })[0];
  if (!platform) return;
  main.appendChild(el('div', { class: 'notes' }, [
    platform.profile ? el('div', {}, [t('profile') + ': ', /^https?:/.test(platform.profile) ? el('a', { href: platform.profile, target: '_blank', text: platform.profile }) : platform.profile]) : null,
    el('ul', {}, platform.notes.map(function (note) { return el('li', { text: note }); }))
  ]));
  if (platform.skipped) main.appendChild(el('p', { class: 'empty', text: platform.skipped }));
  else if (!platform.posts.length) main.appendChild(el('p', { class: 'empty', text: t('none') }));
  platform.posts.forEach(function (entry) { main.appendChild(renderPost(entry)); });
  if (view.focus) {
    const target = document.getElementById('post-' + view.focus);
    if (target) { target.scrollIntoView({ block: 'center' }); target.classList.add('flash'); setTimeout(function () { target.classList.remove('flash'); }, 1600); }
    view.focus = null;
  }
}

export function tabOf(event) {
  if (event.platform === 'distributor') return 'spotify';
  return event.platform;
}

/** The calendar of every project's release events, by week. */
export function showCalendar() {
  setLang(null);
  const main = document.getElementById('main');
  main.innerHTML = '';
  const filter = el('input', { type: 'checkbox', checked: view.openOnly ? true : undefined });
  filter.onchange = function () { view.openOnly = filter.checked; loading(showCalendar()); };
  main.appendChild(el('div', { class: 'toolbar' }, [el('h2', { text: t('calendar'), style: 'margin:0;font-size:20px' }), el('label', {}, [filter, ' ', t('open')]), el('a', { href: '/calendar.ics', text: t('ics') })]));
  return api('/api/calendar').then(function (events) {
    const now = Date.now();
    const shown = events.filter(function (e) { return !view.openOnly || !e.done; });
    if (!shown.length) { main.appendChild(el('p', { class: 'empty', text: t('noEvents') })); return; }
    const weeks = {};
    shown.forEach(function (e) {
      const d = new Date(e.at.slice(0, 10) + 'T12:00:00Z'), back = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - back);
      const key = d.toISOString().slice(0, 10);
      (weeks[key] = weeks[key] || []).push(e);
    });
    Object.keys(weeks).sort().forEach(function (week) {
      const parts = week.split('-');
      const box = el('div', { class: 'week' }, [el('h3', { text: t('week') + ' ' + (getLang() === 'de' ? parts[2] + '.' + parts[1] + '.' + parts[0] : week) })]);
      weeks[week].forEach(function (e) {
        box.appendChild(el('div', {
          class: 'event' + (e.done ? ' done' : '') + (Date.parse(e.at) < now ? ' past' : ''),
          onclick: function () { go('#/p/' + e.project + '/release/' + tabOf(e) + '/' + encodeURIComponent(e.id)); }
        }, [
          el('span', { class: 'day', text: when(e.at).split(' · ')[0] }),
          el('span', { class: 'when', text: e.at.slice(11, 16) }),
          el('span', { class: 'proj', text: e.title }),
          el('span', {}, [el('span', { class: 'pf pf-' + e.platform, text: e.platform === 'shorts' ? 'Shorts' : e.platform }), ' ', e.label]),
          el('span', { text: e.done ? '✓' : '' })
        ]));
      });
      main.appendChild(box);
    });
  }).catch(showError);
}
