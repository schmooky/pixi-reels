#!/usr/bin/env node
/**
 * Answer endpoint for the docs Ask box.
 *
 *   POST /ask       { question, chunks }  -> text/plain stream, X-Ask-Id header
 *   POST /feedback  { id, vote }          -> 204
 *   GET  /audit     Authorization: Bearer ASK_AUDIT_TOKEN -> the audit log (JSON lines)
 *   GET  /healthz   -> ok
 *
 * One JSON line per question is appended to ASK_LOG_FILE: question, chunk
 * ids, answer, model, latency, token usage and the time. Feedback appends a
 * second line with the same id. Nothing else is stored.
 *
 * Plain node:http on purpose: the whole service is this file.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const env = (name, fallback) => {
  const v = process.env[name];
  if (v !== undefined && v !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`ask: ${name} is not set. See README.md for the environment the service needs.`);
};

const PORT = Number(env('PORT', '8787'));
const MODEL = env('ASK_MODEL', 'claude-haiku-4-5');
const MAX_TOKENS = Number(env('ASK_MAX_TOKENS', '1024'));
const LOG_FILE = env('ASK_LOG_FILE', './data/ask-audit.jsonl');
const AUDIT_TOKEN = env('ASK_AUDIT_TOKEN');
const ALLOWED_ORIGINS = env('ASK_ALLOWED_ORIGINS')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const RATE_LIMIT = Number(env('ASK_RATE_LIMIT', '20')); // questions per IP per window
const RATE_WINDOW_MS = Number(env('ASK_RATE_WINDOW_MS', String(10 * 60 * 1000)));
const MAX_CHUNKS = 12;
const MAX_QUESTION_CHARS = 2000;
const MAX_CHUNK_CHARS = 6000;

env('ANTHROPIC_API_KEY'); // fail at boot, not on the first question
const client = new Anthropic();

const SYSTEM = [
  'You answer questions about a software library for its documentation site.',
  'Answer only from the passages the user message provides. If they do not contain the answer, say so in one sentence and name the closest page; do not guess.',
  'Be brief: a few sentences, or a short code block when the passages show one. Plain text and fenced code only, no headings or bullet lists.',
  'Cite by writing the page URL in parentheses right after the claim it supports, exactly as given in the passage header. Cite at least one URL.',
  'Never invent API names, options or URLs that are not in the passages.',
].join(' ');

const hits = new Map(); // ip -> timestamps

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_LIMIT) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) {
    const live = list.filter((t) => now - t < RATE_WINDOW_MS);
    if (live.length) hits.set(ip, live);
    else hits.delete(ip);
  }
}, RATE_WINDOW_MS).unref();

async function audit(record) {
  await mkdir(dirname(LOG_FILE), { recursive: true });
  await appendFile(LOG_FILE, `${JSON.stringify(record)}\n`);
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'X-Ask-Id');
    return true;
  }
  // Same-origin and curl have no Origin header and are allowed through.
  return !origin;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req, limit = 256 * 1024) {
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > limit) throw Object.assign(new Error('body too large'), { status: 413 });
    parts.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf-8'));
  } catch {
    throw Object.assign(new Error('invalid JSON'), { status: 400 });
  }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';
}

function renderChunks(chunks) {
  return chunks
    .map((c, i) => {
      const where = [c.section, c.title, c.heading].filter(Boolean).join(' / ');
      return `[${i + 1}] ${where}\nURL: ${c.url}\n${String(c.text).slice(0, MAX_CHUNK_CHARS)}`;
    })
    .join('\n\n');
}

async function handleAsk(req, res) {
  const ip = clientIp(req);
  if (rateLimited(ip)) return send(res, 429, { error: 'Too many questions from this address; try again in a few minutes.' });
  const body = await readJson(req);
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION_CHARS) : '';
  const chunks = Array.isArray(body?.chunks) ? body.chunks.slice(0, MAX_CHUNKS) : [];
  if (!question) return send(res, 400, { error: 'question is required' });
  if (!chunks.length || !chunks.every((c) => c && typeof c.text === 'string' && typeof c.url === 'string')) {
    return send(res, 400, { error: 'chunks must be a non-empty array of { id, url, section, title, heading?, text }' });
  }

  const id = randomUUID();
  const started = Date.now();
  res.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-ask-id': id,
    'x-accel-buffering': 'no',
  });
  res.flushHeaders?.();

  let answer = '';
  let usage = null;
  let stop = null;
  let error = null;
  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Passages:\n\n${renderChunks(chunks)}\n\nQuestion: ${question}`,
        },
      ],
    });
    req.on('close', () => stream.abort());
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        answer += event.delta.text;
        res.write(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    usage = final.usage;
    stop = final.stop_reason;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    if (!answer) res.write('The answer service hit an error; the sources below still apply.');
    console.error(`[ask] ${id} ${error}`);
  } finally {
    res.end();
  }

  await audit({
    type: 'ask',
    id,
    time: new Date(started).toISOString(),
    question,
    chunkIds: chunks.map((c) => c.id ?? c.url),
    answer,
    model: MODEL,
    latencyMs: Date.now() - started,
    tokens: usage ? { input: usage.input_tokens, output: usage.output_tokens } : null,
    stopReason: stop,
    error,
    ip,
  });
}

async function handleFeedback(req, res) {
  const body = await readJson(req, 4096);
  const id = typeof body?.id === 'string' ? body.id.slice(0, 64) : '';
  const vote = body?.vote === 'up' || body?.vote === 'down' ? body.vote : null;
  if (!id || !vote) return send(res, 400, { error: 'id and vote (up|down) are required' });
  await audit({ type: 'feedback', id, time: new Date().toISOString(), vote, ip: clientIp(req) });
  res.writeHead(204);
  res.end();
}

async function handleAudit(req, res) {
  const auth = req.headers.authorization ?? '';
  if (auth !== `Bearer ${AUDIT_TOKEN}`) return send(res, 401, { error: 'bearer token required' });
  let text = '';
  try {
    text = await readFile(LOG_FILE, 'utf-8');
  } catch {
    text = '';
  }
  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' });
  res.end(text);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!cors(req, res)) return send(res, 403, { error: 'origin not allowed' });
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  try {
    if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true, model: MODEL });
    if (req.method === 'POST' && url.pathname === '/ask') return await handleAsk(req, res);
    if (req.method === 'POST' && url.pathname === '/feedback') return await handleFeedback(req, res);
    if (req.method === 'GET' && url.pathname === '/audit') return await handleAudit(req, res);
    return send(res, 404, { error: 'not found' });
  } catch (err) {
    const status = err?.status ?? 500;
    if (status === 500) console.error('[ask]', err);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'internal error' : err.message });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`[ask] listening on :${PORT}, model ${MODEL}, audit log ${LOG_FILE}, origins ${ALLOWED_ORIGINS.join(', ') || '(none)'}`);
});
