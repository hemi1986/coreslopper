// The set library: every reusable place of the workspace's videos and series,
// to take into a new music video or series canon with one click.
//   #/sets        the list (a table: search, tag/unused/origin filters, sort, all in the hash);
//                 its + New opens the set wizard (#/new/set, set-wizard.js)
//   #/sets/<id>   one set: references, plates, where it is used, use it
import { addStrings, api, el, go, pending, post, setLang, showError, t, upload } from './lib.js';
import { countedUses, demosShown, useLabel } from './demos.js';
import { librarySelection } from './library-selection.js';
import { allTags, anyLibraryFilter, defaultDir, libraryListHash, matchesLibraryItem, parseLibraryListState, queryOf, sortLibraryItems, toggleValue, writeListHash } from './list-state.js';

addStrings({
  de: {
    setTitle: 'Sets', setHelp: 'Alle Sets aus deinen Videos und Serien: jeder Ort mit seinen Referenzen und Kamerawinkeln. Ein Set kommt automatisch in die Bibliothek, sobald das Set-Bible eines Videos fertig ist; eigene legst du mit + Neu an oder übernimmst sie aus einem Projekt.',
    setEmpty: 'Die Bibliothek hat noch keine Sets; sie füllt sich mit jedem fertigen Musikvideo und jeder Serie. Eigene Sets legst du mit + Neu an.',
    slNew: '+ Neu',
    setName: 'Name', setDescription: 'Beschreibung (Ort, Licht, Material)', setPrompt: 'Prompt-Satz für Keyframes', setTags: 'Schlagworte, mit Komma',
    setCreate: 'Anlegen', setUploading: 'lädt hoch …',
    setRefsChip: 'Referenzen', setPlateCount: function (n) { return n + (n === 1 ? ' Platte' : ' Platten'); }, setUsedIn: 'Verwendet in', setUsedNowhere: 'noch nirgends',
    setRefs: 'Referenzen', setPlates: 'Platten', setPlatesHelp: 'Platten aus dieser Position; beim Übernehmen kommen alle mit.', setNoPlates: 'keine Platten', setAngle: 'Kamerawinkel',
    setUseIn: 'Übernehmen in', setUseButton: 'Übernehmen', setUsed: function (r) { return (r.updated ? 'Ergänzt: ' : 'Übernommen: ') + r.files.length + ' Dateien' + (r.plates.length ? ', Kamerawinkel ' + r.plates.join(', ') : ''); },
    setInTarget: 'im Projekt', setFromOrigin: 'aus', setManual: 'von Hand angelegt', setHistory: 'Verlauf',
    setAddFile: 'Datei hinzufügen', setRole: 'Als', setRoles: { ref: 'Referenz', plate: 'Platte' }, setAngleField: 'Kamerawinkel, z. B. „Tresen, frontal, Hüfthöhe“', setPlateId: 'Platten-id (optional)',
    setEdit: 'Bearbeiten', setSave: 'Speichern', setCancel: 'Abbrechen',
    setDelete: 'Aus der Bibliothek löschen', setConfirmDelete: function (where) { return 'Dieses Set und seine Dateien aus der Bibliothek löschen? ' + (where.length ? 'Verwendet in: ' + where.join(', ') + '.' : 'Es wird nirgends verwendet.') + ' Projekte behalten ihre Kopien.'; },
    setRemoveFile: 'Entfernen', setConfirmRemoveFile: function (n) { return n + ' aus der Bibliothek löschen?'; }, setBack: '← Alle Sets', setSeries: 'Serie', setProject: 'Video',
    setPickHelp: 'Sets aus der Bibliothek übernehmen: Alle Referenzen und alle Kamerawinkel landen in sets/<id>/, der Agent baut beim Set-Bible darauf auf, statt sie neu zu erzeugen.',
    setOpenLibrary: 'Sets öffnen',
    slEmpty: 'Noch keine Sets', slSearch: 'Suche in Name, Beschreibung und Schlagworten …', slTags: 'Schlagworte', slUnused: 'unbenutzt', slOrigin: 'Herkunft', slAll: 'alle',
    slNoMatch: 'Kein Set passt zu diesen Filtern', slReset: 'Filter zurücksetzen', slManual: 'manuell', slFrom: 'aus',
    slCols: { name: 'Name', tags: 'Schlagworte', refs: 'Referenzen', plates: 'Platten', used: 'Verwendet in', origin: 'Herkunft' },
    slCount: function (n, all) { return n + ' von ' + all; }
  },
  en: {
    setTitle: 'Sets', setHelp: 'Every set of your videos and series: each place with its references and camera angles. A set comes in by itself once a video\'s set bible is done; add your own or take them from a project with + New.',
    setEmpty: 'The library has no sets yet; it fills with every finished music video and series. Add your own with + New.',
    slNew: '+ New',
    setName: 'Name', setDescription: 'Description (place, light, material)', setPrompt: 'Prompt sentence for keyframes', setTags: 'Tags, comma-separated',
    setCreate: 'Create', setUploading: 'uploading …',
    setRefsChip: 'references', setPlateCount: function (n) { return n + (n === 1 ? ' plate' : ' plates'); }, setUsedIn: 'Used in', setUsedNowhere: 'nowhere yet',
    setRefs: 'References', setPlates: 'Plates', setPlatesHelp: 'Plates from this angle; every plate comes along when the set is used.', setNoPlates: 'no plates', setAngle: 'Angle',
    setUseIn: 'Use in', setUseButton: 'Use', setUsed: function (r) { return (r.updated ? 'Updated: ' : 'Added: ') + r.files.length + ' files' + (r.plates.length ? ', plates ' + r.plates.join(', ') : ''); },
    setInTarget: 'in this project', setFromOrigin: 'from', setManual: 'added by hand', setHistory: 'History',
    setAddFile: 'Add file', setRole: 'As', setRoles: { ref: 'Reference', plate: 'Plate' }, setAngleField: 'Angle, e.g. "counter, frontal, waist height"', setPlateId: 'Plate id (optional)',
    setEdit: 'Edit', setSave: 'Save', setCancel: 'Cancel',
    setDelete: 'Delete from the library', setConfirmDelete: function (where) { return 'Delete this set and its files from the library? ' + (where.length ? 'Used in: ' + where.join(', ') + '.' : 'It is not used anywhere.') + ' Projects keep their copies.'; },
    setRemoveFile: 'Remove', setConfirmRemoveFile: function (n) { return 'Delete ' + n + ' from the library?'; }, setBack: '← All sets', setSeries: 'Series', setProject: 'Video',
    setPickHelp: 'Take sets from the library: every reference and every camera angle lands in sets/<id>/, and the set bible builds on them instead of generating them again.',
    setOpenLibrary: 'Open the Sets',
    slEmpty: 'No sets yet', slSearch: 'Search name, description and tags …', slTags: 'Tags', slUnused: 'unused', slOrigin: 'Origin', slAll: 'all',
    slNoMatch: 'No set matches these filters', slReset: 'Reset filters', slManual: 'manual', slFrom: 'from',
    slCols: { name: 'Name', tags: 'Tags', refs: 'References', plates: 'Plates', used: 'Used in', origin: 'Origin' },
    slCount: function (n, all) { return n + ' of ' + all; }
  }
});

