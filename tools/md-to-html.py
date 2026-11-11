#!/usr/bin/env python3
"""Convert Markdown to a styled HTML file for Chrome headless PDF rendering.

Usage:
  python tools/md-to-html.py <input.md> <output.html> [--lang de|en] [--title "Title"]

Examples:
  python tools/md-to-html.py letter.md letter.html --lang de --title "Bewerbung Lane One"
  python tools/md-to-html.py letter.md letter.html --lang en --title "Application Aircall"
"""
import argparse
import sys

import markdown_it


def build_html(md_text: str, lang: str = "en", title: str = "Cover Letter") -> str:
    import html as _html
    md = markdown_it.MarkdownIt("commonmark", {"html": True, "typographer": True})
    # Enable tables and typographer replacements/smart quotes
    md.enable(["table", "replacements", "smartquotes"])
    # German quotes when requested
    if lang == "de":
        md.options["quotes"] = "\u201e\u201c\u201a\u2018"  # „ “ ‚ ‘
    body = md.render(md_text)

    safe_title = _html.escape(title)
    safe_lang = _html.escape(lang)

    return f"""<!DOCTYPE html>
<html lang="{safe_lang}">
<head>
<meta charset="utf-8">
<title>{safe_title}</title>
<style>
  @page {{ size: A4; margin: 2cm; }}
  body {{ font-family: "Calibri", "Carlito", "Segoe UI", Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #1a1a1a; max-width: 17cm; margin: 0 auto; hyphens: auto; -webkit-hyphens: auto; }}
  h1, h2, h3 {{ break-after: avoid; page-break-after: avoid; }}
  h1 {{ font-size: 14pt; margin: 0 0 0.3em 0; }}
  h2 {{ font-size: 12pt; margin: 0.8em 0 0.3em 0; }}
  p {{ margin: 0.7em 0; text-align: justify; orphans: 2; widows: 2; }}
  ul, ol {{ margin: 0.5em 0 0.7em 1.2em; padding: 0; }}
  li {{ margin: 0.3em 0; break-inside: avoid; page-break-inside: avoid; orphans: 2; widows: 2; }}
  strong {{ font-weight: 600; }}
  .contact {{ font-size: 9.5pt; color: #444; margin-bottom: 1.2em; }}
  .sig {{ margin-top: 1.6em; }}
  table {{ border-collapse: collapse; width: 100%; margin: 0.7em 0; }}
  th, td {{ border: 1px solid #999; padding: 0.3em 0.5em; }}
</style>
</head>
<body>
{body}
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description="Convert Markdown to styled HTML")
    parser.add_argument("input", help="Input markdown file")
    parser.add_argument("output", help="Output HTML file")
    parser.add_argument("--lang", default="en", choices=["de", "en"], help="Language (default: en)")
    parser.add_argument("--title", default="Cover Letter", help="Page title")
    args = parser.parse_args()

    try:
        with open(args.input, encoding="utf-8-sig") as f:
            md_text = f.read()
    except FileNotFoundError:
        print(f"ERROR: file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    html = build_html(md_text, args.lang, args.title)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Written: {args.output} ({len(html)} bytes)")


if __name__ == "__main__":
    main()
