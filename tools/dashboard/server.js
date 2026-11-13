// tools/dashboard/server.js
// HTTP server: serves the dashboard HTML, a live JSON API, SSE streams
// (dashboard data + live log), static assets, and a /file endpoint so
// dashboard rows can open PDFs/HTML/MD in the browser.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PATHS, ROOT } from './config.js';
import { gatherData } from './data.js';
import { performAction, safeRepoPath } from './actions.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

// Paths whose changes should trigger a live push to connected clients.
const WATCH_PATHS = [
  { p: PATHS.personaRuns, recursive: false },
  { p: PATHS.easyApply, recursive: true },
  { p: PATHS.scan, recursive: false },
  { p: PATHS.plan, recursive: false },
  { p: PATHS.applied, recursive: false },
  { p: PATHS.audit, recursive: false },
  { p: PATHS.cvLibrary, recursive: true },
  { p: PATHS.browserEvents, recursive: false },
];

function sha1(s) { return createHash('sha1').update(s).digest('hex'); }

// Watch data roots, recompute the payload on change, push only when it differs.
// `getData` is injectable so tests can supply a deterministic fixture.
function createDataStream(getData = gatherData) {
  const clients = new Set();
  let lastSig = null;
  let timer = null;
  const watchers = [];

  function snapshot() {
    const data = getData();
    // generatedAt changes on every read; exclude it so the signature reflects data changes only.
    lastSig = sha1(JSON.stringify({ ...data, generatedAt: '' }));
    return JSON.stringify(data);
  }

  function broadcast() {
    const data = getData();
    const sig = sha1(JSON.stringify({ ...data, generatedAt: '' }));
    if (sig === lastSig) return;
    lastSig = sig;
    const json = JSON.stringify(data);
    const frame = `event: data\ndata: ${json}\n\n`;
    for (const res of clients) {
      try { res.write(frame); } catch { clients.delete(res); }
    }
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; try { broadcast(); } catch { /* keep serving */ } }, 200);
  }

  for (const { p, recursive } of WATCH_PATHS) {
    if (!fs.existsSync(p)) continue;
    try {
      const w = fs.watch(p, { recursive }, () => schedule());
      w.on('error', () => {});
      watchers.push(w);
    } catch {
      try {
        const w = fs.watch(p, () => schedule());
        w.on('error', () => {});
        watchers.push(w);
      } catch { /* path not watchable */ }
    }
  }

  function addClient(res) {
    clients.add(res);
    try { res.write(`event: data\ndata: ${snapshot()}\n\n`); } catch { /* gone */ }
  }

  const heartbeat = setInterval(() => {
    for (const res of clients) {
      try { res.write(': ping\n\n'); } catch { clients.delete(res); }
    }
  }, 20000);
  if (heartbeat.unref) heartbeat.unref();

  function close() {
    if (timer) { clearTimeout(timer); timer = null; }
    clearInterval(heartbeat);
    for (const w of watchers) { try { w.close(); } catch { /* ignore */ } }
    watchers.length = 0;
    clients.clear();
  }

  return { addClient, removeClient: (res) => clients.delete(res), close };
}

// Tail .memory/live.log and stream new lines as SSE `log` events.
function redact(line) {
  return String(line)
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})/g, 'sk-***')
    .replace(/\b(ghp_[A-Za-z0-9]{8,})/g, 'ghp_***')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1***')
    .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)\S+/gi, '$1***');
}

function readTail(file, maxLines) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).slice(-maxLines);
  } catch { return []; }
}

