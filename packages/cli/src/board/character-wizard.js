// The wizard for a library character (UX guideline G10): reached from + New → Character, or from + New in the head
// of the Characters list. It first asks whether to create a character or import the characters of a production.
//   #/new/character        the choice; creating one ends step 1 with the new entry's address
//   #/new/character/<id>   the entry's steps: images, reference voice, the way to the character's page
// Every write goes through the library's existing routes (`/api/library/new`, `/api/upload/library/<id>`,
// `/api/library/import`), so the wizard creates exactly what `character new`, `add-file` and `import` create.
import { addStrings, api, el, go, pending, post, setLang, showError, t } from './lib.js';
import { sendLibraryFiles } from './library-wizard.js';
import { libraryFile } from './characters.js';
import { step } from './wizard.js';

addStrings({
  de: {
    cwTitle: 'Neue Figur', cwChip: 'Figur', cwCreate: 'Neu anlegen', cwImport: 'Aus Projekt oder Serie übernehmen',
    cwRequired: 'Pflichtfeld', cwStepData: 'Figur', cwStepImages: 'Character Sheet und weitere Bilder', cwStepVoice: 'Referenzstimme (optional)', cwStepDone: 'Fertig',
    cwImagesHelp: 'PNG, JPG oder WebP. Jedes Bild erscheint hier, sobald es hochgeladen ist.',
    cwVoiceHelp: 'Eine WAV-Aufnahme der Stimme und ihr exakter Text. Optional.',
    cwUpload: 'Hochladen', cwToCharacter: 'Zur Figur →', cwUnknown: function (id) { return 'Keine Figur „' + id + '“ in der Bibliothek.'; },
    cwImportHelp: 'Holt alle Figuren mit Bildern aus einem bestehenden Projekt oder einer Serie in die Bibliothek; bekannte Figuren bekommen nur ihre neuen Bilder und Zustände.',
    cwImportButton: 'Importieren', cwImported: function (n) { return n + ' Figur(en) übernommen:'; }, cwNothing: 'Keine Figur mit Bildern gefunden.',
    cwNoTargets: 'Noch kein Projekt und keine Serie im Workspace.'
  },
  en: {
    cwTitle: 'New character', cwChip: 'Character', cwCreate: 'Create new', cwImport: 'Import from a project or series',
    cwRequired: 'required', cwStepData: 'Character', cwStepImages: 'Character sheet and more images', cwStepVoice: 'Reference voice (optional)', cwStepDone: 'Done',
    cwImagesHelp: 'PNG, JPG, or WebP. Each image shows here once it is uploaded.',
    cwVoiceHelp: 'A WAV recording of the voice and its exact words. Optional.',
    cwUpload: 'Upload', cwToCharacter: 'To the character →', cwUnknown: function (id) { return 'No character "' + id + '" in the library.'; },
    cwImportHelp: 'Brings every character with images of an existing project or series into the library; known characters only gain their new images and states.',
    cwImportButton: 'Import', cwImported: function (n) { return n + ' character(s) taken in:'; }, cwNothing: 'No character with images found.',
    cwNoTargets: 'No project or series in the workspace yet.'
  }
});

const FACES = ['full', 'silhouette', 'screen-only', 'voice-only'];

function main() { const node = document.getElementById('main'); node.innerHTML = ''; return node; }
function input(attrs) { return el('input', Object.assign({ class: 'text' }, attrs)); }
function field(label, control) { return el('label', { class: 'form-field' }, [el('span', { text: label }), control]); }
/** A field the library requires: its label carries the visible marker, its control `aria-required`. */
function requiredField(label, control) {
  control.setAttribute('aria-required', 'true');
  return el('label', { class: 'form-field' }, [el('span', {}, [label + ' ', el('span', { class: 'sub cw-required', text: '(' + t('cwRequired') + ')' })]), control]);
}
function targetLabel(target) { return (target.scope === 'series' ? t('series') : t('project')) + ': ' + target.title; }
function characterHref(id) { return '#/characters/' + id; }

// ------------------------------------------------------------------ choice