function main() { const node = document.getElementById('main'); node.innerHTML = ''; return node; }
function load() { return api('/api/sets'); }
export function setFile(id, name) { return '/set-files/' + encodeURIComponent(id) + '/' + encodeURIComponent(name); }
function input(attrs) { return el('input', Object.assign({ class: 'text' }, attrs)); }
function field(label, control) { return el('label', { class: 'form-field' }, [el('span', { text: label }), control]); }
function targetLabel(target) { return (target.scope === 'series' ? t('setSeries') : t('setProject')) + ': ' + target.title; }
function targetValue(target) { return target.scope + '/' + target.slug; }
function isUsedIn(entry, scope, slug) { return entry.usedIn.some(function (use) { return use.scope === scope && use.slug === slug; }); }
/** The origin as the list shows it: "manuell" or "aus <slug>" (an import records the workspace path, `projects/<slug>`). */
function listOrigin(origin) { return origin === 'manual' ? t('slManual') : t('slFrom') + ' ' + String(origin).split('/').pop(); }
function originText(origin) { return origin === 'manual' ? t('setManual') : t('setFromOrigin') + ' ' + origin; }

function cover(entry, cls) {
  return entry.cover
    ? el('img', { class: cls, src: setFile(entry.id, entry.cover), loading: 'lazy', alt: entry.name })
    : el('div', { class: cls + ' placeholder', text: entry.name.slice(0, 1).toUpperCase() });
}