function createLogStream() {
  const clients = new Set();
  let offset = 0;
  let lastState = null;

  function stateFrame(state) {
    lastState = state;
    return `event: status\ndata: ${JSON.stringify({ state })}\n\n`;
  }

  function readNew() {
    let st;
    try { st = fs.statSync(PATHS.liveLog); } catch { return []; }
    if (st.size < offset) offset = 0; // truncated or rotated
    if (st.size === offset) return [];
    const len = st.size - offset;
    const buf = Buffer.alloc(len);
    let fd;
    try {
      fd = fs.openSync(PATHS.liveLog, 'r');
      fs.readSync(fd, buf, 0, len, offset);
    } catch { return []; } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
    }
    offset = st.size;
    return buf.toString('utf8').split(/\r?\n/).filter(Boolean).map(redact);
  }

  function write(res, frame) { try { res.write(frame); } catch { clients.delete(res); } }

  function tick() {
    const exists = fs.existsSync(PATHS.liveLog);
    const state = exists ? 'streaming' : 'no-source';
    if (state !== lastState) for (const res of clients) write(res, stateFrame(state));
    const lines = readNew();
    if (lines.length) {
      const frame = `event: log\ndata: ${JSON.stringify({ lines })}\n\n`;
      for (const res of clients) write(res, frame);
    }
  }

  const timer = setInterval(tick, 1000);
  if (timer.unref) timer.unref();

  function addClient(res) {
    clients.add(res);
    if (!fs.existsSync(PATHS.liveLog)) {
      write(res, stateFrame('no-source'));
      return;
    }
    const tail = readTail(PATHS.liveLog, 200).map(redact);
    try { offset = fs.statSync(PATHS.liveLog).size; } catch { offset = 0; }
    write(res, stateFrame('streaming'));
    if (tail.length) write(res, `event: log\ndata: ${JSON.stringify({ lines: tail })}\n\n`);
  }

  function close() { clearInterval(timer); clients.clear(); }

  return { addClient, removeClient: (res) => clients.delete(res), close };
}

