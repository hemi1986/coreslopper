// The wizard for a new music video, series, or episode. It collects what a
// form can hold (project data, lyrics, song, references) and ends with the one
// command to type in Claude Code, where the grilling happens.
//   #/new                 choose            #/new/video[/<slug>]
//   #/new/series[/<slug>]                   #/new/episode[/<slug>]
import { addStrings, api, copyButton, el, go, pending, post, projectFile, setLang, showError, t, upload } from './lib.js';
import { libraryPicker } from './characters.js';

addStrings({
  de: {
    newTitle: 'Neu anlegen', newVideo: 'Musikvideo', newVideoSub: 'Zu einem fertigen Song: Projektdaten, Lyrics, Song, Referenzen, Figuren.',
    newSeries: 'Serie', newSeriesSub: 'Der Canon einer Serie: Daten und Referenzen für Figuren, Sets, Look.', newEpisode: 'Episode', newEpisodeSub: 'Eine Episode einer Serie, deren Canon fertig ist.',
    title: 'Titel', artist: 'Artist', slug: 'Slug', budget: 'Budget (USD)', internal: 'Nur intern (nicht öffentlich, kein Release-Paket)', imageProvider: 'Bilder', videoProvider: 'Clips', audioProvider: 'Stimmen und Sounds',
    language: 'Gesungene Sprache (ISO, z. B. de)', rights: 'Rechte (wem gehört der Song?)', license: 'Lizenz', format: 'Hauptformat',
    create: 'Anlegen', noKey: '(kein Zugang in .env)', minimum: function (v) { return 'mindestens $' + v; }, taken: 'Diesen Slug gibt es schon.',
    stepData: 'Projekt', stepLyrics: 'Lyrics', stepSong: 'Song und Vocal-Stem', stepRefs: 'Referenzen', stepChars: 'Figuren aus der Bibliothek', stepDone: 'Fertig',
    lyricsHelp: 'Die kompletten Lyrics einfügen. Jede Zeile gehört unter einen Section-Tag wie [Verse 1] oder [Chorus]; Suno-Klammern bleiben, wie sie sind.',
    propose: 'Tags vorschlagen', saveLyrics: 'Lyrics speichern', sections: 'Sections', saved: 'gespeichert',
    songHelp: 'Den fertigen Mix und, wenn möglich, den Vocal-Stem aus derselben Session. WAV wird direkt genutzt; MP3, FLAC, AIFF, M4A, OGG werden umgewandelt.',
    songFile: 'Song (Mix)', vocalsFile: 'Vocal-Stem', upload: 'Hochladen', duration: 'Länge', stem: 'Stem', none: 'keiner',
    refsHelp: 'Alles, was der Agent kennen soll: Moodboards, Fotos von Personen, Orte, eigene Storyboards, Videokonzepte, Footage, Sprachaufnahmen, Links. Die Fragen dazu stellt der Agent beim Grilling.',
    kind: 'Art', subject: 'Zeigt (z. B. Figur, Set, Section)', note: 'Was soll daraus werden?', addFiles: 'Dateien hinzufügen', addLink: 'Link hinzufügen', url: 'https://…',
    kinds: { look: 'Look', character: 'Figur/Person', location: 'Ort/Set', storyboard: 'Storyboard', concept: 'Konzept', footage: 'Footage', voice: 'Stimme', other: 'Sonstiges' },
    finish: 'Setup abschließen', missing: function (m) { return 'Es fehlt noch: ' + m; }, setupDone: 'Setup fertig. In Claude Code weiter mit:',
    seriesNext: 'Jetzt in Claude Code den Canon grillen lassen:', episodeNext: 'Episode angelegt. In Claude Code das Skript grillen lassen:',
    series: 'Serie', episode: 'Episode', canonNotReady: 'Der Canon dieser Serie ist noch nicht fertig; eine Episode braucht Figuren und Sets mit Referenzen.',
    remaining: function (v) { return 'frei im Serienbudget: $' + v; }, warnings: 'Hinweise', uploading: 'lädt hoch …', open: 'öffnen', remove: 'Entfernen', back: 'Zurück',
    toProject: 'Zum Projekt →', toSeries: 'Zur Serie →'
  },
  en: {
    newTitle: 'Create', newVideo: 'Music video', newVideoSub: 'For a finished song: project data, lyrics, song, references, characters.',
    newSeries: 'Series', newSeriesSub: 'A series canon: data and references for characters, sets, and look.', newEpisode: 'Episode', newEpisodeSub: 'An episode of a series whose canon is complete.',
    title: 'Title', artist: 'Artist', slug: 'Slug', budget: 'Budget (USD)', internal: 'Internal only (not released publicly, no release package)', imageProvider: 'Images', videoProvider: 'Clips', audioProvider: 'Voices and sounds',
    language: 'Sung language (ISO, e.g. en)', rights: 'Rights (who owns the song?)', license: 'License', format: 'Master format',
    create: 'Create', noKey: '(no access in .env)', minimum: function (v) { return 'at least $' + v; }, taken: 'This slug exists already.',
    stepData: 'Project', stepLyrics: 'Lyrics', stepSong: 'Song and vocal stem', stepRefs: 'References', stepChars: 'Characters from the library', stepDone: 'Done',
    lyricsHelp: 'Paste the complete lyrics. Every line belongs under a section tag like [Verse 1] or [Chorus]; Suno parentheses stay as they are.',
    propose: 'Propose tags', saveLyrics: 'Save lyrics', sections: 'Sections', saved: 'saved',
    songHelp: 'The finished mix and, if you have it, the vocal stem from the same session. WAV is used as is; MP3, FLAC, AIFF, M4A, and OGG are converted.',
    songFile: 'Song (mix)', vocalsFile: 'Vocal stem', upload: 'Upload', duration: 'Length', stem: 'Stem', none: 'none',
    refsHelp: 'Everything the agent should know: mood boards, photos of people, places, your own storyboards, video concepts, footage, voice recordings, links. The agent asks about them while grilling.',
    kind: 'Kind', subject: 'Shows (e.g. a character, set, section)', note: 'What should come of it?', addFiles: 'Add files', addLink: 'Add link', url: 'https://…',
    kinds: { look: 'Look', character: 'Character/person', location: 'Place/set', storyboard: 'Storyboard', concept: 'Concept', footage: 'Footage', voice: 'Voice', other: 'Other' },
    finish: 'Finish setup', missing: function (m) { return 'Still missing: ' + m; }, setupDone: 'Setup done. Continue in Claude Code with:',
    seriesNext: 'Now let Claude Code grill the canon:', episodeNext: 'Episode created. Let Claude Code grill the script:',
    series: 'Series', episode: 'Episode', canonNotReady: 'This series’ canon is not complete yet; an episode needs characters and sets with references.',
    remaining: function (v) { return 'uncommitted in the series budget: $' + v; }, warnings: 'Notes', uploading: 'uploading …', open: 'open', remove: 'Remove', back: 'Back',
    toProject: 'Go to the project →', toSeries: 'Go to the series →'
  }
});

