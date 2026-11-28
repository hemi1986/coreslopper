// The wizard for a library sound (UX guideline G10): reached from + New → Sound, or from + New in the head of the
// Sounds list. A sound has no import path.
//   #/new/sound        step 1: the file and its words; the upload ends it with the new entry's address
//   #/new/sound/<id>   the entry's steps: cue and trim from the playback, licence, source and credit, the way to
//                      the sound's page
// Every write goes through the sound library's existing routes (`/api/upload/sounds`, `/api/sounds/<id>`), so the
// wizard creates exactly what `sound add` creates and changes exactly what `sound edit` changes.
import { addStrings, api, el, go, pending, post, setLang, showError, t, upload } from './lib.js';
import { soundFile } from './sounds.js';
import { step } from './wizard.js';

addStrings({
  de: {
    uwTitle: 'Neuer Sound', uwChip: 'Sound', uwRequired: 'Pflichtfeld',
    uwStepFile: 'Sound', uwStepCue: 'Cue und Trim', uwStepLicence: 'Lizenz, Quelle und Credit',
    uwFileHelp: 'Jede Audiodatei, die ffmpeg liest; sie wird als WAV gespeichert, Länge und Lautheit werden gemessen. Wofür entscheidet, wann das Meme-Skill den Sound wählt.',
    uwNeedsFile: 'Wähle eine Audiodatei zum Hochladen.', uwUpload: 'Hochladen', uwUploading: 'lädt hoch …',
    uwCueHelp: 'Abspielen und an der richtigen Stelle anhalten, dann den Cue oder den Trim aus der Abspielposition setzen. Der Cue zählt ab dem Trim-Anfang. Optional; Weiter behält, was gesetzt ist.',
    uwSetCue: 'Cue hier setzen', uwSetStart: 'Trim-Anfang hier', uwSetEnd: 'Trim-Ende hier',
    uwCue: 'Cue in Sekunden', uwTrimStart: 'Trim-Anfang in Sekunden', uwTrimEnd: 'Trim-Ende in Sekunden', uwLength: 'Länge',
    uwNext: 'Weiter', uwSave: 'Speichern', uwSaved: 'Gespeichert.',
    uwLicenceHelp: 'Optional. Ohne Lizenz bleibt sie „unknown“: der Release-Check macht aus jedem verwendeten Sound mit unbekannter Lizenz ein TODO, ebenso aus einer Lizenz, die einen Credit verlangt, wenn keiner da ist.',
    uwToSound: 'Zum Sound →',
    uwUnknown: function (id) { return 'Kein Sound „' + id + '“ in der Bibliothek.'; }
  },
  en: {
    uwTitle: 'New sound', uwChip: 'Sound', uwRequired: 'required',
    uwStepFile: 'Sound', uwStepCue: 'Cue and trim', uwStepLicence: 'Licence, source, and credit',
    uwFileHelp: 'Any audio file ffmpeg reads; it is stored as a WAV, and its length and loudness are measured. Use when decides when the meme skill picks the sound.',
    uwNeedsFile: 'Choose an audio file to upload.', uwUpload: 'Upload', uwUploading: 'uploading …',
    uwCueHelp: 'Play and pause at the right moment, then set the cue or the trim from the playback position. The cue counts from the trim\'s start. Optional; Next keeps what is set.',
    uwSetCue: 'Set cue here', uwSetStart: 'Trim start here', uwSetEnd: 'Trim end here',
    uwCue: 'Cue in seconds', uwTrimStart: 'Trim start in seconds', uwTrimEnd: 'Trim end in seconds', uwLength: 'Length',
    uwNext: 'Next', uwSave: 'Save', uwSaved: 'Saved.',
    uwLicenceHelp: 'Optional. Without a licence it stays "unknown": the release check turns every used sound of unknown licence into a TODO, and so a licence that asks for a credit when none is given.',
    uwToSound: 'To the sound →',
    uwUnknown: function (id) { return 'No sound "' + id + '" in the library.'; }
  }
});

function main() { const node = document.getElementById('main'); node.innerHTML = ''; return node; }
/** An input whose value is set as a property, so a resumed step shows what is stored. */
function input(attrs, value) { const node = el('input', Object.assign({ class: 'text' }, attrs)); node.value = value === undefined ? '' : value; return node; }
function field(label, control) { return el('label', { class: 'form-field' }, [el('span', { text: label }), control]); }
/** A field the sound library requires: its label carries the visible marker, its control `aria-required`. */
function requiredField(label, control) {
  control.setAttribute('aria-required', 'true');
  return el('label', { class: 'form-field' }, [el('span', {}, [label + ' ', el('span', { class: 'sub uw-required', text: '(' + t('uwRequired') + ')' })]), control]);
}
function param(name, value) { return value === undefined || value === null || value === '' ? '' : '&' + name + '=' + encodeURIComponent(value); }
function rounded(seconds) { return Math.round(seconds * 1000) / 1000; }
function shown(value) { return value === undefined || value === null ? '' : String(value); }
function soundHref(id) { return '#/sounds/' + id; }

