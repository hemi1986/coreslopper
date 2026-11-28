// The character library: every character of the workspace's videos and
// series, to take into a new music video or series canon with one click.
//   #/characters        the list (a table: search, tag/unused/origin filters, sort, all in the hash);
//                       its + New opens the character wizard (#/new/character, character-wizard.js)
//   #/characters/<id>   one character: files, states, where it is used, use it
import { addStrings, api, el, go, pending, post, setLang, showError, t, upload } from './lib.js';
import { librarySelection } from './library-selection.js';
import { allTags, anyLibraryFilter, defaultDir, libraryListHash, matchesLibraryItem, parseLibraryListState, queryOf, sortLibraryItems, toggleValue, writeListHash } from './list-state.js';

addStrings({
  de: {
    libTitle: 'Figuren', libHelp: 'Alle Figuren aus deinen Videos und Serien. Eine Figur kommt automatisch hinein, sobald style-character eines Projekts fertig ist; eigene legst du mit + Neu an oder übernimmst sie aus einem Projekt. Beim Übernehmen landen ihre Dateien im Projekt unter characters/<id>/.',
    libEmpty: 'Noch keine Figuren', clNew: '+ Neu',
    name: 'Name', description: 'Beschreibung (Aussehen, Alter, Haare, Outfit)', prompt: 'Prompt-Satz für Keyframes', tags: 'Schlagworte, mit Komma', face: 'Darstellung',
    faces: { full: 'voll sichtbar', silhouette: 'nur Silhouette', 'screen-only': 'nur auf Bildschirmen', 'voice-only': 'nur Stimme' },
    sheet: 'Character Sheet', images: 'Weitere Bilder (Seed, Face, Outfits)', voice: 'Stimme (WAV)', transcript: 'Exakter Text der Aufnahme', createChar: 'Anlegen', uploading: 'lädt hoch …',
    refs: 'Bilder', states: 'Zustände', statesHelp: 'Zustände aus früheren Produktionen. Beim Übernehmen nur die angehakten.', noStates: 'keine', usedIn: 'Verwendet in', usedNowhere: 'noch nirgends',
    useIn: 'Übernehmen in', useButton: 'Übernehmen', used: function (r) { return (r.updated ? 'Ergänzt: ' : 'Übernommen: ') + r.files.length + ' Dateien' + (r.states.length ? ', Zustände ' + r.states.join(', ') : ''); },
    inTarget: 'im Projekt', fromOrigin: 'aus', manual: 'von Hand angelegt', history: 'Verlauf', addFile: 'Datei hinzufügen', role: 'Als', roles: { ref: 'Referenz', sheet: 'Sheet', voice: 'Stimme' },
    edit: 'Bearbeiten', save: 'Speichern', cancel: 'Abbrechen', deleteChar: 'Aus der Bibliothek löschen', confirmDelete: 'Diese Figur und ihre Dateien aus der Bibliothek löschen? Projekte behalten ihre Kopien.',
    removeFile: 'Entfernen', confirmRemoveFile: function (n) { return n + ' aus der Bibliothek löschen?'; }, back: '← Alle Figuren', series: 'Serie', project: 'Video',
    pickHelp: 'Figuren aus der Bibliothek übernehmen: Ihre Bilder landen in characters/<id>/, der Agent baut beim Character-Bible darauf auf, statt sie neu zu erzeugen. Zustände nur, wenn angehakt.',
    pickEmpty: 'Die Bibliothek ist leer; sie füllt sich mit jedem fertigen Projekt. Eigene Figuren unter Figuren anlegen.', openLibrary: 'Bibliothek öffnen',
    clSearch: 'Suche in Name, Beschreibung und Schlagworten …', clTags: 'Schlagworte', clUnused: 'unbenutzt', clOrigin: 'Herkunft', clAll: 'alle',
    clNoMatch: 'Keine Figur passt zu diesen Filtern', clReset: 'Filter zurücksetzen', clYes: 'ja', clNo: 'nein', clManual: 'manuell', clFrom: 'aus',
    clCols: { name: 'Name', face: 'Darstellung', tags: 'Schlagworte', images: 'Bilder', voice: 'Stimme', used: 'Verwendet in', origin: 'Herkunft' },
    clImages: function (images, states) { return images + ' Bilder · ' + states + ' Zustände'; },
    clCount: function (n, all) { return n + ' von ' + all; }
  },
  en: {
    libTitle: 'Characters', libHelp: 'Every character of your videos and series. A character comes in by itself once a project\'s style-character stage is done; add your own or take them from a project with + New. Using one copies its files into the project under characters/<id>/.',
    libEmpty: 'No characters yet', clNew: '+ New',
    name: 'Name', description: 'Description (look, age, hair, outfit)', prompt: 'Prompt sentence for keyframes', tags: 'Tags, comma-separated', face: 'Display',
    faces: { full: 'fully visible', silhouette: 'silhouette only', 'screen-only': 'on screens only', 'voice-only': 'voice only' },
    sheet: 'Character sheet', images: 'More images (seed, face, outfits)', voice: 'Voice (WAV)', transcript: 'Exact words of the recording', createChar: 'Create', uploading: 'uploading …',
    refs: 'Images', states: 'States', statesHelp: 'States from earlier productions. Only the ticked ones come along.', noStates: 'none', usedIn: 'Used in', usedNowhere: 'nowhere yet',
    useIn: 'Use in', useButton: 'Use', used: function (r) { return (r.updated ? 'Updated: ' : 'Added: ') + r.files.length + ' files' + (r.states.length ? ', states ' + r.states.join(', ') : ''); },
    inTarget: 'in this project', fromOrigin: 'from', manual: 'added by hand', history: 'History', addFile: 'Add file', role: 'As', roles: { ref: 'Reference', sheet: 'Sheet', voice: 'Voice' },
    edit: 'Edit', save: 'Save', cancel: 'Cancel', deleteChar: 'Delete from the library', confirmDelete: 'Delete this character and its files from the library? Projects keep their copies.',
    removeFile: 'Remove', confirmRemoveFile: function (n) { return 'Delete ' + n + ' from the library?'; }, back: '← All characters', series: 'Series', project: 'Video',
    pickHelp: 'Take characters from the library: their images land in characters/<id>/, and the character bible builds on them instead of generating them again. States only when ticked.',
    pickEmpty: 'The library is empty; it fills with every finished project. Add your own under Characters.', openLibrary: 'Open the library',
    clSearch: 'Search name, description and tags …', clTags: 'Tags', clUnused: 'unused', clOrigin: 'Origin', clAll: 'all',
    clNoMatch: 'No character matches these filters', clReset: 'Reset filters', clYes: 'yes', clNo: 'no', clManual: 'manual', clFrom: 'from',
    clCols: { name: 'Name', face: 'Display', tags: 'Tags', images: 'Images', voice: 'Voice', used: 'Used in', origin: 'Origin' },
    clImages: function (images, states) { return images + ' images · ' + states + ' states'; },
    clCount: function (n, all) { return n + ' of ' + all; }
  }
});