const KINDS = ['look', 'character', 'location', 'storyboard', 'concept', 'footage', 'voice', 'other'];
let options = null;

function main() { const node = document.getElementById('main'); node.innerHTML = ''; return node; }
function slugify(text) { return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); }
/** The "not released publicly" box: `distribution: internal` in project.yaml. */
function internalBox() {
  const box = el('input', { type: 'checkbox' });
  return { box: box, node: el('label', { class: 'form-field' }, [el('span', {}, [box, ' ' + t('internal')])]) };
}

function field(label, input, hint) { return el('label', { class: 'form-field' }, [el('span', { text: label }), input, hint ? el('span', { class: 'sub', text: hint }) : null]); }
function input(attrs) { return el('input', Object.assign({ class: 'text' }, attrs)); }
function select(values, labels, selected) {
  return el('select', { class: 'text' }, values.map(function (v, i) { return el('option', { value: v, selected: v === selected ? true : undefined, text: labels[i] }); }));
}
function providerSelect(kinds, selected) {
  return select(kinds, kinds.map(function (k) { return k + (k !== 'mock' && options.providers[k] === false ? ' ' + t('noKey') : ''); }), selected);
}
/** The command to type in Claude Code; `link` (the project or series page) is the way out of the wizard. */
function commandBox(text, command, link) {
  return el('div', { class: 'next' }, [el('span', { text: text }), el('code', { text: command }), copyButton(command, { copy: t('copy'), copied: t('copied') }), link || null]);
}
function projectLink(slug) { return el('a', { href: '#/p/' + slug, text: t('toProject') }); }
function seriesLink(slug) { return el('a', { href: '#/s/' + slug, text: t('toSeries') }); }
function step(n, title, done, children) {
  return el('section', { class: 'card step' + (done ? ' done-step' : '') }, [el('h3', { class: 'step-title' }, [el('span', { class: 'step-n', text: done ? '✓' : String(n) }), title])].concat(children));
}
function loadOptions() { return api('/api/new/options').then(function (o) { options = o; return o; }); }

