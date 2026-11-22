// The review view: a frame-accurate player for a project's renders, with a
// timeline of sections, shots, and notes; notes go to the agent in rounds.
// Frames: the frame shown at time t is floor(t * fps); seeking to a frame lands
// on its middle, (frame + 0.5) / fps, so the decoder never shows its neighbour.
import { addStrings, api, copyButton, el, go, local, pending, post, projectFile, setLang, showError, t, viewTabs } from './lib.js';

addStrings({
  de: {
    review: 'Review', noRendersReview: 'Noch kein Render zum Ansehen.', frame: 'Frame', shot: 'Shot', section: 'Section',
    notePlaceholder: function (at) { return 'Notiz bei ' + at + ' (Enter fügt hinzu, Shift+Enter neue Zeile)'; },
    rangeIn: 'Anfang (I)', rangeOut: 'Ende (O)', rangeClear: 'Bereich löschen', range: 'Bereich', notes: 'Notizen', noNotes: 'Noch keine Notiz zu diesem Render.',
    draft: 'Entwurf', sent: function (n) { return 'gesendet · Runde ' + n; }, edit: 'Bearbeiten', remove: 'Löschen', editPrompt: 'Notiz ändern:',
    send: function (n) { return n + ' Notiz(en) an den Agenten senden'; }, nothingToSend: 'Keine neuen Notizen',
    confirmSend: function (n) { return n + ' Notiz(en) als Review-Runde an den Agenten senden? Gesendete Notizen lassen sich nicht mehr ändern.'; },
    sentRound: function (n) { return 'Runde ' + n + ' ist gesendet. In Claude Code ausführen:'; }, rounds: 'Review-Runden', open: 'offen', answered: 'beantwortet',
    replyStates: { fixed: 'behoben', partly: 'teilweise', 'not-fixed': 'nicht behoben', question: 'Rückfrage' },
    keys: 'Tasten: Leertaste Play/Pause · ←/→ ein Frame · Shift+←/→ eine Sekunde · [ ] Shot zurück/vor · , . Notiz zurück/vor · I/O Bereich · N Notiz',
    noShots: 'Keine Shots auf der Zeitleiste: ', video: 'Video'
  },
  en: {
    review: 'Review', noRendersReview: 'No render to watch yet.', frame: 'Frame', shot: 'Shot', section: 'Section',
    notePlaceholder: function (at) { return 'Note at ' + at + ' (Enter adds, Shift+Enter for a new line)'; },
    rangeIn: 'Start (I)', rangeOut: 'End (O)', rangeClear: 'Clear range', range: 'Range', notes: 'Notes', noNotes: 'No note on this render yet.',
    draft: 'draft', sent: function (n) { return 'sent · round ' + n; }, edit: 'Edit', remove: 'Delete', editPrompt: 'Change the note:',
    send: function (n) { return 'Send ' + n + ' note(s) to the agent'; }, nothingToSend: 'No new notes',
    confirmSend: function (n) { return 'Send ' + n + ' note(s) to the agent as a review round? Sent notes cannot change.'; },
    sentRound: function (n) { return 'Round ' + n + ' is sent. Run in Claude Code:'; }, rounds: 'Review rounds', open: 'open', answered: 'answered',
    replyStates: { fixed: 'fixed', partly: 'partly', 'not-fixed': 'not fixed', question: 'question' },
    keys: 'Keys: Space play/pause · ←/→ one frame · Shift+←/→ one second · [ ] previous/next shot · , . previous/next note · I/O range · N note',
    noShots: 'No shots on the timeline: ', video: 'Video'
  }
});

const view = { slug: null, data: null, video: null, inPoint: null, outPoint: null, justSent: null, hasRelease: false };
let keyHandler = null;

