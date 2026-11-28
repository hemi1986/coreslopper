// The wizard for a library set (UX guideline G10): reached from + New → Set, or from + New in the head of the Sets
// list. It first asks whether to create a set or import the sets of a production.
//   #/new/set        the choice; creating one ends step 1 with the new entry's address
//   #/new/set/<id>   the entry's steps: references and plates, the way to the set's page
// Every write goes through the set library's existing routes (`/api/sets/new`, `/api/upload/sets/<id>`,
// `/api/sets/import`), so the wizard creates exactly what `set new`, `set add-file` and `set import` create.
import { addStrings, api, el, go, pending, post, setLang, showError, t } from './lib.js';
import { setFile } from './sets.js';
import { sendLibraryFiles } from './library-wizard.js';
import { step } from './wizard.js';

addStrings({
  de: {
    swTitle: 'Neues Set', swChip: 'Set', swCreate: 'Neu anlegen', swImport: 'Aus Projekt oder Serie übernehmen',
    swRequired: 'Pflichtfeld', swStepData: 'Set', swStepFiles: 'Referenzen und Platten', swStepDone: 'Fertig',
    swFilesHelp: 'PNG, JPG oder WebP. Eine Referenz zeigt den Ort; eine Platte ist ein Bild aus einer Kameraposition und braucht ihren Kamerawinkel. Jedes Bild erscheint hier, sobald es hochgeladen ist.',
    swRefs: 'Referenzen', swPlate: 'Platte', swUpload: 'Hochladen', swToSet: 'Zum Set →',
    swUnknown: function (id) { return 'Kein Set „' + id + '“ in der Bibliothek.'; },
    swImportHelp: 'Holt alle Sets mit Bildern aus einem bestehenden Musikvideo oder einer Serie in die Bibliothek; bekannte Sets bekommen nur ihre neuen Bilder und Kamerawinkel.',
    swImportButton: 'Importieren', swImported: function (n) { return n + ' Set(s) übernommen:'; }, swSkipped: 'ohne Bilder, übersprungen',
    swNothing: 'Kein Set mit Bildern gefunden.', swNoTargets: 'Noch kein Projekt und keine Serie im Workspace.'
  },
  en: {
    swTitle: 'New set', swChip: 'Set', swCreate: 'Create new', swImport: 'Import from a project or series',
    swRequired: 'required', swStepData: 'Set', swStepFiles: 'References and plates', swStepDone: 'Done',
    swFilesHelp: 'PNG, JPG, or WebP. A reference shows the place; a plate is an image from one camera position and needs its angle. Each image shows here once it is uploaded.',
    swRefs: 'References', swPlate: 'Plate', swUpload: 'Upload', swToSet: 'To the set →',
    swUnknown: function (id) { return 'No set "' + id + '" in the library.'; },
    swImportHelp: 'Brings every set with images of an existing music video or series into the library; known sets only gain their new images and camera angles.',
    swImportButton: 'Import', swImported: function (n) { return n + ' set(s) taken in:'; }, swSkipped: 'no images, skipped',
    swNothing: 'No set with images found.', swNoTargets: 'No project or series in the workspace yet.'
  }
});

function main() { const node = document.getElementById('main'); node.innerHTML = ''; return node; }
function input(attrs) { return el('input', Object.assign({ class: 'text' }, attrs)); }
function field(label, control) { return el('label', { class: 'form-field' }, [el('span', { text: label }), control]); }
/** A field the set library requires: its label carries the visible marker, its control `aria-required`. */
function requiredField(label, control) {
  control.setAttribute('aria-required', 'true');
  return el('label', { class: 'form-field' }, [el('span', {}, [label + ' ', el('span', { class: 'sub sw-required', text: '(' + t('swRequired') + ')' })]), control]);
}
function targetLabel(target) { return (target.scope === 'series' ? t('setSeries') : t('setProject')) + ': ' + target.title; }
function setHref(id) { return '#/sets/' + id; }

// ------------------------------------------------------------------ choice