// --------------------------------------------------------------------- list

/** The list's route; its query may hold any character, a decoded line break too. */
export const SETS_ROUTE = /^#\/sets\/?(?:\?[\s\S]*)?$/;

const LIST = { sorts: ['name', 'refs', 'plates', 'used', 'origin'], ascending: ['name', 'origin'] };

/** One item per library set of `/api/sets`, and one per entry that does not load (`error`). */
export function setItems(data) {
  // A use in a demo production counts only while the board shows the demos (demos.js).
  const shown = demosShown(data.onlyDemos);
  const items = data.sets.map(function (entry) {
    return {
      id: entry.id, name: entry.name, entry: entry, search: [entry.name, entry.description].concat(entry.tags), tags: entry.tags,
      refs: entry.refs.length, plates: entry.plates.length, used: countedUses(entry.usedIn, shown).length, origin: entry.origin, href: '#/sets/' + entry.id
    };
  });
  const errors = (data.errors || []).map(function (error) { return { id: error.id, name: error.id, error: error.error, search: [error.id], tags: [], used: 0, origin: '' }; });
  return { items: items, errors: errors };
}

/** The list options for a library: its tags and origins are the values the address may name. */
export function setListOptions(list) {
  const origins = [];
  list.items.forEach(function (item) { if (origins.indexOf(item.origin) < 0) origins.push(item.origin); });
  return Object.assign({ tags: allTags(list.items), origins: origins }, LIST);
}

/** The list's state from the query of `#/sets?…`; unknown values are ignored. */
export function parseSetState(query, list) { return parseLibraryListState(query, setListOptions(list)); }

/** The address of a list state; defaults are left out. */
export function setHash(state) { return libraryListHash('#/sets', state, LIST); }

/**
 * The rows to show, sorted by the state's column: the sets that match, then the entries that do not load. An
 * unreadable entry has no tags, uses or origin, so it shows only while no filter is set and the search, if any,
 * finds its id.
 */
export function setRows(list, state) {
  const keys = {
    refs: function (item) { return item.refs; },
    plates: function (item) { return item.plates; },
    used: function (item) { return item.used; },
    origin: function (item) { return listOrigin(item.origin); }
  };
  const rows = sortLibraryItems(list.items.filter(function (item) { return matchesLibraryItem(item, state); }), state, keys);
  const filtered = state.tag.length || state.unused || state.origin;
  return filtered ? rows : rows.concat(list.errors.filter(function (item) { return matchesLibraryItem(item, state); }));
}

let view = null; // { data, list, state, results, reset }
let listAddress = '#/sets'; // the list's last address, for the detail page's back link

function setState(state, full) {
  view.state = state;
  listAddress = setHash(state);
  writeListHash(listAddress);
  if (full) drawList(); else drawResults();
}

function quiet(event) { if (event && event.stopPropagation) event.stopPropagation(); }

function resetButton(className) {
  return el('button', { class: className + ' sl-reset', onclick: function () { setState(parseSetState('', view.list), true); } }, [t('slReset')]);
}