function pad(n, width) { return String(n).padStart(width, '0'); }
function timecode(seconds) {
  const ms = Math.round(seconds * 1000);
  return pad(Math.floor(ms / 60000), 2) + ':' + pad(Math.floor(ms / 1000) % 60, 2) + '.' + pad(ms % 1000, 3);
}
function render() { return view.data.renders.filter(function (r) { return r.name === view.video; })[0]; }
function fps() { const r = render(); return r ? r.fps : 30; }
function frameOf(seconds) { return Math.max(0, Math.floor(seconds * fps() + 1e-6)); }
function at(spans, seconds) { return spans.filter(function (s) { return s.start <= seconds && seconds < s.end; })[0]; }
function notes() { return (view.data.notes[view.video] || { notes: [] }).notes; }
function replyOf(note) {
  if (!note.round) return null;
  const round = view.data.rounds.filter(function (r) { return r.round === note.round; })[0];
  const reply = round && round.replies && round.replies.notes.filter(function (n) { return n.id === note.id; })[0];
  return reply || null;
}

/** Open a project's review view, on one render or the newest. */
export function showReview(slug, video) {
  setLang(null);
  view.slug = slug; view.inPoint = null; view.outPoint = null; view.justSent = null;
  return Promise.all([api('/api/review/' + encodeURIComponent(slug)), api('/api/production/projects/' + encodeURIComponent(slug))]).then(function (both) {
    view.data = both[0];
    view.hasRelease = both[1].hasRelease;
    const names = view.data.renders.map(function (r) { return r.name; });
    view.video = video && names.indexOf(video) >= 0 ? video : names[0] || null;
    draw();
  }).catch(showError);
}

function reload(keepTime) {
  const player = document.getElementById('player');
  const time = player ? player.currentTime : 0;
  return api('/api/review/' + encodeURIComponent(view.slug)).then(function (data) {
    view.data = data;
    draw(keepTime ? time : 0);
  }).catch(showError);
}

function seekFrame(frame) {
  const player = document.getElementById('player');
  if (!player) return;
  const max = player.duration ? frameOf(player.duration) - 1 : Infinity;
  player.pause();
  player.currentTime = (Math.min(Math.max(0, frame), max) + 0.5) / fps();
}
function currentFrame() { const player = document.getElementById('player'); return player ? frameOf(player.currentTime) : 0; }

function jumpSpan(direction) {
  const frame = currentFrame(), now = frame / fps();
  const starts = view.data.shots.map(function (s) { return s.start; }).sort(function (a, b) { return a - b; });
  const target = direction > 0 ? starts.filter(function (s) { return frameOf(s) > frame; })[0] : starts.filter(function (s) { return frameOf(s) < frame || (frameOf(s) === frame && s < now - 1e-6); }).pop();
  if (target !== undefined) seekFrame(frameOf(target));
}
function jumpNote(direction) {
  const frame = currentFrame();
  const frames = notes().map(function (n) { return n.frame; }).sort(function (a, b) { return a - b; });
  const target = direction > 0 ? frames.filter(function (f) { return f > frame; })[0] : frames.filter(function (f) { return f < frame; }).pop();
  if (target !== undefined) seekFrame(target);
}

function updateReadout() {
  const player = document.getElementById('player');
  const readout = document.getElementById('readout');
  if (!player || !readout) return;
  const seconds = player.currentTime, frame = frameOf(seconds);
  const shot = at(view.data.shots, seconds), section = at(view.data.sections, seconds);
  readout.textContent = timecode(frame / fps()) + ' · ' + t('frame') + ' ' + frame + (shot ? ' · ' + t('shot') + ' ' + shot.id : '') + (section ? ' · ' + section.label : '');
  const head = document.getElementById('playhead');
  const duration = player.duration || view.data.durationSeconds || 1;
  if (head) head.style.left = (100 * seconds / duration) + '%';
  const box = document.getElementById('note-text');
  if (box) box.placeholder = t('notePlaceholder')(timecode(frame / fps()));
}

function watchFrames(player) {
  // requestVideoFrameCallback reports the frame actually presented while playing.
  if (player.requestVideoFrameCallback) {
    const loop = function () { updateReadout(); if (document.body.contains(player)) player.requestVideoFrameCallback(loop); };
    player.requestVideoFrameCallback(loop);
  }
  ['timeupdate', 'seeked', 'loadedmetadata', 'pause'].forEach(function (name) { player.addEventListener(name, function () { updateReadout(); if (name === 'loadedmetadata') drawTimeline(); }); });
}