// Tail .memory/browser-events.jsonl and stream new lines as SSE `browser-event` events.
function createBrowserEventStream() {
  const clients = new Set();
  let offset = 0;
  let lastState = null;

  function stateFrame(state) {
    lastState = state;
    return `event: status\ndata: ${JSON.stringify({ state, source: 'browser-events' })}\n\n`;
  }

  function parseLine(line) {
    try { return JSON.parse(line); } catch { return { raw: line }; }
  }

  function readNew() {
    let st;
    try { st = fs.statSync(PATHS.browserEvents); } catch { return []; }
    if (st.size < offset) offset = 0;
    if (st.size === offset) return [];
    const len = st.size - offset;
    const buf = Buffer.alloc(len);
    let fd;
    try {
      fd = fs.openSync(PATHS.browserEvents, 'r');
      fs.readSync(fd, buf, 0, len, offset);
    } catch { return []; } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
    }
    offset = st.size;
    return buf.toString('utf8').split(/\r?\n/).filter(Boolean).map(parseLine);
  }

  function write(res, frame) { try { res.write(frame); } catch { clients.delete(res); } }

  function tick() {
    const exists = fs.existsSync(PATHS.browserEvents);
    const state = exists ? 'streaming' : 'no-source';
    if (state !== lastState) for (const res of clients) write(res, stateFrame(state));
    const events = readNew();
    if (events.length) {
      for (const ev of events) {
        const frame = `event: browser-event\ndata: ${JSON.stringify(ev)}\n\n`;
        for (const res of clients) write(res, frame);
      }
    }
  }

  const timer = setInterval(tick, 1000);
  if (timer.unref) timer.unref();

  function readTail(file, maxLines) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      return text.split(/\r?\n/).filter(Boolean).slice(-maxLines).map(parseLine);
    } catch { return []; }
  }

  function addClient(res) {
    clients.add(res);
    if (!fs.existsSync(PATHS.browserEvents)) {
      write(res, stateFrame('no-source'));
      return;
    }
    const tail = readTail(PATHS.browserEvents, 200);
    try { offset = fs.statSync(PATHS.browserEvents).size; } catch { offset = 0; }
    write(res, stateFrame('streaming'));
    for (const ev of tail) write(res, `event: browser-event\ndata: ${JSON.stringify(ev)}\n\n`);
  }

  function close() { clearInterval(timer); clients.clear(); }
  return { addClient, removeClient: (res) => clients.delete(res), close };
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function startServer(port, options = {}) {
  const quiet = !!options.quiet;
  const getData = typeof options.getData === 'function' ? options.getData : gatherData;
  const dataStream = createDataStream(getData);
  const logStream = createLogStream();
  const browserEventStream = createBrowserEventStream();
  const shutdownGraceMs = options.shutdownGraceMs ?? 0; // 0 = disabled (server stays up until Ctrl+C)
  let activeSseResponses = 0;
  let hasHadSseConnection = false;
  let shutdownTimer = null;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    // DNS-rebinding guard: only loopback Hosts may reach this server.
    const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1', bindHost]);
    function hostNameOf(h) {
      const s = String(h || '').toLowerCase().trim();
      if (s.startsWith('[')) { const end = s.indexOf(']'); return end >= 0 ? s.slice(0, end + 1) : s; }
      const colon = s.lastIndexOf(':');
      if (colon > 0 && /^\d+$/.test(s.slice(colon + 1))) return s.slice(0, colon);
      return s;
    }
    if (!LOOPBACK_HOSTS.has(hostNameOf(req.headers.host))) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden: invalid Host');
      return;
    }


    if (url.pathname === '/api/data') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(getData()));
      return;
    }

    if (url.pathname === '/api/action' && req.method === 'POST') {
      // CSRF guard: a cross-origin page must not be able to trigger actions.
      const origin = req.headers.origin;
      if (origin) {
        let originHost = '';
        try { const u = new URL(origin); originHost = u.hostname.toLowerCase(); } catch { originHost = ''; }
        if (!LOOPBACK_HOSTS.has(originHost)) {
          res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'Forbidden: invalid Origin' }));
          return;
        }
      }
      const ct = String(req.headers['content-type'] || '').toLowerCase();
      if (!ct.includes('application/json')) {
        res.writeHead(415, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'Unsupported Media Type: expected application/json' }));
        return;
      }
      try {
        const body = JSON.parse(await readBody(req) || '{}');
        const result = await performAction(body.action, body.folders, { simulate: body.simulate, step: body.step });
        // An action whose audit record could not be written is not a success.
        // Keep the body parseable so the client can report what did change.
        const status = result.audit && result.audit.ok === false ? 500 : 200;
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      trackSseResponse(res, dataStream);
      dataStream.addClient(res);
      return;
    }

    if (url.pathname === '/logs') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      trackSseResponse(res, logStream);
      logStream.addClient(res);
      return;
    }

    if (url.pathname === '/browser-events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      trackSseResponse(res, browserEventStream);
      browserEventStream.addClient(res);
      return;
    }

    if (url.pathname === '/file') {
      const target = safeRepoPath(url.searchParams.get('path') || '');
      if (!target) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Forbidden'); return; }
      const rootReal = fs.realpathSync(ROOT);
      let realTarget;
      try { realTarget = fs.realpathSync(target); } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return;
      }
      if (realTarget !== rootReal && !realTarget.startsWith(rootReal + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Forbidden'); return;
      }
      if (!fs.statSync(realTarget).isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      const ext = path.extname(realTarget).toLowerCase();
      const data = fs.readFileSync(realTarget);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
      return;
    }

    // static assets under public/
    const relPath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const target = path.resolve(PATHS.publicDir, relPath);
    if (target.startsWith(PATHS.publicDir + path.sep) && fs.existsSync(target) && fs.statSync(target).isFile()) {
      const ext = path.extname(target).toLowerCase();
      const data = fs.readFileSync(target);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
      return;
    }

    // unknown path: serve the shell (read per request so edits are never stale)
    try {
      const shell = fs.readFileSync(path.join(PATHS.publicDir, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(shell);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  function trackSseResponse(res, stream) {
    hasHadSseConnection = true;
    activeSseResponses += 1;
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }

    res.once('close', () => {
      stream.removeClient(res);
      activeSseResponses -= 1;
      if (shutdownGraceMs <= 0) return; // idle shutdown disabled
      if (activeSseResponses !== 0 || !hasHadSseConnection || shutdownTimer) return;

      shutdownTimer = setTimeout(() => {
        shutdownTimer = null;
        if (activeSseResponses === 0 && server.listening) {
          try { for (const sk of __sockets) { try { sk.destroy(); } catch {} } } catch {}
          try { server.closeAllConnections?.(); } catch {}
          server.close((error) => {
            if (error) console.error('Failed to close dashboard server:', error.message);
          });
        }
      }, shutdownGraceMs);
      server.emit('dashboard-idle');
    });
  }

  const __sockets = new Set();
  server.on('connection', (sock) => { __sockets.add(sock); sock.on('close', () => __sockets.delete(sock)); });
  server.on('close', () => {
    if (shutdownTimer) { clearTimeout(shutdownTimer); shutdownTimer = null; }
    dataStream.close();
    logStream.close();
    browserEventStream.close();
  });
  const bindHost = process.env.DASHBOARD_HOST || '127.0.0.1';
  server.listen(port, bindHost, () => {
    console.log(`Control Tower dashboard running at http://127.0.0.1:${port}`);
    console.log('Press Ctrl+C to stop.');
  });
  return server;
}





