// Shared helpers of the board page: DOM building, the JSON API, languages, dates.

const strings = { de: {}, en: {} };
let lang = (navigator.language || 'en').toLowerCase().indexOf('de') === 0 ? 'de' : 'en';
const browserLang = lang;

/** Register a view's strings: { de: {...}, en: {...} }. */
export function addStrings(table) {
  Object.keys(table).forEach(function (code) { Object.assign(strings[code], table[code]); });
}
export function t(key) {
  const value = (strings[lang] || strings.en)[key];
  return value === undefined ? strings.en[key] : value;
}
export function getLang() { return lang; }
/** The release view speaks the project's language; every other view the browser's. */
export function setLang(code) { lang = code && code.toLowerCase().indexOf('de') === 0 ? 'de' : code ? 'en' : browserLang; document.documentElement.lang = lang; }

export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (key) {
    if (key === 'class') node.className = attrs[key];
    else if (key === 'text') node.textContent = attrs[key];
    else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), attrs[key]);
    else if (attrs[key] !== undefined && attrs[key] !== null && attrs[key] !== false) node.setAttribute(key, attrs[key] === true ? '' : attrs[key]);
  });
  (children || []).forEach(function (child) { if (child !== null && child !== undefined && child !== false) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
  return node;
}

export function api(path, options) {
  return fetch(path, options).then(function (res) { return res.json().then(function (body) { if (!res.ok) throw new Error(body.error || res.statusText); return body; }); });
}
export function post(path, payload) {
  return api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}) });
}

/** A calendar time as written ("Fr 11.12.2026 · 18:00"), without converting its zone. */
export function when(at) {
  if (!at) return '';
  const day = at.slice(0, 10), parts = day.split('-');
  const weekday = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));
  const date = lang === 'de' ? parts[2] + '.' + parts[1] + '.' + parts[0] : day;
  return weekday + ' ' + date + ' · ' + at.slice(11, 16);
}
/** An instant in the browser's zone. */
export function local(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat(lang, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
/** "5 min", "3 h", "2 d" since an instant. */
export function ago(iso, now) {
  const minutes = Math.max(0, Math.round(((now || Date.now()) - Date.parse(iso)) / 60000));
  if (minutes < 60) return minutes + ' min';
  if (minutes < 48 * 60) return Math.round(minutes / 60) + ' h';
  return Math.round(minutes / 1440) + ' d';
}
export function usd(value) { return '$' + (value || 0).toFixed(2); }
export function bytes(value) {
  if (value > 1e9) return (value / 1e9).toFixed(1) + ' GB';
  if (value > 1e6) return (value / 1e6).toFixed(1) + ' MB';
  return Math.round(value / 1e3) + ' kB';
}
function encodePath(path) { return path.split('/').map(encodeURIComponent).join('/'); }
/** A file of a release folder. */
export function media(slug, path) { return '/media/' + encodeURIComponent(slug) + '/' + encodePath(path); }
/** A file of a project, relative to the project. */
export function projectFile(slug, path) { return '/files/' + encodeURIComponent(slug) + '/' + encodePath(path); }

export function copyButton(value, labels) {
  const button = el('button', { class: 'copy', text: labels.copy });
  button.onclick = function (event) {
    event.stopPropagation();
    navigator.clipboard.writeText(value).then(function () {
      button.textContent = labels.copied; button.classList.add('copied');
      setTimeout(function () { button.textContent = labels.copy; button.classList.remove('copied'); }, 1400);
    });
  };
  return button;
}

/** Send one file as the raw request body, with progress. */
export function upload(url, file, onProgress) {
  return new Promise(function (resolve, reject) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = function () {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch (e) { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body); else reject(new Error(body.error || xhr.statusText));
    };
    xhr.onerror = function () { reject(new Error('upload failed')); };
    xhr.send(file);
  });
}

export function go(hash) { if (location.hash !== hash) location.hash = hash; }

export function showError(error) {
  const main = document.getElementById('main');
  main.appendChild(el('p', { class: 'error', text: t('failed') + ': ' + error.message }));
}

addStrings({
  de: { failed: 'Fehler', copy: 'Kopieren', copied: 'Kopiert' },
  en: { failed: 'Error', copy: 'Copy', copied: 'Copied' },
});

/** The tabs of a project page: production, review, and release once the project has a release package or calendar. */
export function viewTabs(slug, active, hasRelease) {
  const nav = el('nav', { class: 'tabs' });
  const tab = function (id, label, hash) {
    nav.appendChild(el('button', { class: 'tab' + (active === id ? ' active' : ''), onclick: function () { go(hash); } }, [label]));
  };
  tab('production', t('tabProduction'), '#/p/' + slug);
  tab('review', t('tabReview'), '#/p/' + slug + '/review');
  if (hasRelease) tab('release', t('tabRelease'), '#/p/' + slug + '/release');
  return nav;
}

addStrings({
  de: { tabProduction: 'Produktion', tabReview: 'Review', tabRelease: 'Release' },
  en: { tabProduction: 'Production', tabReview: 'Review', tabRelease: 'Release' },
});