function main() { const node = document.getElementById('main'); node.innerHTML = ''; return node; }
function load() { return api('/api/library'); }
export function libraryFile(id, name) { return '/library-files/' + encodeURIComponent(id) + '/' + encodeURIComponent(name); }
function input(attrs) { return el('input', Object.assign({ class: 'text' }, attrs)); }
function field(label, control) { return el('label', { class: 'form-field' }, [el('span', { text: label }), control]); }
function targetLabel(target) { return (target.scope === 'series' ? t('series') : t('project')) + ': ' + target.title; }
function targetValue(target) { return target.scope + '/' + target.slug; }
function isUsedIn(entry, scope, slug) { return entry.usedIn.some(function (use) { return use.scope === scope && use.slug === slug; }); }
function originText(origin) { return origin === 'manual' ? t('manual') : t('fromOrigin') + ' ' + origin; }
/** The origin as the list shows it: "manuell" or "aus <slug>" (an import records the workspace path, `projects/<slug>`). */
function listOrigin(origin) { return origin === 'manual' ? t('clManual') : t('clFrom') + ' ' + String(origin).split('/').pop(); }

function cover(entry, cls) {
  return entry.cover
    ? el('img', { class: cls, src: libraryFile(entry.id, entry.cover), loading: 'lazy', alt: entry.name })
    : el('div', { class: cls + ' placeholder', text: entry.name.slice(0, 1).toUpperCase() });
}

