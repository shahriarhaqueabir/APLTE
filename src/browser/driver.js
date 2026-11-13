import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseMajor, pickHighestVersion, assertMajorMatch } from './versions.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export const ROOT = join(HERE, '..', '..');
export const DRIVER_PATH = join(ROOT, 'bin', 'chromedriver.exe');

export const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
];

export function findChrome(candidates = CHROME_CANDIDATES) {
  if (process.env.JOBBOT_CHROME && existsSync(process.env.JOBBOT_CHROME)) {
    return process.env.JOBBOT_CHROME;
  }
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) {
    throw new Error('Chrome not found. Set JOBBOT_CHROME to the chrome.exe path.');
  }
  return found;
}

export function chromeMajorFromInstall(chromePath = findChrome()) {
  const appDir = dirname(chromePath);
  let dirs;
  try {
    dirs = readdirSync(appDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return null;
  }
  const version = pickHighestVersion(dirs);
  return version ? parseMajor(version) : null;
}

export function driverMajorFromBinary(driverPath = DRIVER_PATH) {
  if (!existsSync(driverPath)) {
    throw new Error(`chromedriver not found at ${driverPath}. Run tools/fetch-chromedriver.ps1.`);
  }
  const out = execFileSync(driverPath, ['--version'], { encoding: 'utf8' });
  return parseMajor(out);
}

export function preflight({ chromePath, driverPath = DRIVER_PATH } = {}) {
  const chrome = chromePath ?? findChrome();
  const chromeMajor = chromeMajorFromInstall(chrome);
  const driverMajor = driverMajorFromBinary(driverPath);
  assertMajorMatch(driverMajor, chromeMajor);
  return { chromePath: chrome, chromeMajor, driverMajor, driverPath };
}