function filterBar() {
  const state = view.state;
  view.reset = el('span', { class: 'pl-reset' });
  const search = el('input', { type: 'search', class: 'pl-search', placeholder: t('slSearch'), 'aria-label': t('slSearch'), value: state.q, oninput: function (event) {
    // The search is in the address, so a refresh need not keep the view for it (app.js marks other input as edited).
    quiet(event);
    setState(Object.assign({}, view.state, { q: event.target.value }), false);
  } });
  search.value = state.q;
  const options = setListOptions(view.list);
  const tags = options.tags.length ? el('div', { class: 'pl-filter', role: 'group', 'aria-label': t('slTags') }, [el('span', { class: 'pl-label', text: t('slTags') })].concat(options.tags.map(function (tag) {
    const on = state.tag.indexOf(tag) >= 0;
    return el('button', { class: 'pl-chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-tag': tag, onclick: function () {
      setState(Object.assign({}, view.state, { tag: toggleValue(view.state.tag, tag) }), true);
    } }, ['#' + tag]);
  }))) : null;
  const unused = el('button', { class: 'pl-chip sl-unused' + (state.unused ? ' on' : ''), 'aria-pressed': state.unused ? 'true' : 'false', onclick: function () {
    setState(Object.assign({}, view.state, { unused: !view.state.unused }), true);
  } }, [t('slUnused')]);
  const origin = el('select', { class: 'pl-select sl-origin', 'aria-label': t('slOrigin'), oninput: quiet, onchange: function (event) {
    setState(Object.assign({}, view.state, { origin: event.target.value }), true);
  } }, [el('option', { value: '', text: t('slAll') })].concat(options.origins.map(function (value) {
    return el('option', { value: value, selected: value === state.origin, text: listOrigin(value) });
  })));
  origin.value = state.origin;
  return el('div', { class: 'pl-filters' }, [
    search, tags, el('div', { class: 'pl-filter' }, [unused]),
    el('label', { class: 'pl-filter' }, [el('span', { class: 'pl-label', text: t('slOrigin') }), origin]),
    view.reset
  ]);
}

function header() {
  const cols = t('slCols');
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
  return el('thead', {}, [el('tr', {}, [view.selection.head(), th(''), th('name', true), th('tags'), th('refs', true), th('plates', true), th('used', true), th('origin', true)])]);
}

