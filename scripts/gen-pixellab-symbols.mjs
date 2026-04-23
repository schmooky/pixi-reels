#!/usr/bin/env node
// Generate pixel-art slot symbols + per-symbol animation frames via the
// pixellab.ai v2 API. Writes PNGs to examples/assets/pixellab-symbols/.
//
// Usage:
//   PIXELAB_API_KEY=... node scripts/gen-pixellab-symbols.mjs
//
// Optional env:
//   PIXELAB_SYMBOLS=cherry,seven   (comma-separated subset; default = all)
//   PIXELAB_SIZE=128               (px; default 128)
//   PIXELAB_FRAMES=8               (4..16, must be even; default 8)
//
// The script is idempotent-ish: if the base PNG already exists for a
// symbol it won't regenerate it; same for the animation result. Delete
// the `examples/assets/pixellab-symbols/<id>/` directory to force a
// regen for that symbol.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.pixellab.ai/v2';
const KEY = process.env.PIXELAB_API_KEY;
if (!KEY) {
  console.error('PIXELAB_API_KEY not set. Grab one at https://pixellab.ai/account.');
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const OUT_ROOT = path.join(REPO, 'examples/assets/pixellab-symbols');

const SIZE = Number(process.env.PIXELAB_SIZE ?? 128);
const FRAMES = Number(process.env.PIXELAB_FRAMES ?? 8);

// Prompts are kept short and concrete — pixellab works best with clear
// subject + one or two style modifiers. `action` for the animation step
// tells the model what the in-between frames should do; keep it to a
// single visual idea so the loop reads cleanly at 8 frames.
const SYMBOLS = [
  {
    id: 'seven',
    description: 'glowing red seven slot machine symbol, shiny, bold, centered on a transparent background',
    action: 'pulsing red glow with white sparkles',
  },
  {
    id: 'bell',
    description: 'golden brass bell slot machine symbol, polished, centered',
    action: 'ringing bell with yellow glow',
  },
  {
    id: 'cherry',
    description: 'pair of red cherries with green stem, glossy, slot machine symbol, centered',
    action: 'bouncing cherries with sparkle',
  },
  {
    id: 'diamond',
    description: 'cut blue diamond slot machine symbol, faceted, bright, centered',
    action: 'rotating diamond with light flare',
  },
  {
    id: 'bar',
    description: 'golden triple-bar slot machine symbol, embossed, centered',
    action: 'glowing golden bar with shimmer',
  },
];

const selectIds = process.env.PIXELAB_SYMBOLS?.split(',').map((s) => s.trim()).filter(Boolean);
const todo = selectIds?.length
  ? SYMBOLS.filter((s) => selectIds.includes(s.id))
  : SYMBOLS;

console.log(`Generating ${todo.length} symbol(s) at ${SIZE}x${SIZE} with ${FRAMES} frames each.`);

async function api(pathname, body, method = 'POST') {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${pathname} -> ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

async function waitJob(jobId, { timeoutMs = 5 * 60_000, pollMs = 5_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await api(`/background-jobs/${jobId}`, null, 'GET');
    if (job.status === 'completed') return job;
    if (job.status === 'failed') throw new Error(`job ${jobId} failed: ${JSON.stringify(job).slice(0, 400)}`);
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`job ${jobId} timed out after ${timeoutMs} ms`);
}

async function generateBase(symbol, outPath) {
  if (fs.existsSync(outPath)) {
    console.log(`  ✓ base cached: ${path.relative(REPO, outPath)}`);
    return;
  }
  console.log(`  → base…`);
  const r = await api('/create-image-pixflux', {
    description: symbol.description,
    image_size: { width: SIZE, height: SIZE },
    no_background: true,
    text_guidance_scale: 10,
  });
  const b64 = r.image?.base64;
  if (!b64) throw new Error('no base64 returned from create-image-pixflux');
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log(`  ✓ wrote ${path.relative(REPO, outPath)}`);
}

async function generateFrames(symbol, basePath, framesDir) {
  const done = fs.existsSync(framesDir)
    && fs.readdirSync(framesDir).filter((n) => n.startsWith('frame_') && n.endsWith('.png')).length > 0;
  if (done) {
    console.log(`  ✓ frames cached: ${path.relative(REPO, framesDir)}`);
    return;
  }
  fs.mkdirSync(framesDir, { recursive: true });
  const basePng = fs.readFileSync(basePath);
  console.log(`  → animate (${FRAMES} frames, action: "${symbol.action}")…`);
  const started = await api('/animate-with-text-v3', {
    first_frame: { type: 'base64', base64: basePng.toString('base64'), format: 'png' },
    action: symbol.action,
    frame_count: FRAMES,
    no_background: true,
  });
  const jobId = started.background_job_id;
  if (!jobId) throw new Error(`no background_job_id: ${JSON.stringify(started).slice(0, 200)}`);
  console.log(`    job ${jobId} — polling…`);
  const job = await waitJob(jobId);
  const images = job.last_response?.images;
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error(`no images in completed job: ${JSON.stringify(job.last_response).slice(0, 400)}`);
  }
  images.forEach((im, i) => {
    const out = path.join(framesDir, `frame_${String(i).padStart(2, '0')}.png`);
    fs.writeFileSync(out, Buffer.from(im.base64, 'base64'));
  });
  console.log(`  ✓ wrote ${images.length} frames to ${path.relative(REPO, framesDir)}`);
}

fs.mkdirSync(OUT_ROOT, { recursive: true });

for (const symbol of todo) {
  console.log(`\n[${symbol.id}]`);
  const symbolDir = path.join(OUT_ROOT, symbol.id);
  fs.mkdirSync(symbolDir, { recursive: true });
  const basePath = path.join(symbolDir, 'base.png');
  try {
    await generateBase(symbol, basePath);
    await generateFrames(symbol, basePath, symbolDir);
  } catch (e) {
    console.error(`  ✗ ${symbol.id}: ${e.message}`);
    throw e;
  }
}

console.log('\nDone.');
