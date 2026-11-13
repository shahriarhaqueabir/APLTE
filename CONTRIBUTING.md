# Contributing

## Development setup

```bash
npm ci
npm test
```

Requires Node.js 26.x, Chrome, and Poppler (`pdftoppm`).

## Rules

- The only render command is `jobbot render`. Do not invoke Chrome/WeasyPrint
  directly in code or scripts.
- After every render, run the verify step (`jobbot verify <pdf>`) and inspect
  every PNG page.
- Content lives only in plain Markdown; no layout directives, HTML, or
  space-padded alignment in content files.
- Do not use `---` as a section divider in content Markdown.
- `CVs/` holds only `MASTER_CV.md` and `MASTER_COVER_LETTER.md` (immutable).
- Tailored outputs go to `data/out/`, never back into `CVs/`.

## Pull requests

- Small, focused commits with conventional commit messages.
- Run `npm test` and `npm run osv` before submitting.
- Update `CHANGELOG.md` under `[Unreleased]`.
- Preserve safety invariants (see `docs/ARCHITECTURE.md`); changes to
  `src/fill/guard.js` or `src/preparation/gate.js` require explicit review.

## Testing

Tests live in `test/` and use Node's built-in test runner. Add tests for new
functionality; do not rely on tests alone to prove correctness — inspect
rendered output and safety paths manually.