// The list state of the board's library lists (Characters, Sets, Sounds; UX guideline G5): a search, tag chips, the
// unused switch and one origin, plus the sort column and its direction, all kept in the address hash
// (`#/characters?q=…&tag=a,b&unused=1&origin=…&sort=used&dir=desc`). Pure functions only; each view draws itself.
// The one-of filter is the origin for characters and sets; a sound has no origin, so its list names the same filter
// `licence` in the address (`options.facet`) and keeps the licence in `state.origin` and `item.origin`.

/** The query of a list's address: what follows `?`, or ''. */
export function queryOf(hash) {
  const raw = hash || '';
  return raw.indexOf('?') >= 0 ? raw.slice(raw.indexOf('?') + 1) : '';
}

/**
 * The list's state from its query. `options`: `sorts` (the sortable columns, the first is the default), `ascending`
 * (the columns that sort ascending by default; the others start descending), `tags` and `origins` (the values the
 * library has), `facet` (the address's name of the one-of filter, `origin` by default). Unknown values are ignored.
 */
export function parseLibraryListState(query, options) {
  const params = new URLSearchParams(query || '');
  const tags = options.tags || [], origins = options.origins || [];
  const tag = [];
  (params.get('tag') || '').split(',').forEach(function (value) { if (tags.indexOf(value) >= 0 && tag.indexOf(value) < 0) tag.push(value); });
  const sort = options.sorts.indexOf(params.get('sort')) >= 0 ? params.get('sort') : options.sorts[0];
  const dir = params.get('dir') === 'asc' || params.get('dir') === 'desc' ? params.get('dir') : defaultDir(sort, options);
  const origin = params.get(facetOf(options)) || '';
  return {
    q: params.get('q') || '',
    tag: tag,
    unused: params.get('unused') === '1',
    origin: origins.indexOf(origin) >= 0 ? origin : '',
    sort: sort,
    dir: dir
  };
}

function facetOf(options) { return options.facet || 'origin'; }

/** The default direction of a sort column. */
export function defaultDir(sort, options) { return (options.ascending || []).indexOf(sort) >= 0 ? 'asc' : 'desc'; }

/** The address of a list state under `route` (`#/characters`); defaults are left out. */
export function libraryListHash(route, state, options) {
  const parts = [];
  if (state.q) parts.push('q=' + encodeURIComponent(state.q));
  if (state.tag.length) parts.push('tag=' + state.tag.map(encodeURIComponent).join(','));
  if (state.unused) parts.push('unused=1');
  if (state.origin) parts.push(facetOf(options) + '=' + encodeURIComponent(state.origin));
  if (state.sort !== options.sorts[0]) parts.push('sort=' + state.sort);
  if (state.dir !== defaultDir(state.sort, options)) parts.push('dir=' + state.dir);
  return route + (parts.length ? '?' + parts.join('&') : '');
}

/** Whether a search or a filter is set (the sort is neither). */
export function anyLibraryFilter(state) { return Boolean(state.q || state.tag.length || state.unused || state.origin); }

/**
 * Whether an item passes the state: `item.search` (the texts the search looks in, case-insensitive substring),
 * `item.tags`, `item.used` (how many productions use it) and `item.origin`. Several tags combine with "or", the
 * filters with "and".
 */
export function matchesLibraryItem(item, state) {
  if (state.q) {
    const needle = state.q.toLowerCase();
    if (!item.search.some(function (text) { return String(text || '').toLowerCase().indexOf(needle) >= 0; })) return false;
  }
  if (state.tag.length && !(item.tags || []).some(function (tag) { return state.tag.indexOf(tag) >= 0; })) return false;
  if (state.unused && item.used > 0) return false;
  if (state.origin && item.origin !== state.origin) return false;
  return true;
}

/**
 * The items sorted by the state's column: `keys[column](item)` gives a string or a number; ties and the name column
 * go by `item.name`.
 */
export function sortLibraryItems(items, state, keys) {
  const sign = state.dir === 'asc' ? 1 : -1;
  const byName = function (a, b) { return String(a.name).localeCompare(String(b.name)); };
  const key = keys[state.sort];
  return items.slice().sort(function (a, b) {
    if (!key) return sign * byName(a, b);
    const x = key(a), y = key(b);
    const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return order ? sign * order : byName(a, b);
  });
}

/** Every tag of the items, sorted, each once. */
export function allTags(items) {
  const seen = [];
  items.forEach(function (item) { (item.tags || []).forEach(function (tag) { if (seen.indexOf(tag) < 0) seen.push(tag); }); });
  return seen.sort(function (a, b) { return a.localeCompare(b); });
}

/** `values` with `value` added, or without it when it is there. */
export function toggleValue(values, value) {
  return values.indexOf(value) >= 0 ? values.filter(function (v) { return v !== value; }) : values.concat([value]);
}

/**
 * Put a list's address into the current history entry, so Back from an item returns to it; replacing it sends no
 * hashchange, so the search field keeps its focus while the user types.
 */
export function writeListHash(hash) {
  if (typeof history !== 'undefined' && history.replaceState) history.replaceState(null, '', hash);
  else location.hash = hash;
}