// ------------------------------------------------------------------ step 1

/** Step 1: the file and its words. A refusal names its reason in the step and keeps what was typed. */
function fileStep() {
  const node = main();
  node.appendChild(el('h2', { text: t('uwTitle'), style: 'margin:0 0 16px;font-size:20px' }));
  // No `required` attribute: the library's refusal names the reason in the step, as for every other refusal.
  const file = el('input', { type: 'file', accept: 'audio/*,.wav,.mp3,.flac,.aif,.aiff,.m4a,.ogg,.opus', 'data-field': 'file' });
  const title = input({ 'data-field': 'title' }), tags = input({ 'data-field': 'tags' });
  const useWhen = el('textarea', { class: 'note-input', rows: 2, 'data-field': 'use-when' });
  const error = el('p', { class: 'error uw-error' });
  const progress = el('p', { class: 'meta uw-progress' });
  const form = el('form', { class: 'form' }, [
    el('p', { class: 'meta', text: t('uwFileHelp') }),
    el('div', { class: 'form-row' }, [requiredField(t('soundFile'), file), requiredField(t('soundTitleField'), title), field(t('soundTags'), tags)]),
    el('div', { class: 'form-row' }, [requiredField(t('soundUseWhen'), useWhen)]),
    error, progress, el('button', { class: 'primary', type: 'submit', text: t('uwUpload') })
  ]);
  form.onsubmit = pending(function () {
    error.textContent = '';
    progress.textContent = '';
    const chosen = file.files[0];
    if (!chosen) { error.textContent = t('uwNeedsFile'); return; }
    const query = '?name=' + encodeURIComponent(chosen.name) + param('title', title.value) + param('use-when', useWhen.value) + param('tags', tags.value);
    return upload('/api/upload/sounds' + query, chosen, function (share) { progress.textContent = t('uwUploading') + ' ' + Math.round(share * 100) + '%'; })
      .then(function (result) { go('#/new/sound/' + result.sound.id); })
      .catch(function (e) { error.textContent = e.message; progress.textContent = ''; });
  });
  node.appendChild(step(1, t('uwStepFile'), false, [form]));
}

// ------------------------------------------------------------------- steps

/**
 * Step 2: cue and trim from the playback position, as on the sound's page. The buttons fill the fields; Next stores
 * what changed through `sound edit`'s route. A cue left untouched stays out of the change, so a new trim keeps the
 * moment the sound lands on (the library's rule); the trim start button moves a set cue the same way.
 */
function cueStep(entry, passed, again) {
  const audio = el('audio', { class: 'sound-player', controls: true, preload: 'metadata', src: soundFile(entry.id), 'data-player': 'sound' });
  const storedCue = shown(entry.cue);
  const storedStart = entry.trim ? String(entry.trim.start) : '', storedEnd = entry.trim ? String(entry.trim.end) : '';
  const cue = input({ type: 'number', min: '0', step: '0.001', 'data-field': 'cue' }, storedCue);
  const start = input({ type: 'number', min: '0', step: '0.001', 'data-field': 'trim-start' }, storedStart);
  const end = input({ type: 'number', min: '0', step: '0.001', 'data-field': 'trim-end' }, storedEnd);
  const error = el('p', { class: 'error uw-error', 'data-error': 'cue' });
  const startAt = function () { return start.value.trim() === '' ? 0 : Number(start.value); };
  const at = function () { return rounded(audio.currentTime || 0); };
  const setCue = el('button', { class: 'small', type: 'button', 'data-set': 'cue', onclick: function () { cue.value = String(rounded(at() - startAt())); } }, [t('uwSetCue')]);
  const setStart = el('button', { class: 'small', type: 'button', 'data-set': 'trim-start', onclick: function () {
    const before = startAt();
    start.value = String(at());
    // The cue counts from the trim's start: a set cue keeps its moment in the file.
    if (cue.value.trim() !== '' && Number.isFinite(Number(cue.value))) cue.value = String(rounded(Number(cue.value) + before - Number(start.value)));
  } }, [t('uwSetStart')]);
  const setEnd = el('button', { class: 'small', type: 'button', 'data-set': 'trim-end', onclick: function () { end.value = String(at()); } }, [t('uwSetEnd')]);
  const next = el('button', { class: 'primary', type: 'button', 'data-next': 'cue', onclick: pending(function () {
    error.textContent = '';
    const change = { action: 'update' };
    if (cue.value.trim() !== storedCue) change.cue = cue.value.trim();
    if (start.value.trim() !== storedStart || end.value.trim() !== storedEnd) {
      // Both empty clears the trim; one of them alone is sent as it is, so the library names what is missing.
      change.trim = start.value.trim() === '' && end.value.trim() === '' ? '' : start.value.trim() + '-' + end.value.trim();
    }
    if (Object.keys(change).length === 1) return again({ cue: true });
    // A refusal names its reason in the step; the fields keep what was set.
    return post('/api/sounds/' + encodeURIComponent(entry.id), change).then(function () { return again({ cue: true }); }).catch(function (e) { error.textContent = e.message; });
  }) }, [t('uwNext')]);
  return step(2, t('uwStepCue'), passed || entry.cue !== undefined || Boolean(entry.trim), [
    audio,
    el('p', { class: 'meta', text: t('uwCueHelp') }),
    el('p', { class: 'meta' }, [el('b', { text: t('uwLength') + ': ' }), entry.length + ' s']),
    el('div', { class: 'form-row', style: 'align-items:center' }, [setCue, setStart, setEnd]),
    el('div', { class: 'form-row' }, [field(t('uwCue'), cue), field(t('uwTrimStart'), start), field(t('uwTrimEnd'), end)]),
    error, next
  ]);
}