function drawTimeline() {
  const box = document.getElementById('timeline');
  const player = document.getElementById('player');
  if (!box) return;
  const duration = (player && player.duration) || view.data.durationSeconds || 1;
  box.innerHTML = '';
  const pct = function (s) { return (100 * s / duration) + '%'; };
  view.data.sections.forEach(function (s, i) {
    box.appendChild(el('div', { class: 'tl-section' + (i % 2 ? ' alt' : ''), style: 'left:' + pct(s.start) + ';width:' + pct(s.end - s.start), title: s.label }, [s.label]));
  });
  view.data.shots.forEach(function (s) { box.appendChild(el('div', { class: 'tl-shot', style: 'left:' + pct(s.start), title: s.id })); });
  if (view.inPoint !== null) {
    const end = view.outPoint !== null ? view.outPoint : view.inPoint;
    box.appendChild(el('div', { class: 'tl-range', style: 'left:' + pct(view.inPoint / fps()) + ';width:' + pct(Math.max(1, end - view.inPoint) / fps()) }));
  }
  notes().forEach(function (n) {
    const reply = replyOf(n);
    const cls = 'tl-note' + (n.round ? reply ? ' ' + reply.status : ' sent' : '');
    box.appendChild(el('div', { class: cls, style: 'left:' + pct(n.seconds) + (n.end_seconds !== undefined ? ';width:' + pct(n.end_seconds - n.seconds) : ''), title: n.time + ' ' + n.text }));
  });
  box.appendChild(el('div', { class: 'tl-head', id: 'playhead' }));
  box.onclick = function (event) {
    const rect = box.getBoundingClientRect();
    seekFrame(frameOf(duration * (event.clientX - rect.left) / rect.width));
  };
  updateReadout();
}

// A note sent with Enter has no button to disable, so a second Enter while it is saved sends nothing (ST-022).
let adding = null;

function addNote() {
  if (adding) return adding;
  const box = document.getElementById('note-text');
  const text = box.value.trim();
  if (!text) return;
  const start = view.inPoint !== null ? view.inPoint : currentFrame();
  const end = view.inPoint !== null && view.outPoint !== null && view.outPoint > view.inPoint ? view.outPoint : null;
  adding = post('/api/review/' + encodeURIComponent(view.slug) + '/notes', {
    video: view.video, action: 'add', seconds: (start + 0.5) / fps(), end_seconds: end === null ? null : (end + 0.5) / fps(), text: text
  }).then(function (file) {
    view.data.notes[view.video] = file; box.value = ''; view.inPoint = null; view.outPoint = null;
    drawNotes(); drawTimeline();
  }).catch(showError).finally(function () { adding = null; });
  return adding;
}

function changeNote(note, action) {
  let payload = { video: view.video, action: action, id: note.id };
  if (action === 'update') {
    const text = window.prompt(t('editPrompt'), note.text);
    if (text === null || !text.trim()) return;
    payload.text = text;
  }
  return post('/api/review/' + encodeURIComponent(view.slug) + '/notes', payload).then(function (file) {
    view.data.notes[view.video] = file; drawNotes(); drawTimeline();
  }).catch(showError);
}

function submit(count) {
  if (!window.confirm(t('confirmSend')(count))) return;
  return post('/api/review/' + encodeURIComponent(view.slug) + '/submit', { video: view.video }).then(function (round) {
    view.justSent = round.round;
    return reload(true);
  }).catch(showError);
}