function stateChecks(entry) {
  const boxes = entry.states.map(function (state) {
    const box = el('input', { type: 'checkbox', value: state.id });
    return { box: box, label: el('label', { class: 'state-check', title: state.description }, [box, ' ', state.id]) };
  });
  return {
    node: boxes.length ? el('div', { class: 'state-checks' }, boxes.map(function (b) { return b.label; })) : null,
    chosen: function () { return boxes.filter(function (b) { return b.box.checked; }).map(function (b) { return b.box.value; }); }
  };
}

// ------------------------------------------------------------------ gallery

// --------------------------------------------------------------------- list

/** The list's route; its query may hold any character, a decoded line break too. */
export const CHARACTERS_ROUTE = /^#\/characters\/?(?:\?[\s\S]*)?$/;

const LIST = { sorts: ['name', 'images', 'used', 'origin'], ascending: ['name', 'origin'] };

function imageCount(entry) { return entry.refs.length + (entry.sheet && entry.refs.indexOf(entry.sheet) < 0 ? 1 : 0); }

/** One item per library character of `/api/library`, and one per entry that does not load (`error`), by name. */
export function characterItems(data) {
  const items = data.characters.map(function (entry) {
    return {
      id: entry.id, name: entry.name, entry: entry, search: [entry.name, entry.description].concat(entry.tags), tags: entry.tags,
      images: imageCount(entry), states: entry.states.length, used: entry.usedIn.length, origin: entry.origin, href: '#/characters/' + entry.id
    };
  });
  const errors = (data.errors || []).map(function (error) { return { id: error.id, name: error.id, error: error.error, search: [error.id], tags: [], used: 0, origin: '' }; });
  return { items: items, errors: errors };
}

/** The list options for a library: its tags and origins are the values the address may name. */
export function characterListOptions(list) {
  const origins = [];
  list.items.forEach(function (item) { if (origins.indexOf(item.origin) < 0) origins.push(item.origin); });
  return Object.assign({ tags: allTags(list.items), origins: origins }, LIST);
}

/** The list's state from the query of `#/characters?…`; unknown values are ignored. */
export function parseCharacterState(query, list) { return parseLibraryListState(query, characterListOptions(list)); }

/** The address of a list state; defaults are left out. */
export function characterHash(state) { return libraryListHash('#/characters', state, LIST); }

/**
 * The rows to show, sorted by the state's column: the characters that match, then the entries that do not load.
 * An unreadable entry has no tags, uses or origin, so it shows only while no filter is set and the search, if any,
 * finds its id.
 */
export function characterRows(list, state) {
  const keys = {
    images: function (item) { return item.images; },
    used: function (item) { return item.used; },
    origin: function (item) { return listOrigin(item.origin); }
  };
  const rows = sortLibraryItems(list.items.filter(function (item) { return matchesLibraryItem(item, state); }), state, keys);
  const filtered = state.tag.length || state.unused || state.origin;
  return filtered ? rows : rows.concat(list.errors.filter(function (item) { return matchesLibraryItem(item, state); }));
}

let view = null; // { data, list, state, results, reset }
let listAddress = '#/characters'; // the list's last address, for the detail page's back link

function setState(state, full) {
  view.state = state;
  listAddress = characterHash(state);
  writeListHash(listAddress);
  if (full) drawList(); else drawResults();
}

function quiet(event) { if (event && event.stopPropagation) event.stopPropagation(); }

function resetButton(className) {
  return el('button', { class: className + ' cl-reset', onclick: function () { setState(parseCharacterState('', view.list), true); } }, [t('clReset')]);
}

