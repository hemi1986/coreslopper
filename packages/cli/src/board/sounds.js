// The sound library: the workspace's recurring meme sounds (library/sounds/<id>/,
// ADR 0051), each described so the meme skill picks well.
//   #/sounds        the library, an upload
//   #/sounds/<id>   one sound: play it, set its cue from the playback, edit, remove
import { addStrings, api, el, go, pending, post, setLang, showError, t, upload } from './lib.js';

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
    soundDelete: 'Aus der Bibliothek löschen', soundConfirmDelete: function (where) { return 'Diesen Sound aus der Bibliothek löschen? ' + (where.length ? 'Verwendet in: ' + where.join(', ') + '.' : 'Er wird nirgends verwendet.') + ' Memes behalten ihre Kopien.'; }
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
    soundDelete: 'Delete from the library', soundConfirmDelete: function (where) { return 'Delete this sound from the library? ' + (where.length ? 'Used in: ' + where.join(', ') + '.' : 'It is not used anywhere.') + ' Memes keep their copies.'; }
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

// ------------------------------------------------------------------ gallery

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

function gallery() {
  return load().then(function (data) {
    const node = main();
    node.appendChild(el('h2', { text: t('soundTitle'), style: 'margin:0 0 6px;font-size:20px' }));
    node.appendChild(el('p', { class: 'meta', text: t('soundHelp') }));
    const grid = el('div', { class: 'grid set-grid' });
    const draw = function (list) {
      grid.innerHTML = '';
      if (!list.sounds.length) grid.appendChild(el('p', { class: 'empty', text: t('soundEmpty') }));
      list.sounds.forEach(function (entry) {
        grid.appendChild(el('section', { class: 'card set-card', onclick: function () { go('#/sounds/' + entry.id); } }, [
          el('h3', { text: entry.title }),
          el('p', { class: 'meta clamp', text: entry.use_when }),
          el('div', {}, [
            el('span', { class: 'chip', text: entry.length + ' s' }), ' ',
            el('span', { class: 'chip', text: t('soundLicenceLabel') + ': ' + entry.licence }), ' ',
            el('span', { class: 'chip', text: t('soundUsedIn') + ' ' + entry.used_in.length })
          ].concat(entry.tags.map(function (tag) { return el('span', { class: 'chip', text: '#' + tag }); })))
        ]));
      });
      list.errors.forEach(function (error) { grid.appendChild(el('p', { class: 'error', text: error.id + ': ' + error.error })); });
    };
    draw(data);
    node.appendChild(grid);
    node.appendChild(uploadForm(function (id) { go('#/sounds/' + id); }));
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
    node.appendChild(el('p', {}, [el('a', { class: 'back-link', href: '#/sounds', text: t('soundBack') })]));
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

/** Route `#/sounds[/<id>]`. */
export function showSounds(id) {
  setLang(null);
  return id ? detail(id) : gallery();
}
