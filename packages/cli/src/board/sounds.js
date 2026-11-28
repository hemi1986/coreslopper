// The sound library: the workspace's recurring meme sounds (library/sounds/<id>/,
// ADR 0051), each described so the meme skill picks well.
//   #/sounds        the list (a table: a play button per row, search, tag/unused/licence filters, sort, all in the
//                   hash), an upload
//   #/sounds/<id>   one sound: play it, set its cue from the playback, edit, remove
import { addStrings, api, el, go, pending, post, setLang, showError, t, upload } from './lib.js';
import { allTags, anyLibraryFilter, defaultDir, libraryListHash, matchesLibraryItem, parseLibraryListState, queryOf, sortLibraryItems, toggleValue, writeListHash } from './list-state.js';

addStrings({
  de: {
    soundTitle: 'Sounds', soundHelp: 'Die Sound-Bibliothek deiner Memes: jeder wiederkehrende Ton mit dem, wofür er gedacht ist. Die Beschreibungen entscheiden, welchen Sound das Meme-Skill wählt; ein Upload misst Länge und Lautheit, die Lizenz bleibt deine Angabe.',
    soundEmpty: 'Die Bibliothek hat noch keine Sounds. Lade einen wiederkehrenden Ton hoch – ein Boom, ein Record Scratch, ein Sting – und beschreibe, wofür er gedacht ist: danach wählt das Meme-Skill.',
    soundUpload: 'Sound hochladen', soundNeedsFile: 'Wähle eine Audiodatei zum Hochladen.',
    soundFile: 'Audiodatei', soundTitleField: 'Titel', soundUseWhen: 'Wofür (das Skill wählt danach)', soundTags: 'Schlagworte, mit Komma',
    soundCue: 'Cue in Sekunden', soundTrim: 'Trim von-bis, z. B. 0.1-1.2', soundLicence: 'Lizenz', soundSource: 'Quelle (URL oder Worte)', soundCredit: 'Credit (wenn die Lizenz ihn verlangt)',
    soundCreate: 'Hochladen', soundUploading: 'lädt hoch …',
    soundUsedIn: 'Verwendet in', soundUsedNowhere: 'noch nirgends', soundLength: 'Länge', soundLoudness: 'Lautheit',
    soundCueLabel: 'Cue', soundTrimLabel: 'Trim', soundLicenceLabel: 'Lizenz', soundTagsLabel: 'Schlagworte', soundNoTags: 'keine',
    soundBack: '← Alle Sounds', soundPlayHint: 'Abspielen, dann den Cue aus der Abspielposition setzen; ein neuer Trim behält den Moment, wenn du den Cue nicht anfasst.',
    soundSetCue: 'Cue aus Abspielposition', soundCueSet: function (seconds) { return 'Cue auf ' + seconds + ' s gesetzt.'; },
    soundEdit: 'Bearbeiten', soundSave: 'Speichern', soundCancel: 'Abbrechen',
    soundDelete: 'Aus der Bibliothek löschen', soundConfirmDelete: function (where) { return 'Diesen Sound aus der Bibliothek löschen? ' + (where.length ? 'Verwendet in: ' + where.join(', ') + '.' : 'Er wird nirgends verwendet.') + ' Memes behalten ihre Kopien.'; },
    sdEmpty: 'Noch keine Sounds', sdSearch: 'Suche in Titel, Wofür und Schlagworten …', sdTags: 'Schlagworte', sdUnused: 'unbenutzt', sdLicence: 'Lizenz', sdAll: 'alle',
    sdNoMatch: 'Kein Sound passt zu diesen Filtern', sdReset: 'Filter zurücksetzen', sdPlay: 'Abspielen', sdStop: 'Stopp',
    sdCols: { title: 'Titel', useWhen: 'Wofür', length: 'Länge', licence: 'Lizenz', tags: 'Schlagworte', used: 'Verwendet in' },
    sdCount: function (n, all) { return n + ' von ' + all; }
  },
  en: {
    soundTitle: 'Sounds', soundHelp: 'The sound library of your memes: every recurring sound with what it is for. The descriptions decide which sound the meme skill picks; an upload measures length and loudness, the licence stays yours to state.',
    soundEmpty: 'The library has no sounds yet. Upload a recurring sound – a boom, a record scratch, a sting – and describe what it is for: the meme skill picks by that.',
    soundUpload: 'Upload a sound', soundNeedsFile: 'Choose an audio file to upload.',
    soundFile: 'Audio file', soundTitleField: 'Title', soundUseWhen: 'Use when (the skill picks by it)', soundTags: 'Tags, comma-separated',
    soundCue: 'Cue in seconds', soundTrim: 'Trim start-end, e.g. 0.1-1.2', soundLicence: 'Licence', soundSource: 'Source (URL or words)', soundCredit: 'Credit (when the licence asks for it)',
    soundCreate: 'Upload', soundUploading: 'uploading …',
    soundUsedIn: 'Used in', soundUsedNowhere: 'nowhere yet', soundLength: 'Length', soundLoudness: 'Loudness',
    soundCueLabel: 'Cue', soundTrimLabel: 'Trim', soundLicenceLabel: 'Licence', soundTagsLabel: 'Tags', soundNoTags: 'none',
    soundBack: '← All sounds', soundPlayHint: 'Play, then set the cue from the playback position; a new trim keeps the moment when you leave the cue untouched.',
    soundSetCue: 'Cue from playback', soundCueSet: function (seconds) { return 'Cue set to ' + seconds + ' s.'; },
    soundEdit: 'Edit', soundSave: 'Save', soundCancel: 'Cancel',
    soundDelete: 'Delete from the library', soundConfirmDelete: function (where) { return 'Delete this sound from the library? ' + (where.length ? 'Used in: ' + where.join(', ') + '.' : 'It is not used anywhere.') + ' Memes keep their copies.'; },
    sdEmpty: 'No sounds yet', sdSearch: 'Search title, use when and tags …', sdTags: 'Tags', sdUnused: 'unused', sdLicence: 'Licence', sdAll: 'all',
    sdNoMatch: 'No sound matches these filters', sdReset: 'Reset filters', sdPlay: 'Play', sdStop: 'Stop',
    sdCols: { title: 'Title', useWhen: 'Use when', length: 'Length', licence: 'Licence', tags: 'Tags', used: 'Used in' },
    sdCount: function (n, all) { return n + ' of ' + all; }
  }
});