function filterBar() {
  const state = view.state;
  view.reset = el('span', { class: 'pl-reset' });
  const search = el('input', { type: 'search', class: 'pl-search', placeholder: t('clSearch'), 'aria-label': t('clSearch'), value: state.q, oninput: function (event) {
    // The search is in the address, so a refresh need not keep the view for it (app.js marks other input as edited).
    quiet(event);
    setState(Object.assign({}, view.state, { q: event.target.value }), false);
  } });
  search.value = state.q;
  const options = characterListOptions(view.list);
  const tags = options.tags.length ? el('div', { class: 'pl-filter', role: 'group', 'aria-label': t('clTags') }, [el('span', { class: 'pl-label', text: t('clTags') })].concat(options.tags.map(function (tag) {
    const on = state.tag.indexOf(tag) >= 0;
    return el('button', { class: 'pl-chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-tag': tag, onclick: function () {
      setState(Object.assign({}, view.state, { tag: toggleValue(view.state.tag, tag) }), true);
    } }, ['#' + tag]);
  }))) : null;
  const unused = el('button', { class: 'pl-chip cl-unused' + (state.unused ? ' on' : ''), 'aria-pressed': state.unused ? 'true' : 'false', onclick: function () {
    setState(Object.assign({}, view.state, { unused: !view.state.unused }), true);
  } }, [t('clUnused')]);
  const origin = el('select', { class: 'pl-select cl-origin', 'aria-label': t('clOrigin'), oninput: quiet, onchange: function (event) {
    setState(Object.assign({}, view.state, { origin: event.target.value }), true);
  } }, [el('option', { value: '', text: t('clAll') })].concat(options.origins.map(function (value) {
    return el('option', { value: value, selected: value === state.origin, text: listOrigin(value) });
  })));
  origin.value = state.origin;
  return el('div', { class: 'pl-filters' }, [
    search, tags, el('div', { class: 'pl-filter' }, [unused]),
    el('label', { class: 'pl-filter' }, [el('span', { class: 'pl-label', text: t('clOrigin') }), origin]),
    view.reset
  ]);
}

function header() {
  const cols = t('clCols');
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
  return el('thead', {}, [el('tr', {}, [view.selection.head(), th(''), th('name', true), th('face'), th('tags'), th('images', true), th('voice'), th('used', true), th('origin', true)])]);
}

function row(item) {
  if (item.error) return el('tr', { class: 'pl-error', 'data-id': item.id }, [
    view.selection.cell(item),
    el('td', {}, [el('div', { class: 'lib-cover placeholder', text: '!' })]), el('td', {}, [el('b', { text: item.id })]),
    el('td', { colspan: '6', class: 'error', text: item.error })
  ]);
  const entry = item.entry;
  return el('tr', { class: 'link-row', 'data-id': item.id, onclick: function () { go(item.href); } }, [
    view.selection.cell(item),
    el('td', {}, [cover(entry, 'lib-cover')]),
    el('td', {}, [el('b', { text: entry.name }), el('span', { class: 'sub', text: entry.id })]),
    el('td', { text: t('faces')[entry.face] || entry.face }),
    el('td', { class: 'cl-tags', text: entry.tags.map(function (tag) { return '#' + tag; }).join(' ') }),
    el('td', { class: 'num', text: t('clImages')(item.images, item.states) }),
    el('td', { text: entry.voice ? t('clYes') : t('clNo') }),
    el('td', { class: 'num', text: String(item.used) }),
    el('td', { text: listOrigin(entry.origin) })
  ]);
}

function drawResults() {
  const results = view.results;
  results.innerHTML = '';
  // The search redraws only the results, so the reset button of the bar is drawn here too.
  view.reset.innerHTML = '';
  if (anyLibraryFilter(view.state)) view.reset.appendChild(resetButton('small'));
  const rows = characterRows(view.list, view.state);
  view.selection.keep(rows);
  if (!rows.length) {
    results.appendChild(el('div', { class: 'empty cl-nomatch' }, [el('p', { text: t('clNoMatch') }), resetButton('primary')]));
    return;
  }
  results.appendChild(el('p', { class: 'sub pl-count', text: t('clCount')(rows.length, view.list.items.length + view.list.errors.length) }));
  const bar = view.selection.bar();
  if (bar) results.appendChild(bar);
  results.appendChild(el('table', { class: 'list pl-table cl-table' }, [header(), el('tbody', {}, rows.map(row))]));
}