function choice() {
  return api('/api/sets').then(function (data) {
    const node = main();
    node.appendChild(el('h2', { text: t('swTitle'), style: 'margin:0 0 16px;font-size:20px' }));
    const area = el('div', { class: 'sw-area' });
    const buttons = [];
    const pick = function (which) {
      buttons.forEach(function (b) { b.button.setAttribute('aria-pressed', b.which === which ? 'true' : 'false'); b.button.className = 'sw-choice ' + (b.which === which ? 'primary' : 'small'); });
      area.innerHTML = '';
      area.appendChild(which === 'create' ? createStep() : importStep(data));
    };
    [['create', t('swCreate')], ['import', t('swImport')]].forEach(function (c) {
      buttons.push({ which: c[0], button: el('button', { class: 'sw-choice small', 'data-choice': c[0], 'aria-pressed': 'false', onclick: function () { pick(c[0]); } }, [c[1]]) });
    });
    node.appendChild(el('div', { class: 'form-row sw-choices', role: 'group' }, buttons.map(function (b) { return b.button; })));
    node.appendChild(area);
  }).catch(showError);
}

/** Step 1: the entry's words. A refusal names its reason beside the step and keeps what was typed. */
function createStep() {
  // No `required` attribute: the library's refusal names the reason in the step, as for every other refusal.
  const name = input({ 'data-field': 'name' }), tags = input({ 'data-field': 'tags' });
  const description = el('textarea', { class: 'note-input', rows: 3, 'data-field': 'description' });
  const prompt = el('textarea', { class: 'note-input', rows: 2, 'data-field': 'prompt' });
  const error = el('p', { class: 'error sw-error' });
  const form = el('form', { class: 'form' }, [
    el('div', { class: 'form-row' }, [requiredField(t('setName'), name), field(t('setTags'), tags)]),
    el('div', { class: 'form-row' }, [requiredField(t('setDescription'), description)]),
    el('div', { class: 'form-row' }, [requiredField(t('setPrompt'), prompt)]),
    error, el('button', { class: 'primary', type: 'submit', text: t('setCreate') })
  ]);
  form.onsubmit = pending(function () {
    error.textContent = '';
    return post('/api/sets/new', { name: name.value, description: description.value, prompt: prompt.value, tags: tags.value })
      .then(function (created) { go('#/new/set/' + created.id); })
      .catch(function (e) { error.textContent = e.message; });
  });
  return step(1, t('swStepData'), false, [form]);
}

/** The import path: a production's sets into the library, each linked to its page. */
function importStep(data) {
  const result = el('div', { class: 'meta sw-result' });
  if (!data.targets.length) return step(1, t('swImport'), false, [el('p', { class: 'meta', text: t('swImportHelp') }), el('p', { class: 'empty', text: t('swNoTargets') })]);
  const target = el('select', { class: 'text' }, data.targets.map(function (x) { return el('option', { value: x.scope + '/' + x.slug, text: targetLabel(x) }); }));
  const button = el('button', { class: 'primary', text: t('swImportButton'), onclick: pending(function () {
    const parts = target.value.split('/');
    result.innerHTML = '';
    result.className = 'meta sw-result';
    return post('/api/sets/import', { scope: parts[0], slug: parts[1] }).then(function (r) {
      const taken = r.results.filter(function (x) { return x.id; });
      if (!taken.length) { result.appendChild(el('p', { text: t('swNothing') })); return; }
      const names = {};
      (r.sets || []).forEach(function (s) { names[s.id] = s.name; });
      result.appendChild(el('p', { text: t('swImported')(taken.length) }));
      result.appendChild(el('ul', {}, r.results.map(function (x) {
        // A set without a file is skipped by the import; it is named, without a link, so the list says why.
        return x.id ? el('li', {}, [el('a', { href: setHref(x.id), text: names[x.id] || x.id })]) : el('li', { class: 'sub', text: x.set + ' – ' + t('swSkipped') });
      })));
    }).catch(function (e) { result.className = 'error sw-result'; result.textContent = e.message; });
  }) });
  return step(1, t('swImport'), false, [el('p', { class: 'meta', text: t('swImportHelp') }), el('div', { class: 'form-row' }, [target, button]), result]);
}

// ------------------------------------------------------------------- steps