function main() { const node = document.getElementById('main'); node.innerHTML = ''; return node; }
function load() { return api('/api/sounds'); }
export function soundFile(id) { return '/sound-files/' + encodeURIComponent(id) + '/sound.wav'; }
function input(attrs) { return el('input', Object.assign({ class: 'text' }, attrs)); }
function field(label, control) { return el('label', { class: 'form-field' }, [el('span', { text: label }), control]); }
function trimmed(entry) { return entry.trim ? entry.trim.end - entry.trim.start : entry.length; }
function clock(entry) { return Math.round(trimmed(entry) * 1000) / 1000 + ' s'; }
function param(name, value) { return value === undefined || value === null || value === '' ? '' : '&' + name + '=' + encodeURIComponent(value); }

// ------------------------------------------------------------------ upload

function uploadForm(onCreated) {
  const file = el('input', { type: 'file', accept: 'audio/*,.wav,.mp3,.flac,.aif,.aiff,.m4a,.ogg,.opus' });
  const title = input({ required: true });
  const useWhen = el('textarea', { class: 'note-input', rows: 2, required: true });
  const tags = input({});
  const cue = input({ type: 'number', min: '0', step: '0.001' });
  const trim = input({ placeholder: '0.1-1.2' });
  const licence = input({ placeholder: 'unknown' });
  const source = input({});
  const credit = input({});
  const error = el('p', { class: 'error' });
  const progress = el('p', { class: 'meta' });
  const form = el('form', { class: 'card form' }, [
    el('h3', { text: t('soundUpload'), style: 'margin:0 0 10px' }),
    el('div', { class: 'form-row' }, [field(t('soundFile'), file), field(t('soundTitleField'), title), field(t('soundTags'), tags)]),
    el('div', { class: 'form-row' }, [field(t('soundUseWhen'), useWhen)]),
    el('div', { class: 'form-row' }, [field(t('soundCue'), cue), field(t('soundTrim'), trim), field(t('soundLicence'), licence)]),
    el('div', { class: 'form-row' }, [field(t('soundSource'), source), field(t('soundCredit'), credit)]),
    error, progress, el('button', { class: 'primary', type: 'submit', text: t('soundCreate') })
  ]);
  form.onsubmit = pending(function () {
    error.textContent = '';
    progress.textContent = '';
    if (!file.files[0]) { error.textContent = t('soundNeedsFile'); return; }
    const query = '?name=' + encodeURIComponent(file.files[0].name) + param('title', title.value) + param('use-when', useWhen.value)
      + param('tags', tags.value) + param('cue', cue.value) + param('trim', trim.value)
      + param('licence', licence.value) + param('source', source.value) + param('credit', credit.value);
    return upload('/api/upload/sounds' + query, file.files[0], function (share) { progress.textContent = t('soundUploading') + ' ' + Math.round(share * 100) + '%'; })
      .then(function (result) { onCreated(result.sound.id); })
      // A refused upload names its reason and leaves what was typed in the form.
      .catch(function (e) { error.textContent = e.message; progress.textContent = ''; });
  });
  return form;
}

