// What the wizards of library items share (character-wizard.js, set-wizard.js): the uploads of an entry's step.
import { addStrings, t, upload } from './lib.js';

addStrings({
  de: { lwUploading: 'lädt hoch …' },
  en: { lwUploading: 'uploading …' }
});

/**
 * Upload the files one after the other into a library entry; `show(listing)` draws the step after each file, so every
 * file appears as it lands. `uploadPath` is the library's upload route (`/api/upload/library/` or `/api/upload/sets/`);
 * each item is `{ file, query }`, `query` the route's parameters after `name`. `sent` holds the files that landed
 * already: they are left out, and each file joins it once its upload succeeds, so a retry sends only what failed or
 * was not sent yet. A refusal stops the chain and names its reason in `status` (class `sub <statusClass>`, `error`
 * while it shows a refusal); the inputs keep their files, so the button retries. After a full success `done()` clears
 * them.
 */
export function sendLibraryFiles(uploadPath, id, chosen, sent, status, statusClass, show, done) {
  const items = chosen.filter(function (item) { return !sent.has(item.file); });
  if (!items.length) return;
  let chain = Promise.resolve();
  status.className = 'sub ' + statusClass;
  items.forEach(function (item, index) {
    chain = chain.then(function () {
      const query = '?name=' + encodeURIComponent(item.file.name) + (item.query ? '&' + item.query : '');
      return upload(uploadPath + encodeURIComponent(id) + query, item.file, function (share) {
        status.textContent = t('lwUploading') + ' ' + (index + 1) + '/' + items.length + ' · ' + Math.round(share * 100) + '%';
      }).then(function (listing) {
        sent.add(item.file);
        show(listing);
      });
    });
  });
  return chain.then(function () { status.textContent = ''; done(); }).catch(function (e) { status.textContent = e.message; status.className = 'error ' + statusClass; });
}
