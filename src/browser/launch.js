import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

export const DEFAULT_PORT = 9222;

export const FORBIDDEN_FLAGS = [
  '--enable-automation',
  '--headless',
  '--headless=new',
  '--headless=old',
  '--no-sandbox',
  '--disable-gpu',
  '--remote-debugging-pipe',
];

export class UnsafeLaunchError extends Error {
  constructor(flag) {
    super(`Refused: "${flag}" is not allowed for the jobbot browser.`);
    this.name = 'UnsafeLaunchError';
    this.code = 'UNSAFE_FLAG';
    this.flag = flag;
  }
}

export function launchArgs({ profileDir, port = DEFAULT_PORT }) {
  if (!profileDir) throw new Error('launchArgs: profileDir is required');
  return [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-component-update',
  ];
}

export function assertSafeArgs(args) {
  for (const arg of args) {
    const head = String(arg).split('=')[0];
    if (FORBIDDEN_FLAGS.includes(head)) throw new UnsafeLaunchError(head);
  }
}

export async function waitForDevTools(port = DEFAULT_PORT, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        headers: { 'accept-encoding': 'identity' },
      });
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`DevTools did not come up on port ${port}: ${lastErr?.message ?? 'timeout'}`);
}

export async function launchBrowser({ chromePath, profileDir, port = DEFAULT_PORT }) {
  mkdirSync(profileDir, { recursive: true });
  const args = launchArgs({ profileDir, port });
  assertSafeArgs(args);
  const child = spawn(chromePath, args, { detached: true, stdio: 'ignore' });
  child.unref();
  const version = await waitForDevTools(port);
  return { pid: child.pid, port, browser: version.Browser };
}
