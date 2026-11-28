// The board's shell: routes, the navigation (nav.js), and the user's refresh.
//   #/               production overview      #/calendar               release calendar
//   #/projects       the project list
//   #/p/<slug>       a project's production   #/p/<slug>/release[/<platform>[/<event>]]
//   #/p/<slug>/review[/<render>]             the review player
//   #/p/<slug>/contact-sheet                 the contact sheet
//   #/p/<slug>/doc/<path>                    a project document (brief, treatment, …)
//   #/s/<slug>       a series                #/new[/video|series|episode|meme[/<slug>]]  the wizard
//   #/new/character[/<id>]                   the wizard for a library character
//   #/new/set[/<id>]                         the wizard for a library set
//   #/new/sound[/<id>]                       the wizard for a library sound
//   #/characters[?…]  the character list     #/characters/<id>  one library character
//   #/sets[?…]        the set list           #/sets/<id>        one library set
//   #/sounds[?…]      the sound list         #/sounds/<id>      one library sound
//   #/guide[/<doc>]                          the board guide, or another page of docs/
import { api, decodedHash, go, loading } from './lib.js';
import { renderNav, viewBusy } from './nav.js';
import { PROJECTS_ROUTE, showProjects } from './projects.js';
import { showDocument, showProduction } from './production.js';
import { onReleaseChange, showCalendar, showRelease } from './release.js';
import { showReview } from './review.js';
import { showContactSheet } from './contact-sheet.js';
import { showWizard } from './wizard.js';
import { showCharacterWizard } from './character-wizard.js';
import { showSetWizard } from './set-wizard.js';
import { showSoundWizard } from './sound-wizard.js';
import { CHARACTERS_ROUTE, showCharacters } from './characters.js';
import { SETS_ROUTE, showSets } from './sets.js';
import { SOUNDS_ROUTE, showSounds } from './sounds.js';
import { showGuide } from './guide.js';

let active = 'overview';
let kept = false;

// The navigation's entries are fixed (ADR 0058), so reloading it redraws the bar; the views load their own data.
function loadNav() {
  renderNav(document.getElementById('nav'), active, kept, refresh);
  return Promise.resolve();
}

function route() {
  kept = false;
  const hash = decodedHash(location.hash || '#/');
  let match, view;
  if ((match = /^#\/new\/character(?:\/([a-z0-9][a-z0-9_-]*))?\/?$/.exec(hash))) { active = 'new'; view = showCharacterWizard(match[1]); }
  else if ((match = /^#\/new\/set(?:\/([a-z0-9][a-z0-9_-]*))?\/?$/.exec(hash))) { active = 'new'; view = showSetWizard(match[1]); }
  else if ((match = /^#\/new\/sound(?:\/([a-z0-9][a-z0-9_-]*))?\/?$/.exec(hash))) { active = 'new'; view = showSoundWizard(match[1]); }
  else if ((match = /^#\/new(?:\/(video|series|episode|meme)(?:\/([a-z0-9-]+))?)?\/?$/.exec(hash))) { active = 'new'; view = showWizard(match[1], match[2]); }
  else if (PROJECTS_ROUTE.test(hash)) { active = 'projects'; view = showProjects(); }
  else if (hash === '#/calendar') { active = 'calendar'; view = showCalendar(); }
  else if ((match = /^#\/guide(?:\/([a-z][a-z0-9-]*(?:\.de)?))?\/?$/.exec(hash))) { active = 'guide'; view = showGuide(match[1]); }
  else if (CHARACTERS_ROUTE.test(hash)) { active = 'characters'; view = showCharacters(); }
  else if ((match = /^#\/characters\/([a-z0-9][a-z0-9_-]*)\/?$/.exec(hash))) { active = 'characters'; view = showCharacters(match[1]); }
  else if (SETS_ROUTE.test(hash)) { active = 'sets'; view = showSets(); }
  else if ((match = /^#\/sets\/([a-z0-9][a-z0-9_-]*)\/?$/.exec(hash))) { active = 'sets'; view = showSets(match[1]); }
  else if (SOUNDS_ROUTE.test(hash)) { active = 'sounds'; view = showSounds(); }
  else if ((match = /^#\/sounds\/([a-z0-9][a-z0-9_-]*)\/?$/.exec(hash))) { active = 'sounds'; view = showSounds(match[1]); }
  else if ((match = /^#\/p\/([a-z0-9-]+)\/release(?:\/([a-z]+))?(?:\/(.+))?$/.exec(hash))) { active = 'release:' + match[1]; view = showRelease(match[1], match[2], match[3]); }
  else if ((match = /^#\/p\/([a-z0-9-]+)\/doc\/(.+)$/.exec(hash))) { active = 'project:' + match[1]; view = showDocument(match[1], match[2]); }
  else if ((match = /^#\/p\/([a-z0-9-]+)\/contact-sheet\/?$/.exec(hash))) { active = 'project:' + match[1]; view = showContactSheet(match[1]); }
  else if ((match = /^#\/p\/([a-z0-9-]+)\/review(?:\/(.+))?$/.exec(hash))) { active = 'review:' + match[1]; view = showReview(match[1], match[2]); }
  else if ((match = /^#\/p\/([a-z0-9-]+)\/([a-z]+)$/.exec(hash))) { go('#/p/' + match[1] + '/release/' + match[2]); return; } // the release board's old links
  else if ((match = /^#\/p\/([a-z0-9-]+)\/?$/.exec(hash))) { active = 'project:' + match[1]; view = showProduction(active); }
  else if ((match = /^#\/s\/([a-z0-9-]+)\/?$/.exec(hash))) { active = 'series:' + match[1]; view = showProduction(active); }
  else { active = 'overview'; view = showProduction('overview'); }
  loading(view);
  loadNav();
}

onReleaseChange(loadNav);
window.addEventListener('hashchange', route);
api('/api/channel').then(function (channel) {
  if (channel.motto) { document.getElementById('motto').textContent = channel.motto; document.body.classList.add('has-motto'); }
}).catch(function () {});

// The pipeline runs elsewhere (Claude Code, the queue, renders), and the page does not poll (ADR 0049): the user
// refreshes. A refresh reloads the navigation and the current view, but keeps a view with a playing video or audio or
// an edited field, so it never restarts the media or discards what the user typed.
const main = document.getElementById('main');
main.addEventListener('input', function (event) { if (event.target && event.target.setAttribute) event.target.setAttribute('data-edited', ''); });

function refresh() {
  if (viewBusy(main)) { kept = true; loadNav(); return; }
  loading(loadNav().then(route));
}

loading(loadNav().then(route));