// --------------------------------------------------------------------- list

/** The list's route; its query may hold any character, a decoded line break too. */
export const SOUNDS_ROUTE = /^#\/sounds\/?(?:\?[\s\S]*)?$/;

// A sound has no origin: its one-of filter is the licence, `licence=` in the address (list-state.js).
const LIST = { sorts: ['title', 'length', 'licence', 'used'], ascending: ['title', 'licence'], facet: 'licence' };

/** One item per library sound of `/api/sounds`, and one per entry that does not load (`error`). */
export function soundItems(data) {
  const items = data.sounds.map(function (entry) {
    return {
      id: entry.id, name: entry.title, entry: entry, search: [entry.title, entry.use_when].concat(entry.tags), tags: entry.tags,
      length: trimmed(entry), used: entry.used_in.length, origin: entry.licence, href: '#/sounds/' + entry.id
    };
  });
  const errors = (data.errors || []).map(function (error) { return { id: error.id, name: error.id, error: error.error, search: [error.id], tags: [], used: 0, origin: '' }; });
  return { items: items, errors: errors };
}

/** The list options for a library: its tags and licences are the values the address may name. */
export function soundListOptions(list) {
  const licences = [];
  list.items.forEach(function (item) { if (licences.indexOf(item.origin) < 0) licences.push(item.origin); });
  licences.sort(function (a, b) { return a.localeCompare(b); });
  return Object.assign({ tags: allTags(list.items), origins: licences }, LIST);
}

/** The list's state from the query of `#/sounds?…`; unknown values are ignored. */
export function parseSoundState(query, list) { return parseLibraryListState(query, soundListOptions(list)); }

/** The address of a list state; defaults are left out. */
export function soundHash(state) { return libraryListHash('#/sounds', state, LIST); }

/**
 * The rows to show, sorted by the state's column: the sounds that match, then the entries that do not load. An
 * unreadable entry has no tags, uses or licence, so it shows only while no filter is set and the search, if any,
 * finds its id.
 */
export function soundRows(list, state) {
  const keys = {
    length: function (item) { return item.length; },
    licence: function (item) { return item.origin; },
    used: function (item) { return item.used; }
  };
  const rows = sortLibraryItems(list.items.filter(function (item) { return matchesLibraryItem(item, state); }), state, keys);
  const filtered = state.tag.length || state.unused || state.origin;
  return filtered ? rows : rows.concat(list.errors.filter(function (item) { return matchesLibraryItem(item, state); }));
}

