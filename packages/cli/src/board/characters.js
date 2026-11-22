// The character library: every character of the workspace's videos and
// series, to take into a new music video or series canon with one click.
//   #/characters        the gallery, a new character, import from a project
//   #/characters/<id>   one character: files, states, where it is used, use it
import { addStrings, api, el, go, pending, post, setLang, showError, t, upload } from './lib.js';

addStrings({
  de: {
    libTitle: 'Figuren', libHelp: 'Alle Figuren aus deinen Videos und Serien. Eine Figur kommt automatisch hinein, sobald style-character eines Projekts fertig ist; eigene kannst du hier anlegen. Beim Übernehmen landen ihre Dateien im Projekt unter characters/<id>/.',
    libEmpty: 'Noch keine Figuren in der Bibliothek.', libNew: 'Neue Figur anlegen', libImport: 'Aus Projekt oder Serie übernehmen', libImportHelp: 'Holt alle Figuren mit Bildern aus einem bestehenden Projekt oder einer Serie in die Bibliothek; bekannte Figuren bekommen nur ihre neuen Bilder und Zustände.',
    libImportButton: 'Importieren', libImported: function (n) { return n + ' Figur(en) übernommen'; }, libNothing: 'Keine Figur mit Bildern gefunden.',
    name: 'Name', description: 'Beschreibung (Aussehen, Alter, Haare, Outfit)', prompt: 'Prompt-Satz für Keyframes', tags: 'Schlagworte, mit Komma', face: 'Darstellung',
    faces: { full: 'voll sichtbar', silhouette: 'nur Silhouette', 'screen-only': 'nur auf Bildschirmen', 'voice-only': 'nur Stimme' },
    sheet: 'Character Sheet', images: 'Weitere Bilder (Seed, Face, Outfits)', voice: 'Stimme (WAV)', transcript: 'Exakter Text der Aufnahme', createChar: 'Anlegen', uploading: 'lädt hoch …',
    refs: 'Bilder', states: 'Zustände', statesHelp: 'Zustände aus früheren Produktionen. Beim Übernehmen nur die angehakten.', noStates: 'keine', usedIn: 'Verwendet in', usedNowhere: 'noch nirgends',
    useIn: 'Übernehmen in', useButton: 'Übernehmen', used: function (r) { return (r.updated ? 'Ergänzt: ' : 'Übernommen: ') + r.files.length + ' Dateien' + (r.states.length ? ', Zustände ' + r.states.join(', ') : ''); },
    inTarget: 'im Projekt', fromOrigin: 'aus', manual: 'von Hand angelegt', history: 'Verlauf', addFile: 'Datei hinzufügen', role: 'Als', roles: { ref: 'Referenz', sheet: 'Sheet', voice: 'Stimme' },
    edit: 'Bearbeiten', save: 'Speichern', cancel: 'Abbrechen', deleteChar: 'Aus der Bibliothek löschen', confirmDelete: 'Diese Figur und ihre Dateien aus der Bibliothek löschen? Projekte behalten ihre Kopien.',
    removeFile: 'Entfernen', confirmRemoveFile: function (n) { return n + ' aus der Bibliothek löschen?'; }, back: '← Alle Figuren', series: 'Serie', project: 'Video',
    pickHelp: 'Figuren aus der Bibliothek übernehmen: Ihre Bilder landen in characters/<id>/, der Agent baut beim Character-Bible darauf auf, statt sie neu zu erzeugen. Zustände nur, wenn angehakt.',
    pickEmpty: 'Die Bibliothek ist leer; sie füllt sich mit jedem fertigen Projekt. Eigene Figuren unter Figuren anlegen.', openLibrary: 'Bibliothek öffnen'
  },
  en: {
    libTitle: 'Characters', libHelp: 'Every character of your videos and series. A character comes in by itself once a project\'s style-character stage is done; add your own here. Using one copies its files into the project under characters/<id>/.',
    libEmpty: 'No characters in the library yet.', libNew: 'New character', libImport: 'Take from a project or series', libImportHelp: 'Brings every character with images of an existing project or series into the library; known characters only gain their new images and states.',
    libImportButton: 'Import', libImported: function (n) { return n + ' character(s) taken in'; }, libNothing: 'No character with images found.',
    name: 'Name', description: 'Description (look, age, hair, outfit)', prompt: 'Prompt sentence for keyframes', tags: 'Tags, comma-separated', face: 'Display',
    faces: { full: 'fully visible', silhouette: 'silhouette only', 'screen-only': 'on screens only', 'voice-only': 'voice only' },
    sheet: 'Character sheet', images: 'More images (seed, face, outfits)', voice: 'Voice (WAV)', transcript: 'Exact words of the recording', createChar: 'Create', uploading: 'uploading …',
    refs: 'Images', states: 'States', statesHelp: 'States from earlier productions. Only the ticked ones come along.', noStates: 'none', usedIn: 'Used in', usedNowhere: 'nowhere yet',
    useIn: 'Use in', useButton: 'Use', used: function (r) { return (r.updated ? 'Updated: ' : 'Added: ') + r.files.length + ' files' + (r.states.length ? ', states ' + r.states.join(', ') : ''); },
    inTarget: 'in this project', fromOrigin: 'from', manual: 'added by hand', history: 'History', addFile: 'Add file', role: 'As', roles: { ref: 'Reference', sheet: 'Sheet', voice: 'Voice' },
    edit: 'Edit', save: 'Save', cancel: 'Cancel', deleteChar: 'Delete from the library', confirmDelete: 'Delete this character and its files from the library? Projects keep their copies.',
    removeFile: 'Remove', confirmRemoveFile: function (n) { return 'Delete ' + n + ' from the library?'; }, back: '← All characters', series: 'Series', project: 'Video',
    pickHelp: 'Take characters from the library: their images land in characters/<id>/, and the character bible builds on them instead of generating them again. States only when ticked.',
    pickEmpty: 'The library is empty; it fills with every finished project. Add your own under Characters.', openLibrary: 'Open the library'
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

function newCharacterForm(onCreated) {
  const name = input({ required: true }), description = el('textarea', { class: 'note-input', rows: 3 }), prompt = input({}), tags = input({});
  const face = el('select', { class: 'text' }, ['full', 'silhouette', 'screen-only', 'voice-only'].map(function (f) { return el('option', { value: f, text: t('faces')[f] }); }));
  const sheet = el('input', { type: 'file', accept: '.png,.jpg,.jpeg,.webp' });
  const images = el('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,.webp' });
  const voice = el('input', { type: 'file', accept: '.wav' }), transcript = input({});
  const progress = el('p', { class: 'meta' });
  const form = el('form', { class: 'card form' }, [
    el('h3', { text: t('libNew'), style: 'margin:0 0 10px' }),
    el('div', { class: 'form-row' }, [field(t('name'), name), field(t('face'), face), field(t('tags'), tags)]),
    el('div', { class: 'form-row' }, [field(t('description'), description)]),
    el('div', { class: 'form-row' }, [field(t('prompt'), prompt)]),
    el('div', { class: 'form-row' }, [field(t('sheet'), sheet), field(t('images'), images)]),
    el('div', { class: 'form-row' }, [field(t('voice'), voice), field(t('transcript'), transcript)]),
    progress, el('button', { class: 'primary', type: 'submit', text: t('createChar') })
  ]);
  form.onsubmit = pending(function () {
    progress.className = 'meta';
    return post('/api/library/new', { name: name.value, description: description.value, prompt: prompt.value, tags: tags.value, face: face.value }).then(function (created) {
      const files = [];
      if (sheet.files[0]) files.push({ file: sheet.files[0], role: 'sheet' });
      Array.prototype.forEach.call(images.files, function (file) { files.push({ file: file, role: 'ref' }); });
      if (voice.files[0]) files.push({ file: voice.files[0], role: 'voice', transcript: transcript.value });
      let chain = Promise.resolve();
      files.forEach(function (item, index) {
        chain = chain.then(function () {
          const query = '?name=' + encodeURIComponent(item.file.name) + '&role=' + item.role + (item.transcript ? '&transcript=' + encodeURIComponent(item.transcript) : '');
          return upload('/api/upload/library/' + encodeURIComponent(created.id) + query, item.file, function (share) { progress.textContent = t('uploading') + ' ' + (index + 1) + '/' + files.length + ' · ' + Math.round(share * 100) + '%'; });
        });
      });
      return chain.then(function () { onCreated(created.id); });
    }).catch(function (error) { progress.textContent = error.message; progress.className = 'error'; });
  });
  return form;
}

function importForm(data, refresh) {
  const target = el('select', { class: 'text' }, data.targets.map(function (x) { return el('option', { value: targetValue(x), text: targetLabel(x) }); }));
  const result = el('p', { class: 'meta' });
  const button = el('button', { class: 'small', text: t('libImportButton'), onclick: pending(function () {
    const parts = target.value.split('/');
    return post('/api/library/import', { scope: parts[0], slug: parts[1] }).then(function (r) {
      result.className = 'meta';
      result.textContent = r.results.length ? t('libImported')(r.results.length) + ': ' + r.results.map(function (x) { return x.character + ' → ' + x.id; }).join(', ') : t('libNothing');
      refresh(r);
    }).catch(function (error) { result.textContent = error.message; result.className = 'error'; });
  }) });
  return el('section', { class: 'card' }, [
    el('h3', { text: t('libImport'), style: 'margin:0 0 6px' }), el('p', { class: 'meta', text: t('libImportHelp') }),
    data.targets.length ? el('div', { class: 'form-row' }, [target, button]) : null, result
  ]);
}

function gallery() {
  return load().then(function (data) {
    const node = main();
    node.appendChild(el('h2', { text: t('libTitle'), style: 'margin:0 0 6px;font-size:20px' }));
    node.appendChild(el('p', { class: 'meta', text: t('libHelp') }));
    const grid = el('div', { class: 'grid char-grid' });
    const draw = function (list) {
      grid.innerHTML = '';
      if (!list.characters.length) grid.appendChild(el('p', { class: 'empty', text: t('libEmpty') }));
      list.characters.forEach(function (entry) {
        grid.appendChild(el('section', { class: 'card char-card', onclick: function () { go('#/characters/' + entry.id); } }, [
          cover(entry, 'char-cover'),
          el('h3', { text: entry.name }),
          el('p', { class: 'meta clamp', text: entry.description }),
          el('div', {}, [
            el('span', { class: 'chip', text: entry.refs.length + (entry.sheet ? 1 : 0) + ' ' + t('refs') }), ' ',
            entry.states.length ? el('span', { class: 'chip', text: entry.states.length + ' ' + t('states') }) : null, ' ',
            entry.voice ? el('span', { class: 'chip', text: t('roles').voice }) : null, ' ',
            el('span', { class: 'chip', text: t('usedIn') + ' ' + entry.usedIn.length })
          ].concat(entry.tags.map(function (tag) { return el('span', { class: 'chip', text: '#' + tag }); })))
        ]));
      });
      list.errors.forEach(function (error) { grid.appendChild(el('p', { class: 'error', text: error.id + ': ' + error.error })); });
    };
    draw(data);
    node.appendChild(grid);
    node.appendChild(importForm(data, draw));
    node.appendChild(newCharacterForm(function (id) { go('#/characters/' + id); }));
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
    node.appendChild(el('p', {}, [el('a', { class: 'back-link', href: '#/characters', text: t('back') })]));
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