function choose() {
  const node = main();
  node.appendChild(el('h2', { text: t('newTitle'), style: 'margin:0 0 16px;font-size:20px' }));
  node.appendChild(el('div', { class: 'grid' }, [
    ['video', t('newVideo'), t('newVideoSub')], ['series', t('newSeries'), t('newSeriesSub')], ['episode', t('newEpisode'), t('newEpisodeSub')]
  ].map(function (c) {
    return el('section', { class: 'card', onclick: function () { go('#/new/' + c[0]); } }, [el('h3', { text: c[1], style: 'margin:0 0 6px' }), el('p', { class: 'meta', text: c[2] })]);
  })));
}

// --------------------------------------------------------------- references

function referencesStep(n, scope, slug, references, refresh) {
  const kind = select(KINDS, KINDS.map(function (k) { return t('kinds')[k]; }), scope === 'series' ? 'character' : 'look');
  const subject = input({ placeholder: t('subject') });
  const note = input({ placeholder: t('note') });
  const files = el('input', { type: 'file', multiple: true });
  const progress = el('span', { class: 'sub' });
  const link = input({ type: 'url', placeholder: t('url') });
  const base = '/api/upload/' + scope + '/' + encodeURIComponent(slug) + '/reference';
  const addFiles = pending(function () {
    const list = Array.prototype.slice.call(files.files);
    let chain = Promise.resolve();
    list.forEach(function (file, index) {
      chain = chain.then(function () {
        const query = '?name=' + encodeURIComponent(file.name) + '&kind=' + kind.value + '&subject=' + encodeURIComponent(subject.value) + '&note=' + encodeURIComponent(note.value);
        return upload(base + query, file, function (share) { progress.textContent = (index + 1) + '/' + list.length + ' · ' + Math.round(share * 100) + '%'; });
      });
    });
    return chain.then(function () { refresh(); }).catch(function (error) { progress.textContent = error.message; progress.className = 'error'; });
  }, { spinner: false });
  const change = function (payload) { return post('/api/new/' + scope + '/' + encodeURIComponent(slug) + '/references', payload).then(refresh).catch(showError); };
  const fileUrl = function (path) { return scope === 'series' ? '/series-files/' + encodeURIComponent(slug) + '/' + path.split('/').map(encodeURIComponent).join('/') : projectFile(slug, path); };
  const list = el('div', { class: 'refs' }, references.map(function (r) {
    const preview = r.file && /\.(png|jpe?g|webp|gif)$/i.test(r.file) ? el('img', { src: fileUrl(r.file), loading: 'lazy', alt: r.title || '' }) : el('div', { class: 'ref-icon', text: (r.file ? r.file.split('.').pop() : 'link').toUpperCase() });
    return el('div', { class: 'ref' }, [
      preview,
      el('div', { class: 'ref-body' }, [
        el('div', {}, [el('span', { class: 'chip', text: t('kinds')[r.kind] }), ' ', r.file ? el('a', { href: fileUrl(r.file), target: '_blank', text: r.title || r.file }) : el('a', { href: r.url, target: '_blank', rel: 'noopener', text: r.title || r.url })]),
        r.subject ? el('div', { class: 'meta', text: r.subject }) : null,
        r.note ? el('div', { class: 'meta', text: r.note }) : null
      ]),
      el('button', { class: 'small', text: t('remove'), onclick: pending(function () { return change({ action: 'delete', id: r.id }); }) })
    ]);
  }));
  return step(n, t('stepRefs'), references.length > 0, [
    el('p', { class: 'meta', text: t('refsHelp') }),
    el('div', { class: 'form-row' }, [field(t('kind'), kind), field(t('subject'), subject), field(t('note'), note)]),
    el('div', { class: 'form-row' }, [files, el('button', { class: 'small', text: t('addFiles'), onclick: addFiles }), progress]),
    el('div', { class: 'form-row' }, [link, el('button', { class: 'small', text: t('addLink'), onclick: pending(function () { return change({ action: 'link', url: link.value.trim(), kind: kind.value, subject: subject.value, note: note.value }); }) })]),
    list
  ]);
}

// -------------------------------------------------------------- music video