function choice() {
  return api('/api/library').then(function (data) {
    const node = main();
    node.appendChild(el('h2', { text: t('cwTitle'), style: 'margin:0 0 16px;font-size:20px' }));
    const area = el('div', { class: 'cw-area' });
    const buttons = [];
    const pick = function (which) {
      buttons.forEach(function (b) { b.button.setAttribute('aria-pressed', b.which === which ? 'true' : 'false'); b.button.className = 'cw-choice ' + (b.which === which ? 'primary' : 'small'); });
      area.innerHTML = '';
      area.appendChild(which === 'create' ? createStep() : importStep(data));
    };
    [['create', t('cwCreate')], ['import', t('cwImport')]].forEach(function (c) {
      buttons.push({ which: c[0], button: el('button', { class: 'cw-choice small', 'data-choice': c[0], 'aria-pressed': 'false', onclick: function () { pick(c[0]); } }, [c[1]]) });
    });
    node.appendChild(el('div', { class: 'form-row cw-choices', role: 'group' }, buttons.map(function (b) { return b.button; })));
    node.appendChild(area);
  }).catch(showError);
}

/** Step 1: the entry's words. A refusal names its reason beside the step and keeps what was typed. */
function createStep() {
  // No `required` attribute: the library's refusal names the reason in the step, as for every other refusal.
  const name = input({ 'data-field': 'name' });
  const face = el('select', { class: 'text', 'data-field': 'face' }, FACES.map(function (f) { return el('option', { value: f, text: t('faces')[f] }); }));
  face.value = FACES[0];
  const description = el('textarea', { class: 'note-input', rows: 3, 'data-field': 'description' });
  const prompt = input({ 'data-field': 'prompt' }), tags = input({ 'data-field': 'tags' });
  const error = el('p', { class: 'error cw-error' });
  const form = el('form', { class: 'form' }, [
    el('div', { class: 'form-row' }, [requiredField(t('name'), name), field(t('face'), face), field(t('tags'), tags)]),
    el('div', { class: 'form-row' }, [requiredField(t('description'), description)]),
    el('div', { class: 'form-row' }, [field(t('prompt'), prompt)]),
    error, el('button', { class: 'primary', type: 'submit', text: t('createChar') })
  ]);
  form.onsubmit = pending(function () {
    error.textContent = '';
    return post('/api/library/new', { name: name.value, face: face.value, description: description.value, prompt: prompt.value, tags: tags.value })
      .then(function (created) { go('#/new/character/' + created.id); })
      .catch(function (e) { error.textContent = e.message; });
  });
  return step(1, t('cwStepData'), false, [form]);
}

/** The import path: a production's characters into the library, each linked to its page. */
function importStep(data) {
  const result = el('div', { class: 'meta cw-result' });
  if (!data.targets.length) return step(1, t('cwImport'), false, [el('p', { class: 'meta', text: t('cwImportHelp') }), el('p', { class: 'empty', text: t('cwNoTargets') })]);
  const target = el('select', { class: 'text' }, data.targets.map(function (x) { return el('option', { value: x.scope + '/' + x.slug, text: targetLabel(x) }); }));
  const button = el('button', { class: 'primary', text: t('cwImportButton'), onclick: pending(function () {
    const parts = target.value.split('/');
    result.innerHTML = '';
    result.className = 'meta cw-result';
    return post('/api/library/import', { scope: parts[0], slug: parts[1] }).then(function (r) {
      if (!r.results.length) { result.appendChild(el('p', { text: t('cwNothing') })); return; }
      const names = {};
      (r.characters || []).forEach(function (c) { names[c.id] = c.name; });
      result.appendChild(el('p', { text: t('cwImported')(r.results.length) }));
      result.appendChild(el('ul', {}, r.results.map(function (x) {
        return el('li', {}, [el('a', { href: characterHref(x.id), text: names[x.id] || x.id })]);
      })));
    }).catch(function (e) { result.className = 'error cw-result'; result.textContent = e.message; });
  }) });
  return step(1, t('cwImport'), false, [el('p', { class: 'meta', text: t('cwImportHelp') }), el('div', { class: 'form-row' }, [target, button]), result]);
}

// ------------------------------------------------------------------- steps

function tile(entry, name, label) {
  const audio = /\.wav$/i.test(name);
  return el('div', { class: 'file', 'data-file': name }, [
    audio ? el('audio', { controls: true, preload: 'none', src: libraryFile(entry.id, name) })
      : el('a', { class: 'media tall', href: libraryFile(entry.id, name), target: '_blank' }, [el('img', { src: libraryFile(entry.id, name), loading: 'lazy', alt: name })]),
    el('div', { class: 'name' }, [label ? el('b', { text: label }) : null, name])
  ]);
}

function imageTiles(box, entry) {
  box.innerHTML = '';
  if (entry.sheet) box.appendChild(tile(entry, entry.sheet, t('roles').sheet));
  entry.refs.forEach(function (name) { if (name !== entry.sheet) box.appendChild(tile(entry, name, null)); });
}