let view = null; // { data, list, state, results, reset, audio }
let listAddress = '#/sounds'; // the list's last address, for the detail page's back link
let playing = null; // { id, button }: the row whose sound plays

// ------------------------------------------------------------ the row player

// One audio element per list plays the row's trimmed sound. It stays in the page, so the board's Refresh keeps a
// playing list (viewBusy) and a redraw of the rows does not stop it.
function showPlaying(button, on) {
  if (!button) return;
  button.className = 'pl-chip sd-play' + (on ? ' on' : '');
  button.setAttribute('aria-pressed', on ? 'true' : 'false');
  button.setAttribute('aria-label', on ? t('sdStop') : t('sdPlay'));
  button.textContent = on ? '■' : '▶';
}

function stopPlaying() {
  const was = playing;
  playing = null;
  if (!was) return;
  showPlaying(was.button, false);
  if (view && view.audio) view.audio.pause();
}

function playerFor() {
  const audio = el('audio', { class: 'sd-player', preload: 'none' });
  // The trim's end stops the sound; a pause from elsewhere (the end, the page) puts the button back.
  audio.addEventListener('timeupdate', function () {
    const entry = playing && view.list.items.filter(function (item) { return item.id === playing.id; })[0];
    if (entry && entry.entry.trim && audio.currentTime >= entry.entry.trim.end) stopPlaying();
  });
  // The events come as tasks: a pause queued by the previous sound finds the next one already playing and is ignored.
  const ended = function () { if (playing && audio.paused) { showPlaying(playing.button, false); playing = null; } };
  audio.addEventListener('pause', ended);
  audio.addEventListener('ended', ended);
  return audio;
}

/** Play a row's sound from its trim's start, stop it on a second click; another row stops the first. */
function toggle(item, button) {
  const same = playing && playing.id === item.id;
  stopPlaying();
  if (same) return;
  const audio = view.audio;
  const trim = item.entry.trim;
  // A media fragment starts and ends the sound at its trim; the timeupdate guard ends it where a browser ignores it.
  audio.src = soundFile(item.id) + (trim ? '#t=' + trim.start + ',' + trim.end : '');
  audio.currentTime = trim ? trim.start : 0;
  playing = { id: item.id, button: button };
  showPlaying(button, true);
  const started = audio.play();
  if (started && started.catch) started.catch(function () { if (playing && playing.id === item.id) stopPlaying(); });
}

// ------------------------------------------------------------- the table

function setState(state, full) {
  view.state = state;
  listAddress = soundHash(state);
  writeListHash(listAddress);
  if (full) drawList(); else drawResults();
}

function quiet(event) { if (event && event.stopPropagation) event.stopPropagation(); }

function resetButton(className) {
  return el('button', { class: className + ' sd-reset', onclick: function () { setState(parseSoundState('', view.list), true); } }, [t('sdReset')]);
}

