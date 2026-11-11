export function parseMajor(text) {
  const m = String(text ?? '').match(/(\d+)\.\d+/);
  return m ? Number(m[1]) : null;
}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export function pickHighestVersion(list) {
  const valid = list.filter((v) => /^\d+(\.\d+)*$/.test(v));
  if (valid.length === 0) return null;
  return valid.sort(compareVersions).at(-1);
}

export class VersionMismatchError extends Error {
  constructor(driverMajor, chromeMajor) {
    super(
      `Refused: chromedriver is major ${driverMajor} but Chrome is major ${chromeMajor}. ` +
        'Re-run tools/fetch-chromedriver.ps1 after updating the pinned version.',
    );
    this.name = 'VersionMismatchError';
    this.code = 'DRIVER_VERSION_MISMATCH';
    this.driverMajor = driverMajor;
    this.chromeMajor = chromeMajor;
  }
}

export function assertMajorMatch(driverMajor, chromeMajor) {
  if (!Number.isInteger(driverMajor) || !Number.isInteger(chromeMajor)) {
    throw new VersionMismatchError(driverMajor, chromeMajor);
  }
  if (driverMajor !== chromeMajor) {
    throw new VersionMismatchError(driverMajor, chromeMajor);
  }
}
