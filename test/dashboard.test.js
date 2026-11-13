import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { gatherData } from '../tools/dashboard/data.js';
import { startServer } from '../tools/dashboard/server.js';
import { performAction } from '../tools/dashboard/actions.js';

test('dashboard gatherData returns expected shape', () => {
  const d = gatherData();
  assert.ok(d.generatedAt);
  assert.ok(Array.isArray(d.applications));
  assert.ok(Array.isArray(d.cvLibrary));
  assert.ok(Array.isArray(d.interventions));
  assert.ok(d.totals);
  assert.equal(typeof d.totals.exceptions, 'number');
  assert.ok(d.systemHealth);
  assert.ok(d.agentMonitor);
  assert.ok(Array.isArray(d.timeline));
  assert.ok(d.activitySummary);
  for (const a of d.applications) {
    assert.ok(a.stage);
    assert.ok(a.stageLabel);
    assert.ok(a.steps);
    assert.ok(Array.isArray(a.issues));
    assert.ok(Array.isArray(a.artifacts));
    assert.ok(a.links);
  }
});

test('dashboard application steps include timestamps', () => {
  const d = gatherData();
  for (const a of d.applications) {
    assert.ok(a.timestamps);
  }
});

test('dashboard actions reject unknown actions', async () => {
  await assert.rejects(() => performAction('rm-rf', ['x']), /unknown action/);
});

test('dashboard server binds only to IPv4 loopback', async () => {
  const server = startServer(0, { quiet: true });
  await once(server, 'listening');
  try {
    assert.equal(server.address().address, '127.0.0.1');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function readFirstFrame(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname }, (res) => {
      let buf = '';
      const timer = setTimeout(() => { req.destroy(); reject(new Error('timeout waiting for SSE frame')); }, 5000);
      timer.unref();
      res.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        if (buf.includes('\n\n')) {
          clearTimeout(timer);
          res.destroy();
          resolve({ headers: res.headers, body: buf });
        }
      });
      res.on('error', () => { /* destroyed after first frame */ });
    });
    req.on('error', (e) => {
      if (e.code !== 'ECONNRESET') reject(e);
    });
  });
}

function openSse(port, pathname) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let body = '';
    const req = http.get({ host: '127.0.0.1', port, path: pathname }, (res) => {
      res.on('data', (chunk) => {
        body += chunk.toString('utf8');
        if (!settled && body.includes('\n\n')) {
          settled = true;
          clearTimeout(timer);
          resolve({ req, res, body });
        }
      });
      res.on('error', fail);
      res.on('end', () => fail(new Error('SSE stream ended before first frame')));
    });
    const timer = setTimeout(() => {
      fail(new Error('timeout waiting for SSE frame'));
      req.destroy();
    }, 5000);
    req.on('error', fail);

    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  });
}