/** Step 3: licence, source and credit. An empty licence stays `unknown`, and the step says what that means. */
function licenceStep(entry, passed, again) {
  const licence = input({ placeholder: 'unknown', 'data-field': 'licence' }, entry.licence === 'unknown' ? '' : entry.licence);
  const source = input({ 'data-field': 'source' }, shown(entry.source));
  const credit = input({ 'data-field': 'credit' }, shown(entry.credit));
  const message = el('p', { class: 'meta uw-saved', text: passed ? t('uwSaved') : '' });
  const save = el('button', { class: 'primary', type: 'button', 'data-save': 'licence', onclick: pending(function () {
    message.className = 'meta uw-saved';
    message.textContent = '';
    return post('/api/sounds/' + encodeURIComponent(entry.id), { action: 'update', licence: licence.value, source: source.value, credit: credit.value })
      .then(function () { return again({ cue: true, licence: true }); })
      // A refusal names its reason in the step; the fields keep what was typed.
      .catch(function (e) { message.className = 'error uw-saved'; message.textContent = e.message; });
  }) }, [t('uwSave')]);
  const done = passed || entry.licence !== 'unknown' || Boolean(entry.source) || Boolean(entry.credit);
  return step(3, t('uwStepLicence'), done, [
    el('p', { class: 'meta uw-licence-note', text: t('uwLicenceHelp') }),
    el('div', { class: 'form-row' }, [field(t('soundLicence'), licence), field(t('soundSource'), source), field(t('soundCredit'), credit)]),
    el('p', { class: 'meta' }, [el('b', { text: t('soundLicenceLabel') + ': ' }), el('span', { class: 'uw-licence', text: entry.licence })]),
    message,
    el('div', { class: 'form-row', style: 'align-items:center' }, [save, el('a', { class: 'uw-done', href: soundHref(entry.id), text: t('uwToSound') })])
  ]);
}

/** The entry's steps; `passed` names the steps this visit went through, which count as done although optional. */
function entrySteps(id, passed) {
  return api('/api/sounds').then(function (data) {
    const node = main();
    const entry = data.sounds.filter(function (sound) { return sound.id === id; })[0];
    if (!entry) {
      node.appendChild(el('p', { class: 'error', text: t('uwUnknown')(id) }));
      node.appendChild(el('p', {}, [el('a', { href: '#/new/sound', text: t('uwTitle') })]));
      return;
    }
    const again = function (next) { return entrySteps(id, next); };
    node.appendChild(el('header', { class: 'project' }, [el('h2', { text: entry.title }), el('span', { class: 'chip', text: t('uwChip') }), el('span', { class: 'chip', text: entry.id })]));
    node.appendChild(el('div', { style: 'height:12px' }));
    node.appendChild(step(1, t('uwStepFile'), true, [el('p', { class: 'meta', text: entry.use_when })]));
    node.appendChild(cueStep(entry, Boolean(passed.cue), again));
    node.appendChild(licenceStep(entry, Boolean(passed.licence), again));
  }).catch(showError);
}

/** Route `#/new/sound[/<id>]`. */
export function showSoundWizard(id) {
  setLang(null);
  if (!id) { fileStep(); return Promise.resolve(); }
  return entrySteps(id, {});
}