function filterBar() {
  const state = view.state;
  view.reset = el('span', { class: 'pl-reset' });
  const search = el('input', { type: 'search', class: 'pl-search', placeholder: t('sdSearch'), 'aria-label': t('sdSearch'), value: state.q, oninput: function (event) {
    // The search is in the address, so a refresh need not keep the view for it (app.js marks other input as edited).
    quiet(event);
    setState(Object.assign({}, view.state, { q: event.target.value }), false);
  } });
  search.value = state.q;
  const options = soundListOptions(view.list);
  const tags = options.tags.length ? el('div', { class: 'pl-filter', role: 'group', 'aria-label': t('sdTags') }, [el('span', { class: 'pl-label', text: t('sdTags') })].concat(options.tags.map(function (tag) {
    const on = state.tag.indexOf(tag) >= 0;
    return el('button', { class: 'pl-chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-tag': tag, onclick: function () {
      setState(Object.assign({}, view.state, { tag: toggleValue(view.state.tag, tag) }), true);
    } }, ['#' + tag]);
  }))) : null;
  const unused = el('button', { class: 'pl-chip sd-unused' + (state.unused ? ' on' : ''), 'aria-pressed': state.unused ? 'true' : 'false', onclick: function () {
    setState(Object.assign({}, view.state, { unused: !view.state.unused }), true);
  } }, [t('sdUnused')]);
  const licence = el('select', { class: 'pl-select sd-licence', 'aria-label': t('sdLicence'), oninput: quiet, onchange: function (event) {
    setState(Object.assign({}, view.state, { origin: event.target.value }), true);
  } }, [el('option', { value: '', text: t('sdAll') })].concat(options.origins.map(function (value) {
    return el('option', { value: value, selected: value === state.origin, text: value });
  })));
  licence.value = state.origin;
  return el('div', { class: 'pl-filters' }, [
    search, tags, el('div', { class: 'pl-filter' }, [unused]),
    el('label', { class: 'pl-filter' }, [el('span', { class: 'pl-label', text: t('sdLicence') }), licence]),
    view.reset
  ]);
}

function header() {
  const cols = t('sdCols');
  const th = function (col, sortable) {
    if (!sortable) return el('th', { text: col ? cols[col] : '' });
    const on = view.state.sort === col;
    return el('th', { class: 'pl-sort' + (on ? ' on' : ''), 'data-sort': col, 'aria-sort': on ? (view.state.dir === 'asc' ? 'ascending' : 'descending') : null, onclick: function () {
      const next = Object.assign({}, view.state);
      if (on) next.dir = view.state.dir === 'asc' ? 'desc' : 'asc';
      else { next.sort = col; next.dir = defaultDir(col, LIST); }
      setState(next, false);
    } }, [cols[col] + (on ? (view.state.dir === 'asc' ? ' ▲' : ' ▼') : '')]);
  };
  return el('thead', {}, [el('tr', {}, [th(''), th('title', true), th('useWhen'), th('length', true), th('licence', true), th('tags'), th('used', true)])]);
}

function row(item) {
  if (item.error) return el('tr', { class: 'pl-error', 'data-id': item.id }, [
    el('td', {}, [el('span', { class: 'sd-play placeholder', text: '!' })]), el('td', {}, [el('b', { text: item.id })]),
    el('td', { colspan: '5', class: 'error', text: item.error })
  ]);
  const entry = item.entry;
  const button = el('button', { class: 'pl-chip sd-play', type: 'button', onclick: function (event) {
    // The play button plays in the row; the click must not open the sound's page.
    quiet(event);
    toggle(item, button);
  } });
  const on = Boolean(playing && playing.id === item.id);
  if (on) playing.button = button;
  showPlaying(button, on);
  return el('tr', { class: 'link-row', 'data-id': item.id, onclick: function () { go(item.href); } }, [
    el('td', {}, [button]),
    el('td', {}, [el('b', { text: entry.title }), el('span', { class: 'sub', text: entry.id })]),
    el('td', { class: 'sd-use', title: entry.use_when, text: entry.use_when }),
    el('td', { class: 'num', text: clock(entry) }),
    el('td', { text: entry.licence }),
    el('td', { class: 'cl-tags', text: entry.tags.map(function (tag) { return '#' + tag; }).join(' ') }),
    el('td', { class: 'num', text: String(item.used) })
  ]);
}

function drawResults() {
  const results = view.results;
  results.innerHTML = '';
  // The search redraws only the results, so the reset button of the bar is drawn here too.
  view.reset.innerHTML = '';
  if (anyLibraryFilter(view.state)) view.reset.appendChild(resetButton('small'));
  const rows = soundRows(view.list, view.state);
  // A sound that is filtered out stops; one still in the list keeps playing.
  if (playing && !rows.some(function (item) { return item.id === playing.id; })) stopPlaying();
  if (!rows.length) {
    results.appendChild(el('div', { class: 'empty sd-nomatch' }, [el('p', { text: t('sdNoMatch') }), resetButton('primary')]));
    return;
  }
  results.appendChild(el('p', { class: 'sub pl-count', text: t('sdCount')(rows.length, view.list.items.length + view.list.errors.length) }));
  results.appendChild(el('table', { class: 'list pl-table cl-table sd-table' }, [header(), el('tbody', {}, rows.map(row))]));
}