function videoForm() {
  const node = main();
  node.appendChild(el('h2', { text: t('newVideo'), style: 'margin:0 0 16px;font-size:20px' }));
  const title = input({ required: true }), artist = input({ required: true }), slug = input({ required: true, pattern: '[a-z0-9][a-z0-9-]*' });
  const budget = input({ type: 'number', min: options.minimumBudgetUsd, step: '1', value: '50' });
  const providers = ['mock', 'fal', 'higgsfield', 'topview', 'comfyui'];
  const best = ['fal', 'higgsfield', 'topview'].filter(function (p) { return options.providers[p]; })[0] || 'mock';
  const image = providerSelect(providers, best), video = providerSelect(providers, options.providers.comfyui ? 'comfyui' : best);
  const language = input({ value: navigator.language ? navigator.language.slice(0, 2) : 'en' });
  const rights = input({}), license = input({});
  const internal = internalBox();
  let slugEdited = false;
  title.oninput = function () { if (!slugEdited) slug.value = slugify(title.value); };
  slug.oninput = function () { slugEdited = true; };
  const error = el('p', { class: 'error' });
  const form = el('form', { class: 'card form' }, [
    el('div', { class: 'form-row' }, [field(t('title'), title), field(t('artist'), artist), field(t('slug'), slug)]),
    el('div', { class: 'form-row' }, [field(t('budget'), budget, t('minimum')(options.minimumBudgetUsd)), field(t('imageProvider'), image), field(t('videoProvider'), video)]),
    el('div', { class: 'form-row' }, [field(t('language'), language), field(t('rights'), rights), field(t('license'), license)]),
    internal.node, error, el('button', { class: 'primary', type: 'submit', text: t('create') })
  ]);
  form.onsubmit = pending(function () {
    if (options.slugs.indexOf(slug.value) >= 0) { error.textContent = t('taken'); return; }
    return post('/api/new/video', { title: title.value, artist: artist.value, slug: slug.value, budget: Number(budget.value), imageProvider: image.value, videoProvider: video.value, language: language.value, rights: rights.value, license: license.value, internal: internal.box.checked })
      .then(function (r) { go('#/new/video/' + r.slug); })
      .catch(function (e) { error.textContent = e.message; });
  });
  node.appendChild(form);
}