function row(item) {
  if (item.error) return el('tr', { class: 'pl-error', 'data-id': item.id }, [
    view.selection.cell(item),
    el('td', {}, [el('div', { class: 'lib-cover placeholder', text: '!' })]), el('td', {}, [el('b', { text: item.id })]),
    el('td', { colspan: '5', class: 'error', text: item.error })
  ]);
  const entry = item.entry;
  return el('tr', { class: 'link-row', 'data-id': item.id, onclick: function () { go(item.href); } }, [
    view.selection.cell(item),
    el('td', {}, [cover(entry, 'lib-cover')]),
    el('td', {}, [el('b', { text: entry.name }), el('span', { class: 'sub', text: entry.id })]),
    el('td', { class: 'cl-tags', text: entry.tags.map(function (tag) { return '#' + tag; }).join(' ') }),
    el('td', { class: 'num', text: String(item.refs) }),
    el('td', { class: 'num', text: String(item.plates) }),
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
  const rows = setRows(view.list, view.state);
  view.selection.keep(rows);
  if (!rows.length) {
    results.appendChild(el('div', { class: 'empty sl-nomatch' }, [el('p', { text: t('slNoMatch') }), resetButton('primary')]));
    return;
  }
  results.appendChild(el('p', { class: 'sub pl-count', text: t('slCount')(rows.length, view.list.items.length + view.list.errors.length) }));
  const bar = view.selection.bar();
  if (bar) results.appendChild(bar);
  results.appendChild(el('table', { class: 'list pl-table cl-table' }, [header(), el('tbody', {}, rows.map(row))]));
}

/** The set wizard: + New in the list's head and in its empty state (UX guidelines G6, G10). */
export const NEW_SET = '#/new/set';

function drawList() {
  const node = main();
  node.appendChild(el('div', { class: 'list-head' }, [
    el('h2', { text: t('setTitle') }),
    el('button', { class: 'primary sl-new', onclick: function () { go(NEW_SET); } }, [t('slNew')])
  ]));
  node.appendChild(el('p', { class: 'meta', text: t('setHelp') }));
  if (!view.list.items.length && !view.list.errors.length) node.appendChild(el('div', { class: 'empty sl-empty' }, [el('p', { text: t('slEmpty') }), el('a', { href: NEW_SET, class: 'sl-empty-new', text: t('slNew') })]));
  else {
    node.appendChild(filterBar());
    view.results = el('div', { class: 'pl-results' });
    node.appendChild(view.results);
    drawResults();
  }
}

/** Where a set is used, as the delete confirmation names it: the production's title, else its slug. */
function usesOf(item) {
  const targets = view.data.targets || [];
  return item.entry.usedIn.map(function (use) { return useLabel(use, targets); });
}

/** Load the list again with its state and selection, after a delete of selected rows. */
function reload() {
  return load().then(function (data) {
    view.data = data;
    view.list = setItems(data);
    drawList();
  });
}

function useData(data, state) {
  view = { data: data, list: setItems(data), state: state, results: null, reset: null, selection: null };
  view.selection = librarySelection({
    remove: function (id) { return post('/api/sets/' + encodeURIComponent(id), { action: 'delete' }); },
    uses: usesOf, keep: 'projects', reload: reload, redraw: function () { drawResults(); }
  });
}

function gallery() {
  const query = queryOf(location.hash);
  return load().then(function (data) {
    useData(data, parseSetState(query, setItems(data)));
    listAddress = setHash(view.state);
    drawList();
  }).catch(showError);
}

// ------------------------------------------------------------------- detail

function fileTile(entry, name, label, refresh) {
  const remove = el('button', { class: 'small', text: t('setRemoveFile'), onclick: pending(function () {
    if (!window.confirm(t('setConfirmRemoveFile')(name))) return;
    return post('/api/sets/' + encodeURIComponent(entry.id), { action: 'remove-file', name: name }).then(refresh).catch(showError);
  }) });
  return el('div', { class: 'file' }, [
    el('a', { class: 'media tall', href: setFile(entry.id, name), target: '_blank' }, [el('img', { src: setFile(entry.id, name), loading: 'lazy', alt: name })]),
    el('div', { class: 'name' }, [label ? el('b', { text: label }) : null, name]), remove
  ]);
}

function editForm(entry, done) {
  const name = input({ value: entry.name }), description = el('textarea', { class: 'note-input', rows: 4 }), prompt = el('textarea', { class: 'note-input', rows: 3 }), tags = input({ value: entry.tags.join(', ') });
  description.value = entry.description;
  prompt.value = entry.prompt || '';
  const error = el('p', { class: 'error' });
  return el('div', { class: 'form' }, [
    el('div', { class: 'form-row' }, [field(t('setName'), name), field(t('setTags'), tags)]),
    el('div', { class: 'form-row' }, [field(t('setDescription'), description)]),
    el('div', { class: 'form-row' }, [field(t('setPrompt'), prompt)]),
    error,
    el('div', { class: 'form-row' }, [
      el('button', { class: 'primary', text: t('setSave'), onclick: pending(function () {
        return post('/api/sets/' + encodeURIComponent(entry.id), { action: 'update', name: name.value, description: description.value, prompt: prompt.value, tags: tags.value })
          .then(done)
          // The form stays as it is, so a refusal keeps what was typed.
          .catch(function (e) { error.textContent = e.message; });
      }) }),
      el('button', { class: 'small', text: t('setCancel'), onclick: done })
    ])
  ]);
}

function detail(id) {
  return load().then(function (data) {
    const entry = data.sets.filter(function (s) { return s.id === id; })[0];
    const node = main();
    const refresh = function () { detail(id); };
    node.appendChild(el('p', {}, [el('a', { class: 'back-link', href: listAddress, text: t('setBack') })]));
    if (!entry) { node.appendChild(el('p', { class: 'error', text: id + ': ?' })); return; }
    node.appendChild(el('header', { class: 'project' }, [el('h2', { text: entry.name }), el('span', { class: 'chip', text: entry.id }), el('span', { class: 'chip', text: originText(entry.origin) })]));

    const about = el('section', { class: 'card' });
    const showAbout = function () {
      about.innerHTML = '';
      about.appendChild(el('p', { text: entry.description }));
      about.appendChild(el('p', { class: 'meta' }, [el('b', { text: t('setPrompt') + ': ' }), entry.prompt]));
      if (entry.tags.length) about.appendChild(el('p', { class: 'meta', text: entry.tags.map(function (tag) { return '#' + tag; }).join(' ') }));
      about.appendChild(el('button', { class: 'small', text: t('setEdit'), onclick: function () { about.innerHTML = ''; about.appendChild(editForm(entry, refresh)); } }));
    };
    showAbout();
    node.appendChild(about);

    // Use in a music video or a series canon.
    const target = el('select', { class: 'text' }, data.targets.map(function (x) { return el('option', { value: targetValue(x), text: targetLabel(x) + (isUsedIn(entry, x.scope, x.slug) ? ' ✓' : '') }); }));
    const useResult = el('p', { class: 'meta' });
    node.appendChild(el('section', { class: 'card' }, [
      el('h3', { text: t('setUseIn'), style: 'margin:0 0 8px' }),
      data.targets.length ? el('div', { class: 'form-row' }, [target, el('button', { class: 'primary', text: t('setUseButton'), onclick: pending(function () {
        const parts = target.value.split('/');
        return post('/api/sets/use', { scope: parts[0], slug: parts[1], id: entry.id }).then(function (r) { useResult.className = 'meta'; useResult.textContent = t('setUsed')(r.result); }).catch(function (e) { useResult.textContent = e.message; useResult.className = 'error'; });
      }) })]) : null,
      useResult,
      el('p', { class: 'meta' }, [el('b', { text: t('setUsedIn') + ': ' })].concat(entry.usedIn.length ? entry.usedIn.map(function (use, index) {
        return el('span', {}, [index ? ', ' : '', el('a', { href: (use.scope === 'series' ? '#/s/' : '#/p/') + use.slug, text: useLabel(use, data.targets) })]);
      }) : [t('setUsedNowhere')]))
    ]));

    // References and plates, with upload and remove.
    const tiles = entry.refs.map(function (name) { return fileTile(entry, name, null, refresh); });
    entry.plates.forEach(function (plate) {
      if (!plate.file) { tiles.push(el('div', { class: 'file' }, [el('div', { class: 'media tall' }, ['—']), el('div', { class: 'name' }, [el('b', { text: plate.id }), plate.angle])])); return; }
      tiles.push(el('div', { class: 'file' }, [
        el('a', { class: 'media tall', href: setFile(entry.id, plate.file), target: '_blank' }, [el('img', { src: setFile(entry.id, plate.file), loading: 'lazy', alt: plate.id })]),
        el('div', { class: 'name' }, [el('b', { text: t('setAngle') + ': ' + plate.angle }), plate.id, ' ']),
        el('button', { class: 'small', text: t('setRemoveFile'), onclick: pending(function () {
          if (!window.confirm(t('setConfirmRemoveFile')(plate.file))) return;
          return post('/api/sets/' + encodeURIComponent(entry.id), { action: 'remove-file', name: plate.file }).then(refresh).catch(showError);
        }) })
      ]));
    });
    const file = el('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,.webp' });
    const role = el('select', { class: 'text' }, ['ref', 'plate'].map(function (r) { return el('option', { value: r, text: t('setRoles')[r] }); }));
    const angle = input({ placeholder: t('setAngleField'), style: 'display:none;min-width:260px' });
    const plateId = input({ placeholder: t('setPlateId'), style: 'display:none;min-width:160px' });
    role.onchange = function () {
      const plate = role.value === 'plate';
      angle.style.display = plate ? '' : 'none';
      plateId.style.display = plate ? '' : 'none';
    };
    const progress = el('span', { class: 'sub' });
    node.appendChild(el('section', { class: 'card' }, [
      el('h3', { text: t('setRefs'), style: 'margin:0 0 4px' }), el('div', { class: 'files' }, tiles),
      el('p', { class: 'meta', text: t('setPlatesHelp') }),
      el('div', { class: 'form-row', style: 'margin-top:12px;align-items:center' }, [file, el('span', { class: 'meta', text: t('setRole') }), role, angle, plateId, el('button', { class: 'small', text: t('setAddFile'), onclick: pending(function () {
        if (!file.files.length) { progress.textContent = ''; return; }
        progress.className = 'sub';
        let chain = Promise.resolve();
        Array.prototype.forEach.call(file.files, function (f) {
          chain = chain.then(function () {
            const query = '?name=' + encodeURIComponent(f.name) + '&role=' + role.value
              + (role.value === 'plate' ? '&angle=' + encodeURIComponent(angle.value) + (plateId.value ? '&plate=' + encodeURIComponent(plateId.value) : '') : '');
            return upload('/api/upload/sets/' + encodeURIComponent(entry.id) + query, f, function (share) { progress.textContent = t('setUploading') + ' ' + Math.round(share * 100) + '%'; });
          });
        });
        return chain.then(refresh).catch(function (e) { progress.textContent = e.message; progress.className = 'error'; });
      }, { spinner: false }) }), progress])
    ]));

    if (entry.history.length) {
      node.appendChild(el('details', { class: 'card' }, [el('summary', { text: t('setHistory') }), el('ul', { class: 'meta' }, entry.history.map(function (h) {
        return el('li', { text: h.at.slice(0, 10) + ' · ' + h.from + ' · ' + h.added.join(', ') });
      }))]));
    }
    // The confirmation names every production that uses the set.
    const where = entry.usedIn.map(function (use) { return use.scope === 'series' ? use.slug + ' (' + t('setSeries') + ')' : use.slug; });
    node.appendChild(el('button', { class: 'small', text: t('setDelete'), onclick: pending(function () {
      if (!window.confirm(t('setConfirmDelete')(where))) return;
      return post('/api/sets/' + encodeURIComponent(entry.id), { action: 'delete' }).then(function () { go('#/sets'); }).catch(showError);
    }) }));
  }).catch(showError);
}

/** Route `#/sets[/<id>]`. */
export function showSets(id) {
  setLang(null);
  return id ? detail(id) : gallery();
}

// -------------------------------------------------------------- the picker

/**
 * The wizard's step body: library sets to take into a music video or a series
 * canon, a card per set. Ticking a set uses it at once (CMD-UseLibrarySet); a
 * set the target already holds stays ticked, and a refusal shows its reason on
 * the card. Calls `onChange` after a use.
 */
export function setsPicker(scope, slug, onChange) {
  const box = el('div', { class: 'set-pick' }, [el('p', { class: 'meta', text: '…' })]);
  load().then(function (data) {
    box.innerHTML = '';
    box.appendChild(el('p', { class: 'meta' }, [t('setPickHelp') + ' ', el('a', { href: '#/sets', text: t('setOpenLibrary') })]));
    if (!data.sets.length) { box.appendChild(el('p', { class: 'empty', text: t('setEmpty') })); return; }
    const list = el('div', { class: 'refs' });
    data.sets.forEach(function (entry) {
      const inside = isUsedIn(entry, scope, slug);
      const message = el('div', { class: 'meta' });
      const tick = el('div', { class: 'set-tick' });
      const card = el('div', { class: 'ref' + (inside ? ' picked' : '') }, [
        cover(entry, 'pick-cover'),
        el('div', { class: 'ref-body' }, [
          el('div', {}, [el('a', { href: '#/sets/' + entry.id, text: entry.name })]),
          el('div', { class: 'meta clamp', text: entry.description }),
          el('div', { class: 'meta', text: t('setPlateCount')(entry.plates.length) + (entry.refs.length ? ' · ' + entry.refs.length + ' ' + t('setRefsChip') : '') }),
          message
        ]),
        tick
      ]);
      // A used set cannot be taken back from the step, so its tick gives way to the "in this project" chip.
      const showUsed = function () {
        tick.innerHTML = '';
        tick.appendChild(el('span', { class: 'chip', text: '✓ ' + t('setInTarget') }));
      };
      if (inside) { showUsed(); list.appendChild(card); return; }
      const check = el('input', { type: 'checkbox' });
      check.onchange = pending(function () {
        return post('/api/sets/use', { scope: scope, slug: slug, id: entry.id }).then(function (r) {
          card.classList.add('picked');
          showUsed();
          message.className = 'meta';
          message.textContent = t('setUsed')(r.result);
          if (onChange) onChange();
        }).catch(function (e) { check.checked = false; message.textContent = e.message; message.className = 'error'; });
      }, { spinner: false });
      tick.appendChild(el('label', { class: 'set-tick-label' }, [check, ' ', t('setUseButton')]));
      list.appendChild(card);
    });
    box.appendChild(list);
  }).catch(function (error) { box.innerHTML = ''; box.appendChild(el('p', { class: 'error', text: error.message })); });
  return box;
}