/** The character wizard: + New in the list's head and in its empty state (UX guidelines G6, G10). */
export const NEW_CHARACTER = '#/new/character';

function drawList() {
  const node = main();
  node.appendChild(el('div', { class: 'list-head' }, [
    el('h2', { text: t('libTitle') }),
    el('button', { class: 'primary cl-new', onclick: function () { go(NEW_CHARACTER); } }, [t('clNew')])
  ]));
  node.appendChild(el('p', { class: 'meta', text: t('libHelp') }));
  if (!view.list.items.length && !view.list.errors.length) node.appendChild(el('div', { class: 'empty cl-empty' }, [el('p', { text: t('libEmpty') }), el('a', { href: NEW_CHARACTER, class: 'cl-empty-new', text: t('clNew') })]));
  else {
    node.appendChild(filterBar());
    view.results = el('div', { class: 'pl-results' });
    node.appendChild(view.results);
    drawResults();
  }
}

/** Where a character is used, as the delete confirmation names it: the production's title, else its slug. */
function usesOf(item) {
  const targets = view.data.targets || [];
  return item.entry.usedIn.map(function (use) {
    const target = targets.filter(function (x) { return x.scope === use.scope && x.slug === use.slug; })[0];
    return target ? target.title : use.slug;
  });
}

/** Load the list again with its state and selection, after a delete of selected rows. */
function reload() {
  return load().then(function (data) {
    view.data = data;
    view.list = characterItems(data);
    drawList();
  });
}

function useData(data, state) {
  const list = characterItems(data);
  view = { data: data, list: list, state: state, results: null, reset: null, selection: null };
  view.selection = librarySelection({
    remove: function (id) { return post('/api/library/' + encodeURIComponent(id), { action: 'delete' }); },
    uses: usesOf, keep: 'projects', reload: reload, redraw: function () { drawResults(); }
  });
}

function gallery() {
  const query = queryOf(location.hash);
  return load().then(function (data) {
    const list = characterItems(data);
    useData(data, parseCharacterState(query, list));
    listAddress = characterHash(view.state);
    drawList();
  }).catch(showError);
}

// ------------------------------------------------------------------- detail

function fileTile(entry, name, label, refresh) {
  const remove = el('button', { class: 'small', text: t('removeFile'), onclick: pending(function () {
    if (!window.confirm(t('confirmRemoveFile')(name))) return;
    return post('/api/library/' + encodeURIComponent(entry.id), { action: 'remove-file', name: name }).then(refresh).catch(showError);
  }) });
  const isAudio = /\.wav$/i.test(name);
  return el('div', { class: 'file' }, [
    isAudio ? el('audio', { controls: true, preload: 'none', src: libraryFile(entry.id, name) })
      : el('a', { class: 'media tall', href: libraryFile(entry.id, name), target: '_blank' }, [el('img', { src: libraryFile(entry.id, name), loading: 'lazy', alt: name })]),
    el('div', { class: 'name' }, [label ? el('b', { text: label }) : null, name]), remove
  ]);
}

function editForm(entry, done) {
  const name = input({ value: entry.name }), description = el('textarea', { class: 'note-input', rows: 4 }), prompt = el('textarea', { class: 'note-input', rows: 3 }), tags = input({ value: entry.tags.join(', ') });
  description.value = entry.description;
  prompt.value = entry.prompt || '';
  const error = el('p', { class: 'error' });
  return el('div', { class: 'form' }, [
    el('div', { class: 'form-row' }, [field(t('name'), name), field(t('tags'), tags)]),
    el('div', { class: 'form-row' }, [field(t('description'), description)]),
    el('div', { class: 'form-row' }, [field(t('prompt'), prompt)]),
    error,
    el('div', { class: 'form-row' }, [
      el('button', { class: 'primary', text: t('save'), onclick: pending(function () {
        return post('/api/library/' + encodeURIComponent(entry.id), { action: 'update', name: name.value, description: description.value, prompt: prompt.value, tags: tags.value }).then(done).catch(function (e) { error.textContent = e.message; });
      }) }),
      el('button', { class: 'small', text: t('cancel'), onclick: done })
    ])
  ]);
}