function videoSteps(slug) {
  return api('/api/new/video/' + encodeURIComponent(slug)).then(function (state) {
    const node = main();
    const refresh = function () { videoSteps(slug); };
    node.appendChild(el('header', { class: 'project' }, [el('h2', { text: state.title }), el('span', { class: 'chip', text: t('newVideo') })]));
    node.appendChild(el('div', { style: 'height:12px' }));
    if (state.setupDone) node.appendChild(commandBox(t('setupDone'), '/new-video ' + slug));
    node.appendChild(step(1, t('stepData'), true, [el('p', { class: 'meta', text: [state.song.artist, state.song.language, state.song.rights, state.song.license].filter(Boolean).join(' · ') })]));

    // Lyrics
    const text = el('textarea', { class: 'note-input lyrics', rows: 16 });
    text.value = state.lyrics.text;
    const sectionList = el('ol', { class: 'sections' });
    const lyricsError = el('p', { class: 'error' });
    const showSections = function (sections) {
      sectionList.innerHTML = '';
      sections.forEach(function (s) { sectionList.appendChild(el('li', {}, [el('b', { text: '[' + s.tag + '] ' }), s.lines[0] || '']) ); });
    };
    const propose = pending(function () {
      return post('/api/new/video/' + encodeURIComponent(slug) + '/lyrics', { text: text.value, preview: true }).then(function (r) { text.value = r.text; showSections(r.sections); lyricsError.textContent = ''; }).catch(function (e) { lyricsError.textContent = e.message; });
    });
    if (state.lyrics.written) post('/api/new/video/' + encodeURIComponent(slug) + '/lyrics', { text: state.lyrics.text, preview: true }).then(function (r) { showSections(r.sections); }).catch(function () {});
    node.appendChild(step(2, t('stepLyrics'), state.lyrics.written, [
      el('p', { class: 'meta', text: t('lyricsHelp') }), text,
      el('div', { class: 'form-row' }, [
        el('button', { class: 'small', text: t('propose'), onclick: propose }),
        el('button', { class: 'small', text: t('saveLyrics'), onclick: pending(function () {
          return post('/api/new/video/' + encodeURIComponent(slug) + '/lyrics', { text: text.value }).then(refresh).catch(function (e) { lyricsError.textContent = e.message; });
        }) })
      ]),
      lyricsError, el('h4', { class: 'section-title', text: t('sections') }), sectionList
    ]));

    // Song
    const songStatus = el('div', { class: 'meta' });
    const audioUpload = function (target, label) {
      const file = el('input', { type: 'file', accept: '.wav,.mp3,.flac,.aif,.aiff,.m4a,.ogg,.opus,audio/*' });
      const progress = el('span', { class: 'sub' });
      const button = el('button', { class: 'small', text: t('upload'), onclick: pending(function () {
        if (!file.files[0]) return;
        progress.textContent = t('uploading');
        return upload('/api/upload/project/' + encodeURIComponent(slug) + '/' + target + '?name=' + encodeURIComponent(file.files[0].name), file.files[0], function (share) { progress.textContent = Math.round(share * 100) + '%'; })
          .then(function (r) { if (r.warnings && r.warnings.length) window.alert(r.warnings.join('\n')); refresh(); })
          .catch(function (e) { progress.textContent = e.message; progress.className = 'error'; });
      }, { spinner: false }) });
      return field(label, el('div', { class: 'form-row' }, [file, button, progress]));
    };
    const s = state.song;
    songStatus.textContent = typeof s.duration === 'number'
      ? t('duration') + ' ' + Math.floor(s.duration / 60) + ':' + String(Math.round(s.duration % 60)).padStart(2, '0') + ' · ' + t('stem') + ': ' + (s.stems ? (s.sourceFiles && s.sourceFiles.vocals) || '✓' : t('none')) + (s.sourceFiles ? ' · ' + s.sourceFiles.song : '')
      : '';
    node.appendChild(step(3, t('stepSong'), typeof s.duration === 'number', [el('p', { class: 'meta', text: t('songHelp') }), audioUpload('song', t('songFile')), audioUpload('vocals', t('vocalsFile')), songStatus]));

    node.appendChild(referencesStep(4, 'project', slug, state.references, refresh));
    node.appendChild(step(5, t('stepChars'), false, [libraryPicker('project', slug)]));

    const finishError = el('p', { class: 'error', text: state.missing.length ? t('missing')(state.missing.map(function (m) { return m === 'lyrics' ? t('stepLyrics') : t('stepSong'); }).join(', ')) : '' });
    node.appendChild(step(6, t('stepDone'), state.setupDone, state.setupDone ? [commandBox(t('setupDone'), '/new-video ' + slug, projectLink(slug))] : [
      finishError,
      el('div', { class: 'form-row' }, [
        el('button', { class: 'primary', text: t('finish'), disabled: state.missing.length ? true : undefined, onclick: pending(function () { return post('/api/new/video/' + encodeURIComponent(slug) + '/finish', {}).then(refresh).catch(function (e) { finishError.textContent = e.message; }); }) }),
        projectLink(slug)
      ])
    ]));
  }).catch(showError);
}

// ------------------------------------------------------------------- series

function seriesForm() {
  const node = main();
  node.appendChild(el('h2', { text: t('newSeries'), style: 'margin:0 0 16px;font-size:20px' }));
  const title = input({}), slug = input({ pattern: '[a-z0-9][a-z0-9-]*' }), budget = input({ type: 'number', min: 1, step: '1', value: '100' });
  const format = select(options.formats, options.formats, '9x16');
  const providers = ['mock', 'fal', 'higgsfield', 'topview', 'comfyui'];
  const best = ['fal', 'higgsfield', 'topview'].filter(function (p) { return options.providers[p]; })[0] || 'mock';
  const image = providerSelect(providers, best), video = providerSelect(providers, options.providers.comfyui ? 'comfyui' : best);
  const audio = select(['comfyui', 'mock'], ['comfyui', 'mock'], options.providers.comfyui ? 'comfyui' : 'mock');
  let slugEdited = false;
  title.oninput = function () { if (!slugEdited) slug.value = slugify(title.value); };
  slug.oninput = function () { slugEdited = true; };
  const error = el('p', { class: 'error' });
  const form = el('form', { class: 'card form' }, [
    el('div', { class: 'form-row' }, [field(t('title'), title), field(t('slug'), slug), field(t('budget'), budget)]),
    el('div', { class: 'form-row' }, [field(t('format'), format), field(t('imageProvider'), image), field(t('videoProvider'), video), field(t('audioProvider'), audio)]),
    error, el('button', { class: 'primary', type: 'submit', text: t('create') })
  ]);
  form.onsubmit = pending(function () {
    if (options.slugs.indexOf(slug.value) >= 0) { error.textContent = t('taken'); return; }
    return post('/api/new/series', { title: title.value, slug: slug.value, budget: Number(budget.value), format: format.value, imageProvider: image.value, videoProvider: video.value, audioProvider: audio.value })
      .then(function (r) { go('#/new/series/' + r.slug); })
      .catch(function (e) { error.textContent = e.message; });
  });
  node.appendChild(form);
}

