/* Malé SVG grafy pro záložku Progres.
   Pravidla, kterých se drží všechny: jedna barva na sérii, tenké značky,
   vlasová mřížka, hodnoty jen na kraji řady, a ke každému grafu jde přiložit
   tabulka. Popisky nikdy nenesou barvu dat. */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const W = 320;

/** Hezké dělení osy: 0, 25, 50… podle rozsahu. */
function niceStep(range, target = 3) {
  const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
}
/** Kolik místa vlevo si vyžádají popisky osy, ať se neořežou. */
const axisPad = (labels) => Math.max(28, 10 + Math.max(...labels.map((t) => t.length)) * 5.8);
const fmtNum = (v) => (Math.abs(v) >= 1000 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("cs-CZ", { maximumFractionDigits: 1 });

/**
 * Spojnicový graf jedné řady. Body jsou {t, v, tip}.
 * Popisek nese jen poslední bod, zbytek unese osa a dotyk.
 */
export function lineChart(points, { unit = "", height = 128, xLabel = (p) => "", endLabel = true } = {}) {
  if (points.length < 2) return "";
  const H = height, padR = 14, padT = 12, axis = 22, padB = axis + 12;
  const vs = points.flatMap((p) => (typeof p.raw === "number" ? [p.v, p.raw] : [p.v]));
  let mn = Math.min(...vs), mx = Math.max(...vs);
  const step = niceStep((mx - mn) || Math.max(1, mx * 0.1));
  mn = Math.floor(mn / step) * step - (mx === mn ? step : 0);
  mx = Math.ceil(mx / step) * step + (mx === mn ? step : 0);
  const ticks = []; for (let g = mn; g <= mx + 1e-9; g += step) ticks.push(fmtNum(g));
  const padL = axisPad(ticks);
  const x = (i) => padL + i * (W - padL - padR) / (points.length - 1);
  const y = (v) => H - padB - ((v - mn) / (mx - mn || 1)) * (H - padT - padB);
  const grid = [];
  for (let g = mn; g <= mx + 1e-9; g += step) {
    grid.push(`<line class="ch-grid" x1="${padL}" y1="${y(g).toFixed(1)}" x2="${W - padR}" y2="${y(g).toFixed(1)}"/>`
      + `<text class="ch-txt" x="${padL - 6}" y="${(y(g) + 3.5).toFixed(1)}" text-anchor="end">${fmtNum(g)}</text>`);
  }
  const last = points[points.length - 1];
  const hit = points.map((p, i) => {
    const w = (W - padL - padR) / points.length;
    return `<rect class="ch-hit" x="${(x(i) - w / 2).toFixed(1)}" y="${padT}" width="${w.toFixed(1)}" height="${H - padT - axis}" data-ty="${y(p.v).toFixed(1)}" data-tip="${esc(p.tip || fmtNum(p.v) + " " + unit)}"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="vývoj v čase">
    ${grid.join("")}
    ${points.map((p, i) => (typeof p.raw === "number" ? `<circle class="ch-raw" cx="${x(i).toFixed(1)}" cy="${y(p.raw).toFixed(1)}" r="2.5"/>` : "")).join("")}
    <polyline class="ch-line" points="${points.map((p, i) => x(i).toFixed(1) + "," + y(p.v).toFixed(1)).join(" ")}"/>
    ${points.map((p, i) => (i === points.length - 1 || points.length <= 14
      ? `<circle class="ch-dot" cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${i === points.length - 1 ? 4.5 : 3}"/>` : "")).join("")}
    ${endLabel ? `<text class="ch-val" x="${(W - padR - 14).toFixed(1)}" y="${(y(last.v) < padT + 22 ? y(last.v) + 18 : y(last.v) - 12).toFixed(1)}" text-anchor="end">${fmtNum(last.v)}${unit ? " " + unit : ""}</text>` : ""}
    <text class="ch-txt" x="${padL}" y="${H - 6}">${esc(xLabel(points[0]))}</text>
    <text class="ch-txt" x="${W - padR}" y="${H - 6}" text-anchor="end">${esc(xLabel(last))}</text>
    ${hit}</svg>`;
}

/**
 * Sloupcový graf jedné řady. Sloupce {label, v, mark, tip}.
 * mark=true přidá pod osu značku (lehký týden), aby se to nemuselo řešit barvou.
 */
export function columnChart(bars, { unit = "", height = 132, everyLabel = 2 } = {}) {
  if (!bars.length) return "";
  const H = height, padR = 10, padT = 12, axis = 26, padB = axis + 10;
  const mx0 = Math.max(...bars.map((b) => b.v), 1);
  const step = niceStep(mx0), mx = Math.ceil(mx0 / step) * step;
  const ticks = []; for (let g = 0; g <= mx + 1e-9; g += step) ticks.push(fmtNum(g));
  const padL = axisPad(ticks);
  const band = (W - padL - padR) / bars.length;
  const bw = Math.min(24, band - 2); // 2px mezera v barvě plochy
  const y = (v) => H - padB - (v / mx) * (H - padT - padB);
  const grid = [];
  for (let g = 0; g <= mx + 1e-9; g += step) {
    grid.push(`<line class="ch-grid" x1="${padL}" y1="${y(g).toFixed(1)}" x2="${W - padR}" y2="${y(g).toFixed(1)}"/>`
      + `<text class="ch-txt" x="${padL - 6}" y="${(y(g) + 3.5).toFixed(1)}" text-anchor="end">${fmtNum(g)}</text>`);
  }
  const body = bars.map((b, i) => {
    const cx = padL + band * i + band / 2, h = Math.max(b.v > 0 ? 2 : 0, H - padB - y(b.v));
    const r = Math.min(4, h / 2);
    const bar = b.v > 0 ? `<path class="ch-bar" d="M${(cx - bw / 2).toFixed(1)} ${(H - padB).toFixed(1)} v${(-(h - r)).toFixed(1)} a${r} ${r} 0 0 1 ${r} ${-r} h${(bw - 2 * r).toFixed(1)} a${r} ${r} 0 0 1 ${r} ${r} v${(h - r).toFixed(1)} z"/>` : "";
    const tick = b.mark ? `<rect class="ch-mark" x="${(cx - 3).toFixed(1)}" y="${(H - padB + 4).toFixed(1)}" width="6" height="3" rx="1"/>` : "";
    const lab = (bars.length - 1 - i) % everyLabel === 0
      ? `<text class="ch-txt" x="${cx.toFixed(1)}" y="${(H - padB + 17).toFixed(1)}" text-anchor="middle">${esc(b.label)}</text>` : "";
    return bar + tick + lab
      + `<rect class="ch-hit" x="${(padL + band * i).toFixed(1)}" y="${padT}" width="${band.toFixed(1)}" height="${(H - padT - axis).toFixed(1)}" data-ty="${y(b.v).toFixed(1)}" data-tip="${esc(b.tip || b.label + ": " + fmtNum(b.v) + " " + unit)}"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="hodnoty po týdnech">${grid.join("")}${body}</svg>`;
}

/**
 * Vodorovné pruhy s hodnotou na špičce a volitelnou ryskou srovnání.
 * Řádky {label, v, ref, tip}.
 */
export function hbarChart(rows, { unit = "", labelW = 74 } = {}) {
  if (!rows.length) return "";
  const rowH = 24, H = rows.length * rowH + 6, padR = 42;
  const mx = Math.max(...rows.flatMap((r) => [r.v, r.ref || 0]), 1);
  const x = (v) => labelW + (v / mx) * (W - labelW - padR);
  const body = rows.map((r, i) => {
    const yTop = i * rowH + 5, h = 13, w = Math.max(r.v > 0 ? 2 : 0, x(r.v) - labelW), rr = Math.min(4, w / 2);
    const bar = r.v > 0 ? `<path class="ch-bar" d="M${labelW} ${yTop} h${(w - rr).toFixed(1)} a${rr} ${rr} 0 0 1 ${rr} ${rr} v${(h - 2 * rr).toFixed(1)} a${rr} ${rr} 0 0 1 ${-rr} ${rr} h${(-(w - rr)).toFixed(1)} z"/>` : "";
    const ref = r.ref > 0 ? `<line class="ch-ref" x1="${x(r.ref).toFixed(1)}" y1="${yTop - 2}" x2="${x(r.ref).toFixed(1)}" y2="${yTop + h + 2}"/>` : "";
    return `<text class="ch-txt" x="0" y="${yTop + 10}">${esc(r.label)}</text>${bar}${ref}`
      + `<text class="ch-val" x="${Math.min(W - 2, Math.max(x(r.v), r.ref > 0 ? x(r.ref) : 0) + 7).toFixed(1)}" y="${yTop + 10}">${fmtNum(r.v)}</text>`
      + `<rect class="ch-hit" x="0" y="${yTop - 4}" width="${W}" height="${rowH}" data-ty="${yTop}" data-tip="${esc(r.tip || r.label + ": " + fmtNum(r.v) + " " + unit)}"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="srovnání kategorií">${body}</svg>`;
}

/** Bublina s hodnotou po dotyku nebo najetí myší. Jeden posluchač na celou záložku. */
export function attachTips(root) {
  if (getComputedStyle(root).position === "static") root.style.position = "relative";
  let tip = root.querySelector(".ctip");
  if (!tip) { tip = document.createElement("div"); tip.className = "ctip"; tip.hidden = true; root.appendChild(tip); }
  const hide = () => { tip.hidden = true; };
  const show = (el) => {
    const r = el.getBoundingClientRect(), b = root.getBoundingClientRect();
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    tip.style.left = Math.max(62, Math.min(root.clientWidth - 62, r.left - b.left + r.width / 2)) + "px";
    /* bublina sedí nad svou značkou, ne nad celou aktivní plochou,
       jinak by zakrývala nadpis karty */
    let top = r.top - b.top;
    const svg = el.ownerSVGElement, ty = el.dataset.ty;
    if (svg && ty) {
      const vb = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number);
      const box = svg.getBoundingClientRect();
      if (vb.length === 4 && vb[3] > 0) top = box.top - b.top + (+ty) * (box.height / vb[3]);
    }
    tip.style.top = Math.max(16, top - 6) + "px";
  };
  root.addEventListener("pointerover", (e) => { const h = e.target.closest(".ch-hit"); if (h) show(h); });
  root.addEventListener("pointerdown", (e) => { const h = e.target.closest(".ch-hit"); if (h) show(h); else hide(); });
  root.addEventListener("pointerleave", hide);
  root.addEventListener("scroll", hide, true);
}
