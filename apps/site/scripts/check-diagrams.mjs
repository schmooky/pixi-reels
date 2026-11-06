#!/usr/bin/env node
/**
 * check-diagrams: legibility gate for the hand-drawn SVG diagrams under
 * /architecture/.
 *
 * Loads every architecture page in headless Chromium at a desktop width and,
 * for each `svg.arch-svg`, reports:
 *   - text rendered smaller than MIN_PX (default 12 CSS px)
 *   - two text runs whose boxes overlap
 *   - text that spills outside the svg
 *   - text lying over a box it does not belong to (rect.box-bg / cell-bg /
 *     edge-label-bg of a different element)
 *   - an edge path that passes through a text run
 *
 * Usage:
 *   node scripts/check-diagrams.mjs                 # every page, dev server on 4321
 *   node scripts/check-diagrams.mjs motion events   # only these slugs
 *   BASE=http://localhost:4321 node scripts/check-diagrams.mjs
 *
 * Exit code 1 when any page has a violation. A dev server (`pnpm site:dev`)
 * or preview must already be serving BASE.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? 'http://localhost:4321';
const MIN_PX = Number(process.env.MIN_PX ?? 12);
const VIEWPORT = { width: 1280, height: 900 };

const navSource = readFileSync(resolve(here, '../src/content/architectureNav.ts'), 'utf8');
const allSlugs = [...navSource.matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1]);
const wanted = process.argv.slice(2);
const slugs = wanted.length ? allSlugs.filter((s) => wanted.includes(s)) : allSlugs;
if (wanted.length && slugs.length !== wanted.length) {
  console.error(`unknown slug(s): ${wanted.filter((w) => !allSlugs.includes(w)).join(', ')}`);
  process.exit(2);
}

// Runs inside the page. Returns one report per svg.arch-svg.
function inspect(minPx) {
  const out = [];
  const svgs = [...document.querySelectorAll('svg.arch-svg')];
  const rectsIntersect = (a, b, pad = 0) =>
    a.left < b.right - pad && a.right > b.left + pad && a.top < b.bottom - pad && a.bottom > b.top + pad;
  const box = (el) => el.getBoundingClientRect();
  const describe = (t) => (t.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 48);

  svgs.forEach((svg, index) => {
    const problems = [];
    const svgBox = box(svg);
    const scale = svgBox.width / svg.viewBox.baseVal.width;
    const texts = [...svg.querySelectorAll('text')].filter((t) => (t.textContent ?? '').trim() && box(t).width > 0);
    const textBoxes = texts.map((t) => ({ t, b: box(t) }));

    // 1. font size
    for (const { t } of textBoxes) {
      const px = parseFloat(getComputedStyle(t).fontSize) * scale;
      if (px < minPx - 0.05) problems.push(`small text ${px.toFixed(1)}px: "${describe(t)}"`);
    }

    // 2. text-text overlaps (ignore tspans of the same text, and same-parent title/sub pairs touching by a hair)
    for (let i = 0; i < textBoxes.length; i++) {
      for (let j = i + 1; j < textBoxes.length; j++) {
        const a = textBoxes[i]; const b = textBoxes[j];
        if (rectsIntersect(a.b, b.b, 1)) {
          problems.push(`text overlap: "${describe(a.t)}" <-> "${describe(b.t)}"`);
        }
      }
    }

    // 3. text outside the svg
    for (const { t, b } of textBoxes) {
      if (b.left < svgBox.left - 1 || b.right > svgBox.right + 1 || b.top < svgBox.top - 1 || b.bottom > svgBox.bottom + 1) {
        problems.push(`text outside the figure: "${describe(t)}"`);
      }
    }

    // 4. text over a foreign surface
    const surfaces = [...svg.querySelectorAll('rect.box-bg, rect.cell-bg, rect.edge-label-bg')];
    for (const { t, b } of textBoxes) {
      const own = t.closest('.box, .cell, .edge-group');
      for (const s of surfaces) {
        const sOwner = s.closest('.box, .cell, .edge-group');
        if (sOwner && sOwner === own) continue;
        // A label pill sitting on a group panel is fine; only solid surfaces count.
        if (rectsIntersect(b, box(s), 2)) {
          problems.push(`text over another shape: "${describe(t)}" over ${s.classList[0]} "${describe(sOwner ?? s)}"`);
          break;
        }
      }
    }

    // 5. edges through text: sample each edge path every ~4 px
    const edges = [...svg.querySelectorAll('path.edge')];
    for (const p of edges) {
      const len = p.getTotalLength();
      if (!len) continue;
      const ctm = p.getScreenCTM();
      const hits = new Set();
      for (let s = 0; s <= len; s += 4) {
        const pt = p.getPointAtLength(s).matrixTransform(ctm);
        for (const { t, b } of textBoxes) {
          if (t.closest('.edge-group') === p.closest('.edge-group')) continue;
          if (pt.x > b.left + 1 && pt.x < b.right - 1 && pt.y > b.top + 1 && pt.y < b.bottom - 1) hits.add(describe(t));
        }
      }
      for (const h of hits) problems.push(`edge crosses text: "${h}"`);
    }

    out.push({ index, caption: svg.closest('figure')?.querySelector('figcaption')?.textContent?.trim().slice(0, 60) ?? '', texts: texts.length, problems });
  });
  return out;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
let failed = 0;
for (const slug of slugs) {
  const url = `${BASE}/architecture/${slug}/`;
  const res = await page.goto(url, { waitUntil: 'networkidle' });
  if (!res || !res.ok()) { console.log(`${slug}: HTTP ${res?.status()}`); failed++; continue; }
  await page.evaluate(() => document.querySelectorAll('.animate-fade-in').forEach((e) => e.classList.remove('animate-fade-in')));
  const reports = await page.evaluate(inspect, MIN_PX);
  const bad = reports.filter((r) => r.problems.length);
  const total = bad.reduce((n, r) => n + r.problems.length, 0);
  console.log(`${slug}: ${reports.length} figure(s), ${total} problem(s)`);
  for (const r of bad) {
    console.log(`  figure ${r.index + 1} (${r.caption || 'no caption'}): ${r.problems.length}`);
    for (const p of r.problems.slice(0, 40)) console.log(`    - ${p}`);
    if (r.problems.length > 40) console.log(`    ... ${r.problems.length - 40} more`);
  }
  failed += total;
}
await browser.close();
process.exit(failed ? 1 : 0);
