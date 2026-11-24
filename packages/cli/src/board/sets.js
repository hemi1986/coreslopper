// The set library: every reusable place of the workspace's videos and series,
// to take into a new music video or series canon with one click.
//   #/sets        the gallery, a new set, import from a project or series
//   #/sets/<id>   one set: references, plates, where it is used, use it
import { addStrings, api, el, go, pending, post, setLang, showError, t, upload } from './lib.js';

addStrings({
  de: {
    setTitle: 'Sets', setHelp: 'Alle Sets aus deinen Videos und Serien: jeder Ort mit seinen Referenzen und Kamerawinkeln. Ein Set kommt automatisch in die Bibliothek, sobald das Set-Bible eines Videos fertig ist; eigene legst du hier an.',
    setEmpty: 'Die Bibliothek hat noch keine Sets; sie füllt sich mit jedem fertigen Musikvideo und jeder Serie. Eigene Sets legst du hier an.',
    setNew: 'Neues Set anlegen', setImport: 'Aus Projekt oder Serie übernehmen', setImportHelp: 'Holt alle Sets mit Bildern aus einem bestehenden Musikvideo oder einer Serie in die Bibliothek; bekannte Sets bekommen nur ihre neuen Bilder und Kamerawinkel.',
    setImportButton: 'Importieren', setImported: function (n) { return n + ' Set(s) übernommen'; }, setNothing: 'Kein Set mit Bildern gefunden.', setSkipped: 'ohne Bilder',
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
    setOpenLibrary: 'Sets öffnen'
  },
  en: {
    setTitle: 'Sets', setHelp: 'Every set of your videos and series: each place with its references and camera angles. A set comes in by itself once a video\'s set bible is done; add your own here.',
    setEmpty: 'The library has no sets yet; it fills with every finished music video and series. Add your own here.',
    setNew: 'New set', setImport: 'Take from a project or series', setImportHelp: 'Brings every set with images of an existing music video or series into the library; known sets only gain their new images and camera angles.',
    setImportButton: 'Import', setImported: function (n) { return n + ' set(s) taken in'; }, setNothing: 'No set with images found.', setSkipped: 'no images',
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
    setOpenLibrary: 'Open the Sets'
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
function originText(origin) { return origin === 'manual' ? t('setManual') : t('setFromOrigin') + ' ' + origin; }

function cover(entry, cls) {
  return entry.cover
    ? el('img', { class: cls, src: setFile(entry.id, entry.cover), loading: 'lazy', alt: entry.name })
    : el('div', { class: cls + ' placeholder', text: entry.name.slice(0, 1).toUpperCase() });
}

// ------------------------------------------------------------------ gallery

function newSetForm(onCreated) {
  const name = input({ required: true }), description = el('textarea', { class: 'note-input', rows: 3 }), prompt = el('textarea', { class: 'note-input', rows: 2 }), tags = input({});
  const error = el('p', { class: 'error' });
  const form = el('form', { class: 'card form' }, [
    el('h3', { text: t('setNew'), style: 'margin:0 0 10px' }),
    el('div', { class: 'form-row' }, [field(t('setName'), name), field(t('setTags'), tags)]),
    el('div', { class: 'form-row' }, [field(t('setDescription'), description)]),
    el('div', { class: 'form-row' }, [field(t('setPrompt'), prompt)]),
    error, el('button', { class: 'primary', type: 'submit', text: t('setCreate') })
  ]);
  form.onsubmit = pending(function () {
    error.textContent = '';
    return post('/api/sets/new', { name: name.value, description: description.value, prompt: prompt.value, tags: tags.value })
      .then(function (created) { onCreated(created.id); })
      // A refused write names its reason and leaves the typed fields as they are.
      .catch(function (e) { error.textContent = e.message; });
  });
  return form;
}

function importForm(data, refresh) {
  const target = el('select', { class: 'text' }, data.targets.map(function (x) { return el('option', { value: targetValue(x), text: targetLabel(x) }); }));
  const result = el('p', { class: 'meta' });
  const button = el('button', { class: 'small', text: t('setImportButton'), onclick: pending(function () {
    const parts = target.value.split('/');
    return post('/api/sets/import', { scope: parts[0], slug: parts[1] }).then(function (r) {
      result.className = 'meta';
      result.textContent = r.results.length
        ? t('setImported')(r.results.filter(function (x) { return x.id; }).length) + ': ' + r.results.map(function (x) { return x.set + ' → ' + (x.id || t('setSkipped')); }).join(', ')
        : t('setNothing');
      refresh(r);
    }).catch(function (e) { result.textContent = e.message; result.className = 'error'; });
  }) });
  return el('section', { class: 'card' }, [
    el('h3', { text: t('setImport'), style: 'margin:0 0 6px' }), el('p', { class: 'meta', text: t('setImportHelp') }),
    data.targets.length ? el('div', { class: 'form-row' }, [target, button]) : null, result
  ]);
}

function gallery() {
  return load().then(function (data) {
    const node = main();
    node.appendChild(el('h2', { text: t('setTitle'), style: 'margin:0 0 6px;font-size:20px' }));
    node.appendChild(el('p', { class: 'meta', text: t('setHelp') }));
    const grid = el('div', { class: 'grid set-grid' });
    const draw = function (list) {
      grid.innerHTML = '';
      if (!list.sets.length) grid.appendChild(el('p', { class: 'empty', text: t('setEmpty') }));
      list.sets.forEach(function (entry) {
        grid.appendChild(el('section', { class: 'card set-card', onclick: function () { go('#/sets/' + entry.id); } }, [
          cover(entry, 'set-cover'),
          el('h3', { text: entry.name }),
          el('p', { class: 'meta clamp', text: entry.description }),
          el('div', {}, [
            el('span', { class: 'chip', text: entry.refs.length + ' ' + t('setRefsChip') }), ' ',
            el('span', { class: 'chip', text: t('setPlateCount')(entry.plates.length) }), ' ',
            el('span', { class: 'chip', text: t('setUsedIn') + ' ' + entry.usedIn.length })
          ].concat(entry.tags.map(function (tag) { return el('span', { class: 'chip', text: '#' + tag }); })))
        ]));
      });
      list.errors.forEach(function (error) { grid.appendChild(el('p', { class: 'error', text: error.id + ': ' + error.error })); });
    };
    draw(data);
    node.appendChild(grid);
    node.appendChild(importForm(data, draw));
    node.appendChild(newSetForm(function (id) { go('#/sets/' + id); }));
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
    node.appendChild(el('p', {}, [el('a', { class: 'back-link', href: '#/sets', text: t('setBack') })]));
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
        return el('span', {}, [index ? ', ' : '', el('a', { href: (use.scope === 'series' ? '#/s/' : '#/p/') + use.slug, text: use.slug })]);
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