function drawNotes() {
  const panel = document.getElementById('notes-panel');
  if (!panel) return;
  panel.innerHTML = '';
  const list = notes();
  const drafts = list.filter(function (n) { return !n.round; });
  const box = el('textarea', { id: 'note-text', rows: 3, class: 'note-input' });
  box.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); addNote(); }
    if (event.key === 'Escape') box.blur();
  });
  const rangeText = view.inPoint === null ? '' : t('range') + ': ' + timecode(view.inPoint / fps()) + (view.outPoint !== null ? ' – ' + timecode(view.outPoint / fps()) : ' – …');
  panel.appendChild(box);
  panel.appendChild(el('div', { class: 'range-row' }, [
    el('button', { class: 'small', text: t('rangeIn'), onclick: function () { setIn(); } }),
    el('button', { class: 'small', text: t('rangeOut'), onclick: function () { setOut(); } }),
    view.inPoint !== null ? el('button', { class: 'small', text: t('rangeClear'), onclick: function () { view.inPoint = null; view.outPoint = null; drawNotes(); drawTimeline(); } }) : null,
    el('span', { class: 'sub', text: rangeText })
  ]));
  panel.appendChild(el('h3', { class: 'section-title', text: t('notes') + ' (' + list.length + ')' }));
  if (!list.length) panel.appendChild(el('p', { class: 'empty', text: t('noNotes') }));
  list.forEach(function (note) {
    const reply = replyOf(note);
    const shots = view.data.shots.filter(function (s) { const end = note.end_seconds !== undefined ? note.end_seconds : note.seconds; return s.start < end + 0.5 / fps() && s.end > note.seconds - 0.5 / fps(); }).map(function (s) { return s.id; });
    panel.appendChild(el('div', { class: 'note' + (note.round ? ' sent' : '') }, [
      el('div', { class: 'note-head' }, [
        el('a', { href: '#', text: note.time + (note.end_time ? ' – ' + note.end_time : ''), onclick: function (e) { e.preventDefault(); seekFrame(note.frame); } }),
        shots.length ? el('span', { class: 'sub', text: shots.join(', ') }) : null,
        el('span', { class: 'pill' + (reply ? ' ' + reply.status : ''), text: reply ? t('replyStates')[reply.status] : note.round ? t('sent')(note.round) : t('draft') })
      ]),
      el('div', { class: 'note-text', text: note.text }),
      reply ? el('div', { class: 'note-reply', text: reply.reply }) : null,
      note.round ? null : el('div', { class: 'note-actions' }, [
        el('button', { class: 'small', text: t('edit'), onclick: pending(function () { return changeNote(note, 'update'); }) }),
        el('button', { class: 'small', text: t('remove'), onclick: pending(function () { return changeNote(note, 'delete'); }) })
      ])
    ]));
  });
  const send = el('button', { class: 'primary', text: drafts.length ? t('send')(drafts.length) : t('nothingToSend'), disabled: drafts.length ? undefined : true, onclick: pending(function () { return submit(drafts.length); }) });
  panel.appendChild(el('p', {}, [send]));
  if (view.justSent) {
    const command = '/video-next ' + view.slug;
    panel.appendChild(el('div', { class: 'next' }, [el('span', { text: t('sentRound')(view.justSent) }), el('code', { text: command }), copyButton(command, { copy: t('copy'), copied: t('copied') })]));
  }
  updateReadout();
}

function setIn() { view.inPoint = currentFrame(); if (view.outPoint !== null && view.outPoint <= view.inPoint) view.outPoint = null; drawNotes(); drawTimeline(); }
function setOut() { const frame = currentFrame(); if (view.inPoint === null || frame <= view.inPoint) return; view.outPoint = frame; drawNotes(); drawTimeline(); }

function drawRounds() {
  const rounds = view.data.rounds.slice().reverse();
  if (!rounds.length) return null;
  return el('section', { class: 'card' }, [el('h3', { text: t('rounds'), style: 'margin:0 0 10px;font-size:15px' }), el('table', { class: 'list' }, rounds.map(function (r) {
    const counts = {};
    (r.replies ? r.replies.notes : []).forEach(function (n) { counts[n.status] = (counts[n.status] || 0) + 1; });
    const summary = Object.keys(counts).map(function (k) { return counts[k] + ' ' + t('replyStates')[k]; }).join(' · ');
    return el('tr', {}, [
      el('td', { class: 'num', text: '#' + r.round }), el('td', { class: 'num', text: local(r.submitted_at) }), el('td', { text: r.video }),
      el('td', { text: r.notes.length + ' ' + t('notes') }),
      el('td', {}, [el('span', { class: 'pill ' + (r.open ? 'running' : 'done'), text: r.open ? t('open') : t('answered') }), summary ? ' ' + summary : ''])
    ]);
  }))]);
}

