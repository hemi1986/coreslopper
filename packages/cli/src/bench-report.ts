import { fixturePath, rubricScore, type BenchCase, type BenchScore } from '@coreslopper/core';
import type { BenchResult, BenchRun } from './bench.js';

/** The user's own grades from the comparison page, keyed by result key. */
export type BenchRatings = Record<string, { stars?: number; note?: string }>;

export interface BenchReportInput {
  run: BenchRun;
  cases: BenchCase[];
  scores: Record<string, BenchScore>;
  ratings: BenchRatings;
  /** Path from the run directory to the bench root, for fixtures. */
  fixtureBase: string;
  fixtureExists: (benchRelativePath: string) => boolean;
}

export interface TargetSummary {
  target: string;
  planned: number;
  ok: number;
  refused: number;
  errors: number;
  skipped: number;
  scored: number;
  /** Mean rubric score over scored results, 0-1. */
  meanScore?: number;
  /** Mean over cases of each case's worst seed, 0-1. */
  worstSeedMean?: number;
  meanSeconds?: number;
  costUsd: number;
  peakVramGb?: number;
  deterministic?: { same: number; checked: number };
  meanStars?: number;
}

function escape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function mean(values: number[]): number | undefined {
  return values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(value: number | undefined): string {
  return value === undefined ? '–' : `${Math.round(value * 100)} %`;
}

export function summarizeTargets(input: Pick<BenchReportInput, 'run' | 'cases' | 'scores' | 'ratings'>): TargetSummary[] {
  const { run, cases, scores, ratings } = input;
  const caseById = new Map(cases.map((value) => [value.id, value]));
  return Object.keys(run.targets).map((target) => {
    const results = run.results.filter((result) => result.target === target);
    const scoreOf = (result: BenchResult): number | undefined => {
      const benchCase = caseById.get(result.case);
      const score = scores[result.key];
      if (!benchCase || !score) return undefined;
      if (result.status === 'refused') return benchCase.refusalOk ? undefined : 0;
      return rubricScore(benchCase.rubric, score);
    };
    const scored = results.map(scoreOf).filter((value): value is number => value !== undefined);
    const worst: number[] = [];
    for (const caseId of new Set(results.map((result) => result.case))) {
      const values = results
        .filter((result) => result.case === caseId)
        .map(scoreOf)
        .filter((value): value is number => value !== undefined);
      if (values.length > 0) worst.push(Math.min(...values));
    }
    const fresh = results.filter((result) => result.status === 'ok' && result.elapsedSeconds !== undefined);
    const vram = results.map((result) => result.vram?.peakGb).filter((v): v is number => v !== undefined);
    const checked = results.filter((result) => result.deterministic !== undefined);
    const stars = results.map((result) => ratings[result.key]?.stars).filter((v): v is number => typeof v === 'number');
    return {
      target,
      planned: results.filter((result) => result.status !== 'skipped').length,
      ok: results.filter((result) => result.status === 'ok').length,
      refused: results.filter((result) => result.status === 'refused').length,
      errors: results.filter((result) => result.status === 'error').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      scored: scored.length,
      meanScore: mean(scored),
      worstSeedMean: mean(worst),
      meanSeconds: mean(fresh.map((result) => result.elapsedSeconds!)),
      costUsd: results.reduce((sum, result) => sum + (result.cached ? 0 : result.costUsd ?? 0), 0),
      peakVramGb: vram.length > 0 ? Math.max(...vram) : undefined,
      ...(checked.length > 0
        ? { deterministic: { same: checked.filter((result) => result.deterministic).length, checked: checked.length } }
        : {}),
      meanStars: mean(stars),
    };
  });
}

function mediaTag(src: string, options: { audio?: boolean; className?: string } = {}): string {
  const safe = escape(src);
  const cls = options.className ? ` class="${options.className}"` : '';
  if (/\.(png|jpe?g|webp|gif)$/i.test(src)) {
    return `<a href="${safe}" target="_blank"><img${cls} src="${safe}" loading="lazy" alt=""></a>`;
  }
  if (/\.(mp4|webm|mov|mkv)$/i.test(src)) {
    return `<video${cls} src="${safe}" controls loop playsinline preload="metadata"${options.audio ? '' : ' muted'}></video>`;
  }
  if (/\.(wav|mp3|flac|ogg|m4a)$/i.test(src)) return `<audio src="${safe}" controls preload="none"></audio>`;
  return `<a href="${safe}">${escape(src)}</a>`;
}

function fixtureSrc(input: BenchReportInput, benchCase: BenchCase, name: string): string | undefined {
  const path = fixturePath(benchCase, name);
  if (!input.fixtureExists(path)) return undefined;
  return `${input.fixtureBase}/${path}`.replace(/^\/+/, '');
}

function scoreClass(value: number | undefined): string {
  if (value === undefined) return 'none';
  if (value >= 0.8) return 'good';
  if (value >= 0.5) return 'mid';
  return 'bad';
}

function resultCell(input: BenchReportInput, benchCase: BenchCase, result: BenchResult): string {
  const score = input.scores[result.key];
  const value = score ? rubricScore(benchCase.rubric, score) : undefined;
  const head = `<div class="cell-head"><span class="target">${escape(result.target)}</span><span class="seed">seed ${result.seed}</span></div>`;
  if (result.status !== 'ok') {
    const label = result.status === 'refused' ? (benchCase.refusalOk ? 'refused (accepted)' : 'refused') : result.status;
    return `<div class="cell status-${result.status}">${head}<div class="status">${escape(label)}</div>${
      result.error ? `<pre class="error">${escape(result.error.slice(0, 600))}</pre>` : ''
    }${ratingWidget(result.key)}</div>`;
  }
  const main = result.review ?? result.files[0];
  const meta: string[] = [];
  if (result.elapsedSeconds !== undefined) meta.push(`${result.elapsedSeconds.toFixed(1)} s`);
  if (result.cached) meta.push('cached');
  if (result.costUsd) meta.push(`$${result.costUsd.toFixed(3)}`);
  if (result.media?.width) meta.push(`${result.media.width}x${result.media.height}`);
  if (result.media?.durationSeconds) meta.push(`${result.media.durationSeconds.toFixed(2)} s clip`);
  if (result.media?.fps) meta.push(`${result.media.fps} fps`);
  if (result.vram) meta.push(`VRAM peak ${result.vram.peakGb} GB (${result.vram.beforeGb} at start)`);
  if (result.deterministic !== undefined) meta.push(result.deterministic ? 'deterministic' : 'NOT deterministic');
  if (result.transcript) meta.push(`WER ${Math.round(result.transcript.wer * 100)} %`);
  const criteria = score
    ? `<ul class="criteria">${benchCase.rubric
        .map((criterion) => {
          const points = score.criteria[criterion.id];
          return `<li class="p${points ?? 'x'}" title="${escape(criterion.check)}"><b>${points ?? '?'}</b> ${escape(criterion.id)}</li>`;
        })
        .join('')}</ul>${score.notes ? `<p class="notes">${escape(score.notes)}</p>` : ''}`
    : '<p class="notes muted">not scored yet</p>';
  return `<div class="cell">${head}
    ${main ? mediaTag(main, { audio: Boolean(result.review) }) : ''}
    ${result.strip ? `<a class="strip" href="${escape(result.strip)}" target="_blank"><img src="${escape(result.strip)}" loading="lazy" alt="frame strip"></a>` : ''}
    <div class="meta">${meta.map(escape).join(' · ')}</div>
    ${result.transcript ? `<p class="notes">“${escape(result.transcript.text)}”</p>` : ''}
    <div class="score ${scoreClass(value)}">${score ? `${escape(score.verdict)} · ${percent(value)}` : 'rubric –'}</div>
    ${criteria}
    ${ratingWidget(result.key)}
  </div>`;
}

function ratingWidget(key: string): string {
  const stars = [1, 2, 3, 4, 5]
    .map((value) => `<button type="button" data-star="${value}" aria-label="${value} of 5">${value}</button>`)
    .join('');
  return `<div class="rating" data-key="${escape(key)}"><div class="stars">${stars}</div><textarea rows="2" placeholder="your note"></textarea></div>`;
}

function caseSection(input: BenchReportInput, benchCase: BenchCase): string {
  const results = input.run.results
    .filter((result) => result.case === benchCase.id && result.status !== 'skipped')
    .sort((a, b) => a.target.localeCompare(b.target) || a.seedIndex - b.seedIndex);
  const golden = benchCase.golden ? fixtureSrc(input, benchCase, benchCase.golden) : undefined;
  const inputs = [...benchCase.inputs.references, ...(benchCase.inputs.audio ? [benchCase.inputs.audio] : [])]
    .map((name) => {
      const src = fixtureSrc(input, benchCase, name);
      return src ? `<figure>${mediaTag(src, { className: 'thumb' })}<figcaption>${escape(name)}</figcaption></figure>` : '';
    })
    .join('');
  const source = benchCase.source
    ? `${escape(benchCase.source.project)}${benchCase.source.shot ? ` ${escape(benchCase.source.shot)}` : ''}`
    : 'new case';
  const skipped = input.run.results.filter((result) => result.case === benchCase.id && result.status === 'skipped');
  return `<section class="case" id="${escape(benchCase.id)}">
  <header>
    <h2>${escape(benchCase.title)} <code>${escape(benchCase.id)}</code></h2>
    <p class="focus">${escape(benchCase.focus)}</p>
    <p class="muted">${escape(benchCase.operation)} · ${escape(benchCase.role)} · ${source}${
      skipped.length > 0 ? ` · not run on ${skipped.map((result) => escape(result.target)).filter((v, i, a) => a.indexOf(v) === i).join(', ')}` : ''
    }</p>
  </header>
  <details><summary>Rubric and prompt</summary>
    <ol class="rubric">${benchCase.rubric.map((criterion) => `<li><b>${escape(criterion.id)}</b>${criterion.weight !== 1 ? ` (x${criterion.weight})` : ''}: ${escape(criterion.check)}</li>`).join('')}</ol>
    <pre class="prompt">${escape(benchCase.prompt)}</pre>
  </details>
  <div class="row">
    <div class="cell reference"><div class="cell-head"><span class="target">reference</span></div>
      ${golden ? mediaTag(golden, { audio: false }) : '<p class="muted">no known good result</p>'}
      ${benchCase.goldenNote ? `<p class="notes">${escape(benchCase.goldenNote)}</p>` : ''}
      ${inputs ? `<div class="inputs">${inputs}</div>` : ''}
    </div>
    ${results.map((result) => resultCell(input, benchCase, result)).join('\n')}
  </div>
</section>`;
}

function summaryTable(input: BenchReportInput): string {
  const rows = summarizeTargets(input)
    .map((summary) => {
      const info = input.run.targets[summary.target];
      return `<tr>
      <th>${escape(summary.target)}<div class="muted">${escape(info?.description ?? info?.provider ?? '')}${info?.server ? `<br>${escape(info.server)}` : ''}</div></th>
      <td>${summary.ok}/${summary.planned}${summary.skipped ? ` <span class="muted">(+${summary.skipped} n/a)</span>` : ''}</td>
      <td>${summary.refused}</td>
      <td>${summary.errors}</td>
      <td class="score ${scoreClass(summary.meanScore)}">${percent(summary.meanScore)}<div class="muted">${summary.scored} scored</div></td>
      <td>${percent(summary.worstSeedMean)}</td>
      <td>${summary.meanSeconds === undefined ? '–' : `${summary.meanSeconds.toFixed(1)} s`}</td>
      <td>$${summary.costUsd.toFixed(2)}</td>
      <td>${summary.peakVramGb === undefined ? '–' : `${summary.peakVramGb} GB`}</td>
      <td>${summary.deterministic ? `${summary.deterministic.same}/${summary.deterministic.checked}` : '–'}</td>
      <td class="stars-mean" data-target="${escape(summary.target)}">${summary.meanStars === undefined ? '–' : summary.meanStars.toFixed(1)}</td>
    </tr>`;
    })
    .join('');
  return `<table class="summary"><thead><tr>
    <th>Target</th><th>OK</th><th>Refused</th><th>Errors</th><th>Rubric</th><th>Worst seed</th><th>Time</th><th>Cost</th><th>VRAM</th><th>Same bytes</th><th>Your grade</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

const STYLE = `
:root{--bg:#f6f6f4;--card:#fff;--fg:#1d1d1b;--muted:#6b6b66;--line:#deded8;--good:#1f7a3f;--mid:#9a6a00;--bad:#b3261e;--accent:#2d5bd7}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141413;--card:#1e1e1c;--fg:#ececea;--muted:#9a9a94;--line:#33332f;--good:#5cc47f;--mid:#e0b04a;--bad:#ff7b72;--accent:#8ab4ff}}
:root[data-theme="dark"]{--bg:#141413;--card:#1e1e1c;--fg:#ececea;--muted:#9a9a94;--line:#33332f;--good:#5cc47f;--mid:#e0b04a;--bad:#ff7b72;--accent:#8ab4ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1800px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:0}code{font-size:12px;color:var(--muted)}
.muted{color:var(--muted);font-size:12px}
.toolbar{position:sticky;top:0;z-index:2;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.toolbar button,.toolbar label{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:6px;padding:5px 10px;cursor:pointer;font:inherit}
nav.toc{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}nav.toc a{color:var(--accent);text-decoration:none;font-size:12px}
table.summary{border-collapse:collapse;width:100%;background:var(--card);margin:16px 0;font-variant-numeric:tabular-nums}
.summary th,.summary td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
.case{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:18px 0}
.focus{margin:4px 0}.rubric{margin:6px 0 6px 18px;padding:0}.prompt{white-space:pre-wrap;font-size:12px;color:var(--muted)}
.row{display:flex;gap:12px;overflow-x:auto;padding-top:10px}
.cell{flex:0 0 360px;border:1px solid var(--line);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px}
.cell.reference{flex-basis:300px;background:color-mix(in srgb,var(--accent) 6%,var(--card))}
.cell img,.cell video{width:100%;border-radius:4px;background:#000;display:block}
.cell .strip img{background:none}.cell audio{width:100%}
.cell-head{display:flex;justify-content:space-between;font-weight:600}.seed{color:var(--muted);font-weight:400;font-size:12px}
.inputs{display:flex;gap:6px;flex-wrap:wrap}.inputs figure{margin:0;width:90px}.inputs .thumb{width:90px}.inputs figcaption{font-size:11px;color:var(--muted)}
.meta{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.score{font-weight:600}.score.good{color:var(--good)}.score.mid{color:var(--mid)}.score.bad{color:var(--bad)}.score.none{color:var(--muted)}
.criteria{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px}.criteria li{font-size:11px;border-radius:4px;padding:1px 5px;border:1px solid var(--line)}
.criteria .p2{color:var(--good)}.criteria .p1{color:var(--mid)}.criteria .p0{color:var(--bad)}
.notes{font-size:12px;margin:0}.status{font-weight:600;text-transform:uppercase}.status-error .status,.status-refused .status{color:var(--bad)}
.error{white-space:pre-wrap;font-size:11px;color:var(--muted);max-height:160px;overflow:auto;margin:0}
.rating{margin-top:auto;border-top:1px dashed var(--line);padding-top:6px}.stars{display:flex;gap:4px;margin-bottom:4px}
.stars button{flex:1;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:4px;cursor:pointer;padding:3px 0;font:inherit}
.stars button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.rating textarea{width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:4px;font:inherit;font-size:12px;resize:vertical}
@media (max-width:640px){.cell{flex-basis:85vw}}
`;

const SCRIPT = `
(function(){
  var runId = document.body.dataset.run;
  var storeKey = 'bench-ratings:' + runId;
  var initial = JSON.parse(document.getElementById('ratings-data').textContent || '{}');
  var ratings = initial;
  try { var saved = JSON.parse(localStorage.getItem(storeKey) || 'null'); if (saved) ratings = Object.assign({}, initial, saved); } catch (e) {}
  function save(){ try { localStorage.setItem(storeKey, JSON.stringify(ratings)); } catch (e) {} updateMeans(); }
  function updateMeans(){
    document.querySelectorAll('.stars-mean').forEach(function(cell){
      var target = cell.dataset.target, values = [];
      Object.keys(ratings).forEach(function(key){ var parts = key.split('/'); if (parts[1] === target && ratings[key].stars) values.push(ratings[key].stars); });
      cell.textContent = values.length ? (values.reduce(function(a,b){return a+b;},0)/values.length).toFixed(1) + ' (' + values.length + ')' : '–';
    });
  }
  document.querySelectorAll('.rating').forEach(function(box){
    var key = box.dataset.key, entry = ratings[key] || {};
    var buttons = box.querySelectorAll('button[data-star]'), note = box.querySelector('textarea');
    function paint(){ buttons.forEach(function(b){ b.classList.toggle('on', Number(b.dataset.star) <= (entry.stars || 0)); }); }
    note.value = entry.note || ''; paint();
    buttons.forEach(function(b){ b.addEventListener('click', function(){
      var value = Number(b.dataset.star); entry.stars = entry.stars === value ? undefined : value; ratings[key] = entry; paint(); save(); }); });
    note.addEventListener('input', function(){ entry.note = note.value; ratings[key] = entry; save(); });
  });
  document.getElementById('export').addEventListener('click', function(){
    var clean = {}; Object.keys(ratings).forEach(function(k){ var r = ratings[k]; if (r && (r.stars || r.note)) clean[k] = r; });
    var blob = new Blob([JSON.stringify(clean, null, 2) + '\\n'], {type: 'application/json'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ratings.json'; a.click();
  });
  document.getElementById('theme').addEventListener('click', function(){
    var root = document.documentElement, dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
  });
  document.getElementById('pause').addEventListener('click', function(){ document.querySelectorAll('video').forEach(function(v){ v.pause(); }); });
  document.getElementById('play').addEventListener('click', function(){ document.querySelectorAll('.case video').forEach(function(v){ v.currentTime = 0; v.play().catch(function(){}); }); });
  updateMeans();
})();
`;

export function renderBenchReport(input: BenchReportInput): string {
  const { run } = input;
  const cases = run.cases
    .map((id) => input.cases.find((value) => value.id === id))
    .filter((value): value is BenchCase => value !== undefined);
  const toc = cases.map((value) => `<a href="#${escape(value.id)}">${escape(value.id)}</a>`).join('');
  // A literal </script> in a note would end the data block.
  const ratingsJson = JSON.stringify(input.ratings).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Model bench ${escape(run.id)}</title>
<style>${STYLE}</style>
</head>
<body data-run="${escape(run.id)}">
<main>
  <h1>Model bench <code>${escape(run.id)}</code></h1>
  <p class="muted">${escape(run.createdAt.slice(0, 16).replace('T', ' '))}${run.set ? ` · set ${escape(run.set)}` : ''} · ${cases.length} case(s) · ${Object.keys(run.targets).length} target(s) · ${run.seeds} seed(s) per case</p>
  <div class="toolbar">
    <button type="button" id="export">Export ratings.json</button>
    <button type="button" id="play">Play all from start</button>
    <button type="button" id="pause">Pause all</button>
    <button type="button" id="theme">Light/dark</button>
    <span class="muted">Your grades are saved in this browser. Export them into the run folder as ratings.json so the agents can read them.</span>
  </div>
  ${summaryTable(input)}
  <p class="muted">Rubric: the art director's 0-2 per criterion, weighted. Worst seed: mean over cases of each case's weakest seed. Time: fresh generations only. VRAM: highest device memory in use while the job ran, sampled every 1.5 s; models already loaded by earlier jobs count, so compare runs that start from the same state.</p>
  <nav class="toc">${toc}</nav>
  ${cases.map((value) => caseSection(input, value)).join('\n')}
</main>
<script type="application/json" id="ratings-data">${ratingsJson}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