test('dashboard server shuts down after its last SSE stream disconnects', async () => {
  const server = startServer(0, { quiet: true, shutdownGraceMs: 100 });
  await once(server, 'listening');
  const port = server.address().port;
  const streams = [];
  try {
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(server.listening, true, 'server stays open before an SSE connection');

    const events = await openSse(port, '/events');
    streams.push(events);
    const logs = await openSse(port, '/logs');
    streams.push(logs);

    events.req.destroy();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(server.listening, true, 'the remaining /logs stream keeps the server open');

    const idleScheduled = once(server, 'dashboard-idle');
    logs.req.destroy();
    await idleScheduled;
    const replacement = await openSse(port, '/events');
    streams.push(replacement);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(server.listening, true, 'a replacement stream cancels pending shutdown');

    const closed = once(server, 'close');
    replacement.req.destroy();
    let closeTimer;
    try {
      await Promise.race([
        closed,
        new Promise((_, reject) => {
          closeTimer = setTimeout(() => reject(new Error('server did not close within 2 seconds')), 5000);
        }),
      ]);
    } finally {
      clearTimeout(closeTimer);
    }
    assert.equal(server.listening, false);
  } finally {
    for (const { req } of streams) req.destroy();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
});

test('dashboard server closes a pending connection after its last SSE stream disconnects', async () => {
  const shutdownGraceMs = 100;
  const server = startServer(0, { quiet: true, shutdownGraceMs });
  await once(server, 'listening');
  const port = server.address().port;
  let stream;
  let lateSocket;
  try {
    stream = await openSse(port, '/events');

    const accepted = once(server, 'connection');
    lateSocket = net.createConnection({ host: '127.0.0.1', port });
    lateSocket.on('error', () => {});
    await once(lateSocket, 'connect');
    await accepted;
    lateSocket.write('GET /events HTTP/1.1\r\nHost: 127.0.0.1\r\n');

    const closed = once(server, 'close');
    const idle = once(server, 'dashboard-idle');
    stream.req.destroy();
    await idle;
    await new Promise((resolve) => setTimeout(resolve, shutdownGraceMs + 100));
    lateSocket.write('Connection: keep-alive\r\n\r\n');

    let closeTimer;
    try {
      await Promise.race([
        closed,
        new Promise((_, reject) => {
          closeTimer = setTimeout(() => reject(new Error('server did not close within 2 seconds')), 5000);
        }),
      ]);
    } finally {
      clearTimeout(closeTimer);
    }
    assert.equal(server.listening, false);
  } finally {
    stream?.req.destroy();
    lateSocket?.destroy();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    else server.closeAllConnections();
  }
});

test('dashboard /events streams an initial data frame', async () => {
  const server = startServer(0, { quiet: true });
  await once(server, 'listening');
  const port = server.address().port;
  try {
    const { headers, body } = await readFirstFrame(port, '/events');
    assert.match(headers['content-type'], /text\/event-stream/);
    assert.match(body, /event: data/);
    const dataLine = body.split('\n').find((l) => l.startsWith('data: '));
    assert.ok(dataLine, 'expected a data: line');
    const payload = JSON.parse(dataLine.slice('data: '.length));
    assert.ok(payload.generatedAt);
    assert.ok(Array.isArray(payload.applications));
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('dashboard /logs streams a status frame', async () => {
  const server = startServer(0, { quiet: true });
  await once(server, 'listening');
  const port = server.address().port;
  try {
    const { headers, body } = await readFirstFrame(port, '/logs');
    assert.match(headers['content-type'], /text\/event-stream/);
    assert.match(body, /event: status/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('dashboard /browser-events streams a status frame', async () => {
  const server = startServer(0, { quiet: true });
  await once(server, 'listening');
  const port = server.address().port;
  try {
    const { headers, body } = await readFirstFrame(port, '/browser-events');
    assert.match(headers['content-type'], /text\/event-stream/);
    assert.match(body, /event: status/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

function makeActionFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobbot-actions-'));
  const appDir = path.join(root, 'demo-app');
  fs.mkdirSync(path.join(appDir, 'cv'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'cv', 'cv.md'), '# Demo Person\n\nExperience in testing.\n', 'utf8');
  const manifest = {
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    job: { company: 'Demo', role: 'Engineer' },
    preparation: { masterCvReviewed: false },
    application: { date: '2026-01-01', status: 'review' },
    documents: [
      { name: 'cv.pdf', path: 'cv/Demo_CV.pdf', type: 'cv', hash: 'stale', generatedAt: '2026-01-01T00:00:00.000Z' },
      { name: 'cv.docx', path: 'cv/Demo_CV.docx', type: 'cv', hash: 'stale', generatedAt: '2026-01-01T00:00:00.000Z' },
      { name: 'cv.md', path: 'cv/cv.md', type: 'source', hash: 'stale', generatedAt: '2026-01-01T00:00:00.000Z' },
    ],
  };
  fs.writeFileSync(path.join(appDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return { root, appDir, auditPath: path.join(root, 'audit.jsonl') };
}

test('dashboard mark-reviewed updates the manifest and audits the action', async (t) => {
  const fx = makeActionFixture();
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const res = await performAction('mark-reviewed', ['demo-app'], { root: fx.root, auditPath: fx.auditPath });
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].ok, true);

  const manifest = JSON.parse(fs.readFileSync(path.join(fx.appDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.application.userReviewed, true);

  const audit = fs.readFileSync(fx.auditPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'mark-reviewed');
  assert.equal(audit[0].source, 'dashboard');
});

test('dashboard master-CV review is separate from application-document review', async (t) => {
  const fx = makeActionFixture();
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const res = await performAction('mark-master-cv-reviewed', ['demo-app'], { root: fx.root, auditPath: fx.auditPath });
  assert.equal(res.results[0].ok, true);

  const manifest = JSON.parse(fs.readFileSync(path.join(fx.appDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.preparation.masterCvReviewed, true);
  assert.equal(manifest.application.userReviewed, undefined);
  const audit = fs.readFileSync(fx.auditPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(audit[0].action, 'mark-master-cv-reviewed');
});

test('dashboard approve-step reuses workflow gates and advances the step', async (t) => {
  const fx = makeActionFixture();
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const res = await performAction('approve-step', ['demo-app'], { root: fx.root, auditPath: fx.auditPath, step: 'research' });
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].ok, true, res.results[0].error);

  const manifest = JSON.parse(fs.readFileSync(path.join(fx.appDir, 'manifest.json'), 'utf8'));
  assert.ok(manifest.workflow);
  assert.equal(manifest.workflow.step, 'draft');
  assert.equal(manifest.workflow.status, 'pending_review');
  assert.ok(manifest.workflow.approvals.research);

  const audit = fs.readFileSync(fx.auditPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'approve-step');
});

test('dashboard approve-step refuses an out-of-order step', async (t) => {
  const fx = makeActionFixture();
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const res = await performAction('approve-step', ['demo-app'], { root: fx.root, auditPath: fx.auditPath, step: 'draft' });
  assert.equal(res.results[0].ok, false);
  assert.match(res.results[0].error, /Cannot approve/);
});

test('dashboard reports audit failure separately from an applied action', async (t) => {
  const fx = makeActionFixture();
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const res = await performAction('mark-reviewed', ['demo-app'], { root: fx.root, auditPath: fx.root });
  assert.equal(res.results[0].ok, true);
  assert.equal(res.audit.ok, false);
  assert.match(res.audit.error, /EISDIR|directory|file/i);
  const manifest = JSON.parse(fs.readFileSync(path.join(fx.appDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.application.userReviewed, true);
});

test('dashboard force-rerender regenerates documents, refreshes hashes and cleans verify PNGs', async (t) => {
  const fx = makeActionFixture();
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  // Give Chrome a unique profile dir so parallel test files do not fight over it.
  const prevTemp = process.env.TEMP;
  const chromeTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobbot-chrome-'));
  process.env.TEMP = chromeTemp;
  let res;
  try {
    res = await performAction('force-rerender', ['demo-app'], { root: fx.root, auditPath: fx.auditPath });
  } finally {
    process.env.TEMP = prevTemp;
    fs.rmSync(chromeTemp, { recursive: true, force: true });
  }
  assert.equal(res.results[0].ok, true, res.results[0].error);

  const cvDir = path.join(fx.appDir, 'cv');
  assert.ok(fs.existsSync(path.join(cvDir, 'Demo_CV.pdf')), 'pdf written with manifest name');
  assert.ok(fs.existsSync(path.join(cvDir, 'Demo_CV.docx')), 'docx written with manifest name');
  assert.ok(fs.existsSync(path.join(cvDir, 'cv.md')), 'source markdown preserved');
  assert.equal(fs.readdirSync(cvDir).filter((f) => /^verify-page.*\.png$/i.test(f)).length, 0, 'verify PNGs cleaned up');

  const manifest = JSON.parse(fs.readFileSync(path.join(fx.appDir, 'manifest.json'), 'utf8'));
  const sourceDoc = manifest.documents.find((d) => d.name === 'cv.md');
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(cvDir, 'cv.md'))).digest('hex');
  assert.equal(sourceDoc.hash, actual);
  assert.notEqual(sourceDoc.hash, 'stale');

  const audit = fs.readFileSync(fx.auditPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'force-rerender');
});

test('dashboard actions refuse path traversal', async (t) => {
  const fx = makeActionFixture();
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const res = await performAction('mark-reviewed', ['../escape'], { root: fx.root, auditPath: fx.auditPath });
  assert.equal(res.results[0].ok, false);
  assert.match(res.results[0].error, /invalid folder/);
});
