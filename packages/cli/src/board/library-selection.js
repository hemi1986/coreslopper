// The selection of a library list (Characters, Sets, Sounds; ST-063): a checkbox per row, one in the header for
// every row the filters show, and a bar above the table that deletes the selected entries one after the other with
// the entry's single delete. The selection is not part of the address; each draw keeps only the selected rows that
// are still shown. Nothing here writes: `remove` is the view's single delete route.
import { addStrings, el, pending, t } from './lib.js';

addStrings({
  de: {
    lsSelected: function (n) { return n + ' ausgewählt'; },
    lsDelete: 'Löschen', lsClear: 'Auswahl aufheben', lsAll: 'Alle angezeigten auswählen',
    lsRow: function (name) { return name + ' auswählen'; },
    lsRefused: 'Nicht gelöscht:',
    lsConfirm: function (n, uses, keep) {
      const head = (n === 1 ? '1 Eintrag' : n + ' Einträge') + ' aus der Bibliothek löschen?';
      const used = uses.length ? '\n\nVerwendet:\n' + uses.map(function (use) { return '• ' + use.name + ': ' + use.where.join(', '); }).join('\n') : '';
      return head + used + '\n\n' + keep;
    },
    lsKeepProjects: 'Die Produktionen behalten ihre Kopien.', lsKeepMemes: 'Memes behalten ihre Kopien.'
  },
  en: {
    lsSelected: function (n) { return n + ' selected'; },
    lsDelete: 'Delete', lsClear: 'Clear selection', lsAll: 'Select every row shown',
    lsRow: function (name) { return 'Select ' + name; },
    lsRefused: 'Not deleted:',
    lsConfirm: function (n, uses, keep) {
      const head = 'Delete ' + (n === 1 ? '1 entry' : n + ' entries') + ' from the library?';
      const used = uses.length ? '\n\nUsed:\n' + uses.map(function (use) { return '• ' + use.name + ': ' + use.where.join(', '); }).join('\n') : '';
      return head + used + '\n\n' + keep;
    },
    lsKeepProjects: 'The productions keep their copies.', lsKeepMemes: 'Memes keep their copies.'
  }
});

/** An unreadable entry (`item.error`) has nothing the single delete could read, so it has no checkbox. */
function selectable(item) { return !item.error; }

function quiet(event) { if (event && event.stopPropagation) event.stopPropagation(); }

/**
 * Delete `ids` one after the other with `remove(id)`; a refusal does not stop the others. Resolves to the deleted
 * ids and the refused ones with their reason.
 */
export function deleteEach(ids, remove) {
  const deleted = [], refused = [];
  return ids.reduce(function (chain, id) {
    return chain.then(function () {
      return Promise.resolve().then(function () { return remove(id); })
        .then(function () { deleted.push(id); }, function (error) { refused.push({ id: id, error: error && error.message ? error.message : String(error) }); });
    });
  }, Promise.resolve()).then(function () { return { deleted: deleted, refused: refused }; });
}

/**
 * A list's selection. `options`: `remove(id)` (the single delete, a promise), `uses(item)` (where the entry is used,
 * as the confirmation names it), `keep` ('projects' or 'memes': who keeps their copies), `reload()` (load the list
 * again and draw it, a promise) and `redraw()` (draw the results again).
 */
export function librarySelection(options) {
  const selection = { ids: [], refused: [] };
  let shown = [];

  /** Keep only the selected rows that `rows` still shows; call it before drawing the rows. */
  selection.keep = function (rows) {
    shown = rows.filter(selectable);
    const ids = shown.map(function (item) { return item.id; });
    selection.ids = selection.ids.filter(function (id) { return ids.indexOf(id) >= 0; });
    selection.refused = selection.refused.filter(function (r) { return selection.ids.indexOf(r.id) >= 0; });
  };

  function set(ids) {
    selection.ids = ids;
    selection.refused = selection.refused.filter(function (r) { return ids.indexOf(r.id) >= 0; });
    options.redraw();
  }

  /** The header cell: checked when every shown row is selected; a click selects them all, or none. */
  selection.head = function () {
    const all = shown.length > 0 && shown.every(function (item) { return selection.ids.indexOf(item.id) >= 0; });
    const box = el('input', { type: 'checkbox', class: 'ls-all', 'aria-label': t('lsAll'), checked: all, onclick: quiet, onchange: function () {
      const ids = shown.map(function (item) { return item.id; });
      set(all ? selection.ids.filter(function (id) { return ids.indexOf(id) < 0; }) : selection.ids.concat(ids.filter(function (id) { return selection.ids.indexOf(id) < 0; })));
    } });
    box.checked = all;
    box.indeterminate = !all && shown.some(function (item) { return selection.ids.indexOf(item.id) >= 0; });
    return el('th', { class: 'ls-check' }, [box]);
  };

  /** A row's cell; a click in it never opens the entry. */
  selection.cell = function (item) {
    if (!selectable(item)) return el('td', { class: 'ls-check', onclick: quiet });
    const on = selection.ids.indexOf(item.id) >= 0;
    const box = el('input', { type: 'checkbox', class: 'ls-row', 'data-id': item.id, 'aria-label': t('lsRow')(item.name), checked: on, onclick: quiet, onchange: function () {
      set(on ? selection.ids.filter(function (id) { return id !== item.id; }) : selection.ids.concat([item.id]));
    } });
    box.checked = on;
    return el('td', { class: 'ls-check', onclick: quiet }, [box]);
  };

  function confirmText() {
    const items = shown.filter(function (item) { return selection.ids.indexOf(item.id) >= 0; });
    const uses = items.map(function (item) { return { name: item.name, where: options.uses(item) }; }).filter(function (use) { return use.where.length; });
    return t('lsConfirm')(items.length, uses, options.keep === 'memes' ? t('lsKeepMemes') : t('lsKeepProjects'));
  }

  function remove() {
    if (!window.confirm(confirmText())) return;
    const ids = selection.ids.slice();
    return deleteEach(ids, options.remove).then(function (outcome) {
      // A refused entry stays selected with its reason; the deleted ones leave the list on the reload.
      const names = {};
      shown.forEach(function (item) { names[item.id] = item.name; });
      selection.ids = outcome.refused.map(function (r) { return r.id; });
      selection.refused = outcome.refused.map(function (r) { return { id: r.id, name: names[r.id] || r.id, error: r.error }; });
      return options.reload();
    });
  }

  /** The bar above the table, or null while nothing is selected. */
  selection.bar = function () {
    if (!selection.ids.length) return null;
    return el('div', { class: 'ls-bar', role: 'region', 'aria-label': t('lsSelected')(selection.ids.length) }, [
      el('span', { class: 'ls-count', text: t('lsSelected')(selection.ids.length) }),
      el('button', { class: 'small ls-delete', onclick: pending(remove) }, [t('lsDelete')]),
      el('button', { class: 'small ls-clear', onclick: function () { set([]); } }, [t('lsClear')]),
      selection.refused.length ? el('div', { class: 'ls-refused error' }, [el('span', { text: t('lsRefused') }), el('ul', {}, selection.refused.map(function (r) {
        return el('li', { 'data-id': r.id, text: r.name + ': ' + r.error });
      }))]) : null
    ]);
  };

  return selection;
}