function detail(id) {
  return load().then(function (data) {
    const entry = data.characters.filter(function (c) { return c.id === id; })[0];
    const node = main();
    const refresh = function () { detail(id); };
    node.appendChild(el('p', {}, [el('a', { class: 'back-link', href: listAddress, text: t('back') })]));
    if (!entry) { node.appendChild(el('p', { class: 'error', text: id + ': ?' })); return; }
    node.appendChild(el('header', { class: 'project' }, [el('h2', { text: entry.name }), el('span', { class: 'chip', text: entry.id }), el('span', { class: 'chip', text: originText(entry.origin) })]));

    const about = el('section', { class: 'card' });
    const showAbout = function () {
      about.innerHTML = '';
      about.appendChild(el('p', { text: entry.description }));
      if (entry.prompt) about.appendChild(el('p', { class: 'meta' }, [el('b', { text: t('prompt') + ': ' }), entry.prompt]));
      about.appendChild(el('p', { class: 'meta' }, [el('b', { text: t('face') + ': ' }), t('faces')[entry.face] || entry.face].concat(entry.tags.length ? [' · ', entry.tags.map(function (tag) { return '#' + tag; }).join(' ')] : [])));
      about.appendChild(el('button', { class: 'small', text: t('edit'), onclick: function () { about.innerHTML = ''; about.appendChild(editForm(entry, refresh)); } }));
    };
    showAbout();
    node.appendChild(about);

    // Use in a project or canon.
    const checks = stateChecks(entry);
    const target = el('select', { class: 'text' }, data.targets.map(function (x) { return el('option', { value: targetValue(x), text: targetLabel(x) + (isUsedIn(entry, x.scope, x.slug) ? ' ✓' : '') }); }));
    const useResult = el('p', { class: 'meta' });
    node.appendChild(el('section', { class: 'card' }, [
      el('h3', { text: t('useIn'), style: 'margin:0 0 8px' }),
      data.targets.length ? el('div', { class: 'form-row' }, [target, el('button', { class: 'primary', text: t('useButton'), onclick: pending(function () {
        const parts = target.value.split('/');
        return post('/api/library/use', { scope: parts[0], slug: parts[1], id: entry.id, states: checks.chosen() }).then(function (r) { useResult.className = 'meta'; useResult.textContent = t('used')(r.result); }).catch(function (e) { useResult.textContent = e.message; useResult.className = 'error'; });
      }) })]) : null,
      checks.node ? el('p', { class: 'meta', text: t('statesHelp') }) : null, checks.node, useResult,
      el('p', { class: 'meta' }, [el('b', { text: t('usedIn') + ': ' })].concat(entry.usedIn.length ? entry.usedIn.map(function (use, index) {
        return el('span', {}, [index ? ', ' : '', el('a', { href: (use.scope === 'series' ? '#/s/' : '#/p/') + use.slug, text: use.slug })]);
      }) : [t('usedNowhere')]))
    ]));

    // Files
    const tiles = [];
    if (entry.sheet) tiles.push(fileTile(entry, entry.sheet, t('roles').sheet, refresh));
    entry.refs.forEach(function (name) { tiles.push(fileTile(entry, name, null, refresh)); });
    if (entry.voice) tiles.push(fileTile(entry, entry.voice.ref, t('roles').voice + ': ' + entry.voice.transcript, refresh));
    const file = el('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,.webp,.wav' });
    const role = el('select', { class: 'text' }, ['ref', 'sheet', 'voice'].map(function (r) { return el('option', { value: r, text: t('roles')[r] }); }));
    const transcript = input({ placeholder: t('transcript'), style: 'display:none;min-width:260px' });
    role.onchange = function () { transcript.style.display = role.value === 'voice' ? '' : 'none'; };
    const progress = el('span', { class: 'sub' });
    node.appendChild(el('section', { class: 'card' }, [
      el('h3', { text: t('refs'), style: 'margin:0 0 4px' }), el('div', { class: 'files' }, tiles),
      el('div', { class: 'form-row', style: 'margin-top:12px;align-items:center' }, [file, el('span', { class: 'meta', text: t('role') }), role, transcript, el('button', { class: 'small', text: t('addFile'), onclick: pending(function () {
        let chain = Promise.resolve();
        Array.prototype.forEach.call(file.files, function (f) {
          chain = chain.then(function () {
            const query = '?name=' + encodeURIComponent(f.name) + '&role=' + role.value + (role.value === 'voice' ? '&transcript=' + encodeURIComponent(transcript.value) : '');
            return upload('/api/upload/library/' + encodeURIComponent(entry.id) + query, f, function (share) { progress.textContent = Math.round(share * 100) + '%'; });
          });
        });
        return chain.then(refresh).catch(function (e) { progress.textContent = e.message; progress.className = 'error'; });
      }, { spinner: false }) }), progress])
    ]));

    // States
    node.appendChild(el('section', { class: 'card' }, [el('h3', { text: t('states'), style: 'margin:0 0 4px' })].concat(entry.states.length ? [el('div', { class: 'files' }, entry.states.map(function (state) {
      return el('div', { class: 'file' }, [
        state.ref ? el('a', { class: 'media tall', href: libraryFile(entry.id, state.ref), target: '_blank' }, [el('img', { src: libraryFile(entry.id, state.ref), loading: 'lazy', alt: state.id })]) : el('div', { class: 'media tall' }, ['—']),
        el('div', { class: 'name' }, [el('b', { text: state.id }), state.description])
      ]);
    }))] : [el('p', { class: 'meta', text: t('noStates') })])));

    if (entry.history.length) {
      node.appendChild(el('details', { class: 'card' }, [el('summary', { text: t('history') }), el('ul', { class: 'meta' }, entry.history.map(function (h) {
        return el('li', { text: h.at.slice(0, 10) + ' · ' + h.from + ' · ' + h.added.join(', ') });
      }))]));
    }
    node.appendChild(el('button', { class: 'small', text: t('deleteChar'), onclick: pending(function () {
      if (!window.confirm(t('confirmDelete'))) return;
      return post('/api/library/' + encodeURIComponent(entry.id), { action: 'delete' }).then(function () { go('#/characters'); }).catch(showError);
    }) }));
  }).catch(showError);
}