function seriesSteps(slug) {
  return api('/api/new/series/' + encodeURIComponent(slug) + '/references').then(function (refs) {
    const node = main();
    node.appendChild(el('header', { class: 'project' }, [el('h2', { text: slug }), el('span', { class: 'chip', text: t('newSeries') })]));
    node.appendChild(el('div', { style: 'height:12px' }));
    node.appendChild(referencesStep(1, 'series', slug, refs.references, function () { seriesSteps(slug); }));
    node.appendChild(step(2, t('stepChars'), false, [libraryPicker('series', slug)]));
    node.appendChild(step(3, t('stepDone'), false, [commandBox(t('seriesNext'), '/new-series ' + slug, seriesLink(slug))]));
  }).catch(showError);
}

// ------------------------------------------------------------------ episode

function episodeForm() {
  const node = main();
  node.appendChild(el('h2', { text: t('newEpisode'), style: 'margin:0 0 16px;font-size:20px' }));
  if (!options.series.length) { node.appendChild(el('p', { class: 'empty', text: t('canonNotReady') })); return; }
  const series = select(options.series.map(function (s) { return s.slug; }), options.series.map(function (s) { return s.title; }), (options.series.filter(function (s) { return s.canonReady; })[0] || options.series[0]).slug);
  const number = input({ type: 'number', min: 1, step: '1' }), slug = input({ pattern: '[a-z0-9][a-z0-9-]*' }), budget = input({ type: 'number', min: 1, step: '1', value: '10' });
  const info = el('p', { class: 'meta' });
  const error = el('p', { class: 'error' });
  const internal = internalBox();
  const fill = function () {
    const s = options.series.filter(function (x) { return x.slug === series.value; })[0];
    number.value = s.next ? s.next.episode : (Math.max.apply(null, [0].concat(s.created)) + 1);
    slug.value = s.slug + '-' + String(number.value).padStart(2, '0');
    info.textContent = (s.next ? s.next.title + ' · ' : '') + (s.remainingUsd !== undefined ? t('remaining')(s.remainingUsd.toFixed(2)) : '');
    error.textContent = s.canonReady ? '' : t('canonNotReady');
  };
  series.onchange = fill;
  number.oninput = function () { slug.value = series.value + '-' + String(number.value).padStart(2, '0'); };
  fill();
  const form = el('form', { class: 'card form' }, [
    el('div', { class: 'form-row' }, [field(t('series'), series), field(t('episode'), number), field(t('slug'), slug), field(t('budget'), budget)]),
    internal.node, info, error, el('button', { class: 'primary', type: 'submit', text: t('create') })
  ]);
  form.onsubmit = pending(function () {
    return post('/api/new/episode', { series: series.value, episode: Number(number.value), slug: slug.value, budget: Number(budget.value), internal: internal.box.checked })
      .then(function (r) { go('#/new/episode/' + r.slug); })
      .catch(function (e) { error.textContent = e.message; });
  });
  node.appendChild(form);
}

function episodeSteps(slug) {
  return api('/api/new/project/' + encodeURIComponent(slug) + '/references').then(function (refs) {
    const node = main();
    node.appendChild(el('header', { class: 'project' }, [el('h2', { text: slug }), el('span', { class: 'chip', text: t('newEpisode') })]));
    node.appendChild(el('div', { style: 'height:12px' }));
    node.appendChild(commandBox(t('episodeNext'), '/new-episode ' + slug, projectLink(slug)));
    node.appendChild(el('div', { style: 'height:12px' }));
    node.appendChild(referencesStep(1, 'project', slug, refs.references, function () { episodeSteps(slug); }));
  }).catch(showError);
}

/** Route `#/new...`. */
export function showWizard(kind, slug) {
  setLang(null);
  return loadOptions().then(function () {
    if (kind === 'video') return slug ? videoSteps(slug) : videoForm();
    if (kind === 'series') return slug ? seriesSteps(slug) : seriesForm();
    if (kind === 'episode') return slug ? episodeSteps(slug) : episodeForm();
    return choose();
  }).catch(showError);
}