function draw(time) {
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.appendChild(el('header', { class: 'project' }, [el('h2', { text: view.data.title })]));
  main.appendChild(viewTabs(view.slug, 'review', view.hasRelease));
  if (!view.video) { main.appendChild(el('p', { class: 'empty', text: t('noRendersReview') })); return; }
  const select = view.data.renders.length > 1 ? el('select', { class: 'video-select', onchange: function () { go('#/p/' + view.slug + '/review/' + encodeURIComponent(select.value)); } }, view.data.renders.map(function (r) {
    return el('option', { value: r.name, selected: r.name === view.video ? true : undefined, text: r.name + ' · ' + local(r.modified) });
  })) : null;
  const player = el('video', { id: 'player', src: projectFile(view.slug, render().path), preload: 'auto', controls: true });
  const button = function (text, title, fn) { return el('button', { class: 'small', text: text, title: title, onclick: function () { fn(); player.focus(); } }); };
  const controls = el('div', { class: 'controls' }, [
    button('⏮', ', ', function () { jumpNote(-1); }), button('[', '[', function () { jumpSpan(-1); }),
    button('−1s', 'Shift+←', function () { seekFrame(currentFrame() - Math.round(fps())); }), button('−1f', '←', function () { seekFrame(currentFrame() - 1); }),
    button('⏯', 'Space', function () { if (player.paused) player.play(); else player.pause(); }),
    button('+1f', '→', function () { seekFrame(currentFrame() + 1); }), button('+1s', 'Shift+→', function () { seekFrame(currentFrame() + Math.round(fps())); }),
    button(']', ']', function () { jumpSpan(1); }), button('⏭', '.', function () { jumpNote(1); }),
    el('span', { id: 'readout', class: 'readout' })
  ]);
  const left = el('div', { class: 'review-main' }, [
    select, player, controls, el('div', { id: 'timeline', class: 'timeline' }),
    view.data.shotsError ? el('p', { class: 'sub', text: t('noShots') + view.data.shotsError }) : null,
    el('p', { class: 'sub', text: t('keys') })
  ]);
  main.appendChild(el('div', { class: 'review' }, [left, el('aside', { id: 'notes-panel', class: 'notes-panel' })]));
  const rounds = drawRounds();
  if (rounds) main.appendChild(rounds);
  watchFrames(player);
  if (time) player.addEventListener('loadedmetadata', function () { player.currentTime = time; }, { once: true });
  drawNotes();
  drawTimeline();
  bindKeys(player);
}

function bindKeys(player) {
  if (keyHandler) document.removeEventListener('keydown', keyHandler, true);
  keyHandler = function (event) {
    if (!document.body.contains(player)) { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; return; }
    const tag = (event.target && event.target.tagName) || '';
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? Math.round(fps()) : 1;
    const keys = {
      ' ': function () { if (player.paused) player.play(); else player.pause(); },
      ArrowLeft: function () { seekFrame(currentFrame() - step); }, ArrowRight: function () { seekFrame(currentFrame() + step); },
      '[': function () { jumpSpan(-1); }, ']': function () { jumpSpan(1); },
      ',': function () { jumpNote(-1); }, '.': function () { jumpNote(1); },
      i: setIn, I: setIn, o: setOut, O: setOut,
      n: function () { player.pause(); document.getElementById('note-text').focus(); }, N: function () { player.pause(); document.getElementById('note-text').focus(); }
    };
    const fn = keys[event.key];
    if (fn) { event.preventDefault(); event.stopPropagation(); fn(); }
  };
  // Capture phase: the player's own controls would otherwise seek by seconds on the arrow keys.
  document.addEventListener('keydown', keyHandler, true);
}
