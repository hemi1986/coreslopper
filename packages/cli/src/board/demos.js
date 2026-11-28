// Demo productions on the board (feature demo-projects): `demo: true` in a project's or series' own file. One
// switch for the whole board, Show demos, kept in the browser (it is a preference, not list state, so it is not in
// the address); off by default. While the workspace has no other project or series, the demos are shown and the
// switch is not. The production view and the project list draw the switch and the group Demos; the library lists
// count a use in a demo only while the demos are shown.
import { addStrings, el, t } from './lib.js';

addStrings({
  de: { showDemos: 'Demos zeigen', groupDemos: 'Demos', demoChip: 'Demo', demoUse: '(Demo)' },
  en: { showDemos: 'Show demos', groupDemos: 'Demos', demoChip: 'Demo', demoUse: '(Demo)' }
});

export const SHOW_DEMOS_KEY = 'coreslopper.board.showDemos';

/** The stored switch; false when it was never set or the browser keeps no storage. */
export function storedShowDemos() {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(SHOW_DEMOS_KEY) === '1'; } catch (error) { return false; }
}

/** Keep the switch in the browser; a browser without storage forgets it at the next load. */
export function storeShowDemos(on) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(SHOW_DEMOS_KEY, on ? '1' : '0'); } catch (error) { /* no storage */ }
}

/** Whether every one of the productions (projects and series, unreadable ones too) is a demo; true for none. */
export function onlyDemos(productions) {
  return !productions.some(function (p) { return p.demo !== true; });
}

/** Whether the board shows the demos: always in a workspace with only demos, else as the switch says. */
export function demosShown(onlyDemoWork) {
  return Boolean(onlyDemoWork) || storedShowDemos();
}

/** The uses of a library entry that count for its Used in column and the unused filter. */
export function countedUses(usedIn, shown) {
  return shown ? usedIn : usedIn.filter(function (use) { return !use.demo; });
}

/** A use as an entry's page and the delete confirmation name it: the production's title, else its slug, and "(Demo)". */
export function useLabel(use, targets) {
  const target = (targets || []).filter(function (x) { return x.scope === use.scope && x.slug === use.slug; })[0];
  return (target ? target.title : use.slug) + (use.demo ? ' ' + t('demoUse') : '');
}

/** The switch Show demos; `redraw()` draws the view again after it changed. */
export function demoSwitch(redraw) {
  // The switch is not a field the user is editing: a refresh may redraw the view (app.js marks other input).
  const quiet = function (event) { if (event && event.stopPropagation) event.stopPropagation(); };
  const box = el('input', { type: 'checkbox', class: 'demo-switch', checked: storedShowDemos(), oninput: quiet, onchange: function (event) {
    quiet(event);
    storeShowDemos(Boolean(event.target.checked));
    redraw();
  } });
  box.checked = storedShowDemos();
  return el('label', { class: 'pl-filter pl-switch' }, [box, ' ' + t('showDemos')]);
}

/** The chip Demo on a demo's card or row. */
export function demoChip() { return el('span', { class: 'chip demo-chip', text: t('demoChip') }); }
