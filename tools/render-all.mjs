import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCv } from '../src/render/cv.js';
import { renderLetter } from '../src/render/letter.js';

// Batch-render every role CV and application folder that exists locally.
// Folders are discovered, never hardcoded: this script carries no user data.
//
//   cv-library/<role>/source/cv.md          (or cv-library/<role>/cv.md)
//   data/out/easy-apply/<job>/source/cv.md
//
// Cover letters are rendered when a matching source/cover-letter.md exists.

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function discover(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const base = join(dir, entry.name);
      const candidates = [join(base, 'source', 'cv.md'), join(base, 'cv.md')];
      const src = candidates.find((p) => fs.existsSync(p));
      return src ? { base, src } : null;
    })
    .filter(Boolean);
}

const folders = [
  ...discover(join(ROOT, 'cv-library')),
  ...discover(join(ROOT, 'data', 'out', 'easy-apply')),
];

if (folders.length === 0) {
  console.log('No CV sources found (looked in cv-library/ and data/out/easy-apply/).');
  process.exit(0);
}

for (const { base, src } of folders) {
  const md = fs.readFileSync(src, 'utf8');
  const r = await renderCv(md, base, { lang: 'en', title: 'Curriculum Vitae' });
  console.log(`${src} -> ${r.verifyImages.length} pages`);
}

for (const { base } of folders) {
  const clPath = join(base, 'source', 'cover-letter.md');
  if (!fs.existsSync(clPath)) continue;
  const md = fs.readFileSync(clPath, 'utf8');
  const r = await renderLetter(md, base, { lang: 'en', title: 'Cover Letter' });
  console.log(`${clPath} -> ${r.verifyImages.length} page(s)`);
}