function drawList() {
  const node = main();
  node.appendChild(el('h2', { text: t('soundTitle'), style: 'margin:0 0 6px;font-size:20px' }));
  node.appendChild(el('p', { class: 'meta', text: t('soundHelp') }));
  // The same audio element goes back into the page at once, so a full redraw does not stop a playing sound.
  node.appendChild(view.audio);
  if (!view.list.items.length && !view.list.errors.length) node.appendChild(el('div', { class: 'empty sd-empty' }, [el('p', { text: t('sdEmpty') })]));
  else {
    node.appendChild(filterBar());
    view.results = el('div', { class: 'pl-results' });
    node.appendChild(view.results);
    drawResults();
  }
  node.appendChild(uploadForm(function (id) { go('#/sounds/' + id); }));
}

function gallery() {
  const query = queryOf(location.hash);
  return load().then(function (data) {
    // A new list (a refresh, a return from a sound) starts silent.
    stopPlaying();
    const list = soundItems(data);
    view = { data: data, list: list, state: parseSoundState(query, list), results: null, reset: null, audio: playerFor() };
    listAddress = soundHash(view.state);
    drawList();
  }).catch(showError);
}

// ------------------------------------------------------------------- detail

function editForm(entry, refresh) {
  const title = input({ value: entry.title });
  const useWhen = el('textarea', { class: 'note-input', rows: 3 });
  useWhen.value = entry.use_when;
  const tags = input({ value: entry.tags.join(', ') });
  const cue = input({ value: entry.cue !== undefined ? String(entry.cue) : '', type: 'number', min: '0', step: '0.001' });
  const trim = input({ value: entry.trim ? entry.trim.start + '-' + entry.trim.end : '' });
  const licence = input({ value: entry.licence });
  const source = input({ value: entry.source || '' });
  const credit = input({ value: entry.credit || '' });
  const error = el('p', { class: 'error' });
  return el('div', { class: 'form' }, [
    el('div', { class: 'form-row' }, [field(t('soundTitleField'), title), field(t('soundTags'), tags)]),
    el('div', { class: 'form-row' }, [field(t('soundUseWhen'), useWhen)]),
    el('div', { class: 'form-row' }, [field(t('soundCue'), cue), field(t('soundTrim'), trim), field(t('soundLicence'), licence)]),
    el('div', { class: 'form-row' }, [field(t('soundSource'), source), field(t('soundCredit'), credit)]),
    error,
    el('div', { class: 'form-row' }, [
      el('button', { class: 'primary', text: t('soundSave'), onclick: pending(function () {
        const change = { action: 'update', title: title.value, useWhen: useWhen.value, tags: tags.value, trim: trim.value, licence: licence.value, source: source.value, credit: credit.value };
        // A cue the user did not touch stays out of the change, so a new trim keeps the moment the sound lands on.
        if (cue.value.trim() !== (entry.cue !== undefined ? String(entry.cue) : '')) change.cue = cue.value;
        // The form stays as it is, so a refusal keeps what was typed.
        return post('/api/sounds/' + encodeURIComponent(entry.id), change).then(refresh).catch(function (e) { error.textContent = e.message; });
      }) }),
      el('button', { class: 'small', text: t('soundCancel'), onclick: refresh })
    ])
  ]);
}