function tile(entry, name, label) {
  return el('div', { class: 'file', 'data-file': name }, [
    el('a', { class: 'media tall', href: setFile(entry.id, name), target: '_blank' }, [el('img', { src: setFile(entry.id, name), loading: 'lazy', alt: name })]),
    el('div', { class: 'name' }, [label ? el('b', { text: label }) : null, name])
  ]);
}

/** The entry's references, then its plates with their angles, as the set's page shows them. */
function fileTiles(box, entry) {
  box.innerHTML = '';
  entry.refs.forEach(function (name) { box.appendChild(tile(entry, name, null)); });
  entry.plates.forEach(function (plate) { if (plate.file) box.appendChild(tile(entry, plate.file, t('setAngle') + ': ' + plate.angle)); });
}

function entrySteps(id) {
  return api('/api/sets').then(function (data) {
    const node = main();
    const entry = data.sets.filter(function (s) { return s.id === id; })[0];
    if (!entry) {
      node.appendChild(el('p', { class: 'error', text: t('swUnknown')(id) }));
      node.appendChild(el('p', {}, [el('a', { href: '#/new/set', text: t('swTitle') })]));
      return;
    }
    node.appendChild(el('header', { class: 'project' }, [el('h2', { text: entry.name }), el('span', { class: 'chip', text: t('swChip') }), el('span', { class: 'chip', text: entry.id })]));
    node.appendChild(el('div', { style: 'height:12px' }));
    node.appendChild(step(1, t('swStepData'), true, [el('p', { class: 'meta', text: entry.description })]));

    // Step 2: references, and a plate with its angle (and an optional plate id), as on the set's page.
    const files = el('div', { class: 'files sw-files' });
    fileTiles(files, entry);
    const show = function (listing) {
      const next = (listing.sets || []).filter(function (s) { return s.id === id; })[0];
      if (next) fileTiles(files, next);
    };
    const refs = el('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,.webp', 'data-field': 'refs' });
    const refStatus = el('span', { class: 'sub sw-status', 'data-status': 'refs' });
    const refsSent = new Set();
    const plate = el('input', { type: 'file', accept: '.png,.jpg,.jpeg,.webp', 'data-field': 'plate' });
    const angle = input({ 'data-field': 'angle', style: 'min-width:260px' });
    const plateId = input({ 'data-field': 'plate-id', style: 'min-width:160px' });
    const plateStatus = el('span', { class: 'sub sw-status', 'data-status': 'plate' });
    node.appendChild(step(2, t('swStepFiles'), Boolean(entry.refs.length || entry.plates.length), [
      el('p', { class: 'meta', text: t('swFilesHelp') }),
      el('div', { class: 'form-row' }, [field(t('swRefs'), refs), el('button', { class: 'small', 'data-upload': 'refs', text: t('swUpload'), onclick: pending(function () {
        const items = Array.prototype.map.call(refs.files, function (file) { return { file: file, query: 'role=ref' }; });
        return sendLibraryFiles('/api/upload/sets/', id, items, refsSent, refStatus, 'sw-status', show, function () { refs.value = ''; });
      }, { spinner: false }) }), refStatus]),
      el('div', { class: 'form-row' }, [field(t('swPlate'), plate), field(t('setAngleField'), angle), field(t('setPlateId'), plateId), el('button', { class: 'small', 'data-upload': 'plate', text: t('swUpload'), onclick: pending(function () {
        if (!plate.files[0]) return;
        // One plate per click; a refused one (no angle, a taken id) stays chosen, so a corrected angle or id retries it.
        const query = 'role=plate&angle=' + encodeURIComponent(angle.value) + (plateId.value ? '&plate=' + encodeURIComponent(plateId.value) : '');
        return sendLibraryFiles('/api/upload/sets/', id, [{ file: plate.files[0], query: query }], new Set(), plateStatus, 'sw-status', show, function () { plate.value = ''; angle.value = ''; plateId.value = ''; });
      }, { spinner: false }) }), plateStatus]),
      files
    ]));

    node.appendChild(step(3, t('swStepDone'), false, [el('a', { class: 'sw-done', href: setHref(entry.id), text: t('swToSet') })]));
  }).catch(showError);
}

/** Route `#/new/set[/<id>]`. */
export function showSetWizard(id) {
  setLang(null);
  return id ? entrySteps(id) : choice();
}
