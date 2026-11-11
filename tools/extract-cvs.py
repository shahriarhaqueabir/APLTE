#!/usr/bin/env python3
"""Extract text from PDF CVs in a directory into a single Markdown file.

Usage:
  python tools/extract-cvs.py [CV_DIR] [OUTPUT_PATH]

Defaults:
  CV_DIR      = <repo>/CVs
  OUTPUT_PATH = <CV_DIR>/CV_LIBRARY.md
"""
import argparse
import glob
import os
from pathlib import Path

from pypdf import PdfReader


def main():
    parser = argparse.ArgumentParser(description="Extract text from PDF CVs")
    parser.add_argument("cv_dir", nargs="?", default=None, help="Directory containing PDF CVs")
    parser.add_argument("output", nargs="?", default=None, help="Output markdown path")
    args = parser.parse_args()

    if args.cv_dir:
        cv_dir = Path(args.cv_dir)
    else:
        base = Path(__file__).resolve().parent.parent
        if (base / "cv-library").is_dir():
            cv_dir = base / "cv-library"
        else:
            cv_dir = base / "CVs"

    if args.output:
        output_path = Path(args.output)
    else:
        output_path = cv_dir / "CV_LIBRARY.md"

    pdfs = sorted(glob.glob(str(cv_dir / "*.pdf")))

    lines = ["# CV Library\n"]
    lines.append("Extracted from PDF CVs using pypdf. Source files in CVs/.\n")
    lines.append(f"Total PDFs: {len(pdfs)}\n")
    lines.append("---\n")

    for i, pdf_path in enumerate(pdfs, 1):
        filename = os.path.basename(pdf_path)
        print(f"Reading {i}/{len(pdfs)}: {filename}")
        lines.append(f"\n## CV {i}: {filename}\n")
        try:
            reader = PdfReader(pdf_path)
            text = ""
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            if text.strip():
                lines.append(text.strip())
            else:
                lines.append("_No text extracted (possibly scanned/image-only PDF)._")
        except Exception as e:
            lines.append(f"_Error reading PDF: {e}_")
        lines.append("\n---\n")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"\nDone. Written to: {output_path}")
    print(f"Total size: {os.path.getsize(output_path)} bytes")


if __name__ == "__main__":
    main()