function detail(id) {
  return load().then(function (data) {
    const entry = data.sounds.filter(function (sound) { return sound.id === id; })[0];
    const node = main();
    node.appendChild(el('p', {}, [el('a', { class: 'back-link', href: listAddress, text: t('soundBack') })]));
    if (!entry) { node.appendChild(el('p', { class: 'error', text: id + ': ?' })); return; }
    node.appendChild(el('header', { class: 'project' }, [el('h2', { text: entry.title }), el('span', { class: 'chip', text: entry.id })]));

    // Play the sound and set its cue from where it plays; a cue counts from the trim's start.
    const audio = el('audio', { class: 'sound-player', controls: true, preload: 'metadata', src: soundFile(entry.id) });
    const message = el('p', { class: 'meta' });
    const cueValue = el('b', { text: entry.cue !== undefined ? entry.cue + ' s' : '—' });
    const cueButton = el('button', { class: 'small', text: t('soundSetCue'), onclick: pending(function () {
      const at = Math.round((audio.currentTime - (entry.trim ? entry.trim.start : 0)) * 1000) / 1000;
      return post('/api/sounds/' + encodeURIComponent(entry.id), { action: 'update', cue: at }).then(function () {
        // The form behind the button reads the same entry, so it shows the new cue without reloading the player.
        entry.cue = at;
        cueValue.textContent = at + ' s';
        message.className = 'meta';
        message.textContent = t('soundCueSet')(at);
      }).catch(function (e) { message.className = 'error'; message.textContent = e.message; });
    }) });
    const facts = el('section', { class: 'card' }, [
      audio,
      el('p', { class: 'meta', text: t('soundPlayHint') }),
      el('div', { class: 'form-row', style: 'align-items:center' }, [cueButton, message]),
      el('p', { class: 'meta' }, [el('b', { text: t('soundLength') + ': ' }), entry.length + ' s' + (entry.trim ? ' · ' + t('soundTrimLabel') + ' ' + entry.trim.start + '–' + entry.trim.end + ' (' + clock(entry) + ')' : '')]),
      el('p', { class: 'meta' }, [el('b', { text: t('soundLoudness') + ': ' }), entry.loudness + ' LUFS']),
      el('p', { class: 'meta' }, [el('b', { text: t('soundCueLabel') + ': ' }), cueValue]),
      el('p', { class: 'meta' }, [el('b', { text: t('soundLicenceLabel') + ': ' }), entry.licence]),
      entry.credit ? el('p', { class: 'meta' }, [el('b', { text: t('soundCredit') + ': ' }), entry.credit]) : null,
      entry.source ? el('p', { class: 'meta' }, [el('b', { text: t('soundSource') + ': ' }), entry.source]) : null,
      el('p', { class: 'meta' }, [el('b', { text: t('soundTagsLabel') + ': ' }), entry.tags.length ? entry.tags.map(function (tag) { return '#' + tag; }).join(' ') : t('soundNoTags')]),
      el('p', { class: 'meta' }, [el('b', { text: t('soundUsedIn') + ': ' })].concat(entry.used_in.length ? entry.used_in.map(function (slug, index) {
        return el('span', {}, [index ? ', ' : '', el('a', { href: '#/p/' + slug, text: slug })]);
      }) : [t('soundUsedNowhere')]))
    ]);
    node.appendChild(facts);

    const about = el('section', { class: 'card' });
    const refresh = function () { detail(id); };
    const showEdit = function () { about.innerHTML = ''; about.appendChild(editForm(entry, refresh)); };
    about.appendChild(el('button', { class: 'small', text: t('soundEdit'), onclick: showEdit }));
    node.appendChild(about);

    node.appendChild(el('button', { class: 'small', text: t('soundDelete'), onclick: pending(function () {
      if (!window.confirm(t('soundConfirmDelete')(entry.used_in))) return;
      return post('/api/sounds/' + encodeURIComponent(entry.id), { action: 'delete' }).then(function () { go('#/sounds'); }).catch(showError);
    }) }));
  }).catch(showError);
}

/** Route `#/sounds[?…]` (the list) and `#/sounds/<id>`. */
export function showSounds(id) {
  setLang(null);
  // Leaving the list for a sound's page stops the row player.
  if (id) stopPlaying();
  return id ? detail(id) : gallery();
}