function voiceTile(box, entry) {
  box.innerHTML = '';
  if (entry.voice) box.appendChild(tile(entry, entry.voice.ref, t('roles').voice + ': ' + entry.voice.transcript));
}

/** Upload into the character `id`; `show(entry)` draws the entry after each file (`sendLibraryFiles`). */
function sendFiles(id, chosen, sent, status, show, done) {
  const items = chosen.map(function (item) {
    return { file: item.file, query: 'role=' + item.role + (item.role === 'voice' ? '&transcript=' + encodeURIComponent(item.transcript) : '') };
  });
  // The items are new objects, so `sent` keys by the file itself.
  return sendLibraryFiles('/api/upload/library/', id, items, sent, status, 'cw-status', function (listing) {
    const entry = (listing.characters || []).filter(function (c) { return c.id === id; })[0];
    if (entry) show(entry);
  }, done);
}

function entrySteps(id) {
  return api('/api/library').then(function (data) {
    const node = main();
    const entry = data.characters.filter(function (c) { return c.id === id; })[0];
    if (!entry) {
      node.appendChild(el('p', { class: 'error', text: t('cwUnknown')(id) }));
      node.appendChild(el('p', {}, [el('a', { href: '#/new/character', text: t('cwTitle') })]));
      return;
    }
    node.appendChild(el('header', { class: 'project' }, [el('h2', { text: entry.name }), el('span', { class: 'chip', text: t('cwChip') }), el('span', { class: 'chip', text: entry.id })]));
    node.appendChild(el('div', { style: 'height:12px' }));
    node.appendChild(step(1, t('cwStepData'), true, [el('p', { class: 'meta', text: [t('faces')[entry.face] || entry.face, entry.description].filter(Boolean).join(' · ') })]));

    // Step 2: the sheet and more images.
    const images = el('div', { class: 'files cw-images' });
    imageTiles(images, entry);
    const sheet = el('input', { type: 'file', accept: '.png,.jpg,.jpeg,.webp', 'data-field': 'sheet' });
    const refs = el('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,.webp', 'data-field': 'images' });
    const imageStatus = el('span', { class: 'sub cw-status' });
    const imagesSent = new Set();
    const imageStep = step(2, t('cwStepImages'), Boolean(entry.sheet || entry.refs.length), [
      el('p', { class: 'meta', text: t('cwImagesHelp') }),
      el('div', { class: 'form-row' }, [field(t('sheet'), sheet), field(t('images'), refs)]),
      el('div', { class: 'form-row' }, [el('button', { class: 'small', 'data-upload': 'images', text: t('cwUpload'), onclick: pending(function () {
        const items = [];
        if (sheet.files[0]) items.push({ file: sheet.files[0], role: 'sheet' });
        Array.prototype.forEach.call(refs.files, function (file) { items.push({ file: file, role: 'ref' }); });
        return sendFiles(id, items, imagesSent, imageStatus, function (e) { imageTiles(images, e); }, function () { sheet.value = ''; refs.value = ''; });
      }, { spinner: false }) }), imageStatus]),
      images
    ]);
    node.appendChild(imageStep);

    // Step 3: the reference voice with its exact transcript.
    const voiceBox = el('div', { class: 'files cw-voice' });
    voiceTile(voiceBox, entry);
    const voice = el('input', { type: 'file', accept: '.wav', 'data-field': 'voice' });
    const transcript = input({ 'data-field': 'transcript', style: 'min-width:320px' });
    const voiceStatus = el('span', { class: 'sub cw-status' });
    const voiceSent = new Set();
    node.appendChild(step(3, t('cwStepVoice'), Boolean(entry.voice), [
      el('p', { class: 'meta', text: t('cwVoiceHelp') }),
      el('div', { class: 'form-row' }, [field(t('voice'), voice), field(t('transcript'), transcript)]),
      el('div', { class: 'form-row' }, [el('button', { class: 'small', 'data-upload': 'voice', text: t('cwUpload'), onclick: pending(function () {
        if (!voice.files[0]) return;
        return sendFiles(id, [{ file: voice.files[0], role: 'voice', transcript: transcript.value }], voiceSent, voiceStatus, function (e) { voiceTile(voiceBox, e); }, function () { voice.value = ''; });
      }, { spinner: false }) }), voiceStatus]),
      voiceBox
    ]));

    node.appendChild(step(4, t('cwStepDone'), false, [el('a', { class: 'cw-done', href: characterHref(entry.id), text: t('cwToCharacter') })]));
  }).catch(showError);
}

/** Route `#/new/character[/<id>]`. */
export function showCharacterWizard(id) {
  setLang(null);
  return id ? entrySteps(id) : choice();
}
