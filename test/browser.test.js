import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMajor, compareVersions, pickHighestVersion, assertMajorMatch, VersionMismatchError } from '../src/browser/versions.js';
import { launchArgs, assertSafeArgs, UnsafeLaunchError, FORBIDDEN_FLAGS } from '../src/browser/launch.js';

test('parseMajor reads the major from a version string', () => {
  assert.equal(parseMajor('156.0.8078.80'), 156);
  assert.equal(parseMajor('ChromeDriver 156.0.8078.80 (abc-def)'), 156);
  assert.equal(parseMajor('nonsense'), null);
});

test('compareVersions orders numerically, not lexically', () => {
  assert.ok(compareVersions('156.0.1', '157.0.0') < 0);
  assert.ok(compareVersions('99.0.0', '100.0.0') < 0);
  assert.equal(compareVersions('156.0.0', '156.0.0'), 0);
});

test('pickHighestVersion ignores non-version directory names', () => {
  assert.equal(pickHighestVersion(['156.0.8078.80', '157.0.8103.38', 'SetupMetrics', '']), '157.0.8103.38');
});

test('pickHighestVersion returns null when nothing matches', () => {
  assert.equal(pickHighestVersion(['foo', 'bar']), null);
});

test('matching majors pass', () => {
  assert.doesNotThrow(() => assertMajorMatch(156, 156));
});

test('mismatched majors throw', () => {
  assert.throws(() => assertMajorMatch(156, 157), VersionMismatchError);
});

test('missing majors throw rather than passing silently', () => {
  assert.throws(() => assertMajorMatch(null, 156), VersionMismatchError);
});

test('launch args include the profile dir and the debug port', () => {
  const args = launchArgs({ profileDir: 'C:\\tmp\\profile', port: 9222 });
  assert.ok(args.includes('--user-data-dir=C:\\tmp\\profile'));
  assert.ok(args.includes('--remote-debugging-port=9222'));
});

test('launch args never enable automation', () => {
  const args = launchArgs({ profileDir: 'C:\\tmp\\profile' });
  assert.equal(args.some((a) => a.startsWith('--enable-automation')), false);
  assert.doesNotThrow(() => assertSafeArgs(args));
});

test('forbidden flags are refused', () => {
  for (const flag of FORBIDDEN_FLAGS) {
    assert.throws(() => assertSafeArgs([flag]), UnsafeLaunchError, flag);
  }
});

test('a forbidden flag with a value is still refused', () => {
  assert.throws(() => assertSafeArgs(['--headless=new']), UnsafeLaunchError);
});

test('launchArgs requires a profile dir', () => {
  assert.throws(() => launchArgs({}), /profileDir is required/);
});