/** Route `#/characters[/<id>]`. */
export function showCharacters(id) {
  setLang(null);
  return id ? detail(id) : gallery();
}

// -------------------------------------------------------------- the picker

/**
 * The wizard's step body: library characters to take into a music video or a
 * series canon, each with its states to tick. Calls `onChange` after a use.
 */
export function libraryPicker(scope, slug, onChange) {
  const box = el('div', { class: 'char-pick' }, [el('p', { class: 'meta', text: '…' })]);
  load().then(function (data) {
    box.innerHTML = '';
    box.appendChild(el('p', { class: 'meta' }, [t('pickHelp') + ' ', el('a', { href: '#/characters', text: t('openLibrary') })]));
    if (!data.characters.length) { box.appendChild(el('p', { class: 'empty', text: t('pickEmpty') })); return; }
    const list = el('div', { class: 'refs' });
    data.characters.forEach(function (entry) {
      const inside = isUsedIn(entry, scope, slug);
      const checks = stateChecks(entry);
      const message = el('div', { class: 'meta' });
      list.appendChild(el('div', { class: 'ref' + (inside ? ' picked' : '') }, [
        cover(entry, 'pick-cover'),
        el('div', { class: 'ref-body' }, [
          el('div', {}, [el('a', { href: '#/characters/' + entry.id, text: entry.name }), inside ? el('span', { class: 'chip', text: '✓ ' + t('inTarget') }) : null]),
          el('div', { class: 'meta clamp', text: entry.description }),
          checks.node, message
        ]),
        el('button', { class: 'small', text: t('useButton'), onclick: pending(function () {
          return post('/api/library/use', { scope: scope, slug: slug, id: entry.id, states: checks.chosen() }).then(function (r) {
            message.textContent = t('used')(r.result);
            if (onChange) onChange();
          }).catch(function (e) { message.textContent = e.message; message.className = 'error'; });
        }) })
      ]));
    });
    box.appendChild(list);
  }).catch(function (error) { box.innerHTML = ''; box.appendChild(el('p', { class: 'error', text: error.message })); });
  return box;
}
