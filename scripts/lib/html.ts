import { Summary, isFailing } from './thresholds';

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(2)}%`);
const px = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(2)}px`);

export function buildHtmlReport(summary: Summary, baseline: Record<string, number> | null): string {
  const rows = [...summary.icons].sort((a, b) => (b.shapeScore ?? 1) - (a.shapeScore ?? 1));

  const cards = rows
    .map(icon => {
      const failing = isFailing(icon, summary.thresholds);

      const base = baseline?.[icon.id];
      const delta =
        base === undefined || icon.shapeScore === null
          ? ''
          : `<span class="delta ${icon.shapeScore > base + summary.thresholds.regressionSlack ? 'worse' : icon.shapeScore < base - 1e-9 ? 'better' : ''}">${
              icon.shapeScore > base ? '+' : ''
            }${((icon.shapeScore - base) * 100).toFixed(2)}pp vs baseline</span>`;

      return `
    <div class="card ${failing ? 'fail' : 'pass'}" data-id="${icon.id}" data-title="${icon.title.toLowerCase()}" data-state="${failing ? 'fail' : 'pass'}">
      <div class="head">
        <span class="name">${icon.title}</span>
        <span class="badge ${failing ? 'b-fail' : 'b-pass'}">${pct(icon.shapeScore)}</span>
      </div>
      <img loading="lazy" src="comparisons/${icon.id}.png" alt="${icon.title}" />
      <div class="meta">
        <span>placement ${px(icon.placementErrorPx)}</span>
        <span>${icon.elementCount} elem</span>
        ${delta}
      </div>
      ${icon.featureWarnings ? `<div class="warn">${icon.featureWarnings}</div>` : ''}
      ${icon.auditIssues.length ? `<ul class="issues">${icon.auditIssues.map(i => `<li>${i}</li>`).join('')}</ul>` : ''}
      ${icon.error ? `<div class="issues"><li>${icon.error}</li></div>` : ''}
    </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Excalidraw GCP - Conversion Fidelity</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f1f3f4;color:#202124;margin:0;padding:24px}
  header{background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px 28px;margin-bottom:20px}
  h1{margin:0 0 12px;font-size:22px}
  .stats{display:flex;gap:28px;flex-wrap:wrap;font-size:14px;color:#5f6368}
  .stats b{color:#202124;font-variant-numeric:tabular-nums}
  .controls{margin-top:16px;display:flex;gap:12px;align-items:center}
  input,select{padding:8px 12px;border:1px solid #e0e0e0;border-radius:6px;font-size:14px}
  input{width:260px}
  .legend{font-size:12px;color:#5f6368;margin-top:10px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px}
  .card{background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:12px}
  .card.fail{border-color:#d93025;box-shadow:0 0 0 1px rgba(217,48,37,.25)}
  .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .name{font-weight:600;font-size:14px}
  .badge{font-size:12px;font-weight:700;padding:3px 8px;border-radius:12px;font-variant-numeric:tabular-nums}
  .b-pass{background:#e6f4ea;color:#137333}
  .b-fail{background:#fce8e6;color:#c5221f}
  .card img{width:100%;height:auto;display:block;border-radius:6px;background:#fff}
  .meta{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#5f6368;margin-top:8px;font-variant-numeric:tabular-nums}
  .delta.worse{color:#c5221f;font-weight:700}
  .delta.better{color:#137333;font-weight:700}
  .issues{margin:8px 0 0;padding-left:18px;font-size:12px;color:#c5221f}
  .warn{margin-top:8px;font-size:12px;color:#b06000;background:#feefc3;border-radius:4px;padding:4px 8px}
</style></head><body>
<header>
  <h1>Excalidraw GCP - Conversion Fidelity</h1>
  <div class="stats">
    <span>icons <b>${summary.totalProcessed}</b></span>
    <span>failing <b style="color:#c5221f">${summary.failingIcons}</b></span>
    <span>mean shape error <b>${pct(summary.meanShapeScore)}</b></span>
    <span>worst shape error <b>${pct(summary.worstShapeScore)}</b></span>
    <span>mean placement <b>${px(summary.meanPlacementErrorPx)}</b></span>
    <span>worst placement <b>${px(summary.worstPlacementErrorPx)}</b></span>
    <span>audit issues <b>${summary.auditIssueCount}</b></span>
  </div>
  <div class="controls">
    <input id="q" placeholder="Search icons..." oninput="f()" />
    <select id="s" onchange="f()">
      <option value="all">All</option>
      <option value="fail">Failing only</option>
      <option value="pass">Passing only</option>
    </select>
  </div>
  <div class="legend">Each strip: <b>source SVG</b> &middot; <b>Excalidraw render</b> &middot; <b>pixel diff</b>. Both sides framed on their own ink box, so the strip shows shape error only; placement error is reported separately. Sorted worst first.</div>
</header>
<div class="grid">${cards}</div>
<script>
function f(){
  var q=document.getElementById('q').value.toLowerCase(),s=document.getElementById('s').value;
  document.querySelectorAll('.card').forEach(function(c){
    var okQ=c.dataset.title.indexOf(q)>-1||c.dataset.id.toLowerCase().indexOf(q)>-1;
    var okS=s==='all'||c.dataset.state===s;
    c.style.display=okQ&&okS?'':'none';
  });
}
</script>
</body></html>`;
}
