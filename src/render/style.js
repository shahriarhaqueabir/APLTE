// src/render/style.js
// Shared design tokens for all rendered documents (CVs and cover letters).
// Single source of truth — both PDF (CSS) and DOCX (OOXML) are generated
// from these tokens to prevent formatting drift.

export const DESIGN = {
  font: {
    primary: 'Arial',
    fallback: '"Liberation Sans", Helvetica, sans-serif',
  },
  cv: {
    fontSize: 9.5,       // pt
    lineHeight: 1.4,     // equal line spacing across all elements (slightly increased)
    margins: 0.59,       // inches (all sides) ≈ 15mm
    nameSize: 18,        // pt
    headlineSize: 9.5,   // pt
    sectionHeaderSize: 10, // pt
    paragraphSpacing: 4.25, // pt (≈1.5mm)
    sectionSpacing: 11.3,  // pt (≈4mm)
  },
  letter: {
    fontSize: 10.5,      // pt
    lineHeight: 1.4,
    margins: 0.79,       // inches (all sides) ≈ 2cm
    nameSize: 14,        // pt
    sectionHeaderSize: 11, // pt
    paragraphSpacing: 8,  // pt
    sectionSpacing: 12,   // pt
  },
  bullet: {
    character: '\u25CF', // ●
    leftIndent: 14.2,    // pt (≈5mm)
    hanging: 5.7,        // pt (≈2mm)
  },
  color: {
    text: '#000000',
    muted: '#444444',
    border: '#000000',
  },
};

// Backward-compatible aliases
export const STYLE = {
  font: DESIGN.font.primary,
  fallbackFont: DESIGN.font.fallback,
  color: DESIGN.color.text,
  accentColor: DESIGN.color.text,
  bullet: DESIGN.bullet.character,
};

export const CV_STYLE = DESIGN.cv;
export const LETTER_STYLE = DESIGN.letter;

/**
 * Generate CSS for a document type from shared design tokens.
 * @param {'cv'|'letter'} type
 * @returns {string}
 */
export function cssForDoc(type = 'letter') {
  const s = type === 'cv' ? DESIGN.cv : DESIGN.letter;
  const font = DESIGN.font.primary;
  const fallback = DESIGN.font.fallback;
  const color = DESIGN.color.text;
  const bullet = DESIGN.bullet.character;
  const marginCm = (s.margins * 2.54).toFixed(2);

  return `
  @page { size: A4; margin: ${marginCm}cm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "${font}", ${fallback}; font-size: ${s.fontSize}pt; line-height: ${s.lineHeight}; color: ${color}; max-width: 18cm; margin: 0 auto; }
  h1 { font-size: ${DESIGN.cv.nameSize}pt; margin: 0 0 3pt; font-weight: 700; break-after: avoid; }
  h2 { font-size: ${s.sectionHeaderSize}pt; margin: ${s.sectionSpacing}pt 0 2mm; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 0.5pt solid ${DESIGN.color.border}; padding-bottom: 0.5mm; break-after: avoid; page-break-after: avoid; }
  h3 { font-size: ${s.sectionHeaderSize}pt; margin: 7pt 0 2pt; font-weight: 700; break-after: avoid; page-break-after: avoid; }
  p { margin: ${s.paragraphSpacing}pt 0; text-align: left; orphans: 2; widows: 2; }
  ul { margin: 3pt 0 6pt ${DESIGN.bullet.leftIndent}pt; padding: 0; list-style-type: disc; }
  li { margin: 2pt 0; padding-left: 1pt; break-inside: avoid; page-break-inside: avoid; orphans: 2; widows: 2; }
  .contact { font-size: 10pt; color: ${DESIGN.color.muted}; margin: 0 0 ${s.paragraphSpacing}pt; line-height: ${s.lineHeight}; overflow-wrap: anywhere; }
  .date { margin: 8pt 0 2pt 0; }
  .recipient { margin: 0 0 8pt 0; font-weight: 600; }
  .subject { font-weight: 700; margin: 8pt 0 8pt 0; }
  .sig { margin-top: 1em; }
  .role { margin: 1mm 0 2mm; font-weight: 700; }
  .contact { list-style: none; padding: 0; margin: 0; font-size: 9.5pt; color: ${DESIGN.color.muted}; line-height: ${s.lineHeight}; }
  .contact li { margin: 0 0 0.5mm; }
  .contact li.wide { width: auto; }
  .entry { margin-bottom: 3mm; break-inside: avoid; page-break-inside: avoid; }
  .entry-title { font-weight: 700; margin: 0 0 1mm; break-after: avoid; page-break-after: avoid; }
  .entry-title .d { font-weight: 400; }
  .entry-title i { font-weight: 400; }
  .bul { margin: 1mm 0 0; padding-left: 5mm; }
  strong { font-weight: 600; }
  section { break-inside: auto; }
  article { break-inside: avoid; margin-bottom: 4pt; }
  h2 + p, h2 + ul, h2 + article { break-before: avoid; }
  h3 + p, h3 + ul { break-before: avoid; }
  @media print {
    body { width: 100%; max-width: none; margin: 0; }
    a { color: inherit; text-decoration: none; }
  }`;
}

export function docxStylesXml(type = 'letter') {
  const s = type === 'cv' ? DESIGN.cv : DESIGN.letter;
  const font = DESIGN.font.primary;
  const sizeHalfPt = Math.round(s.fontSize * 2);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>
        <w:sz w:val="${sizeHalfPt}"/>
        <w:szCs w:val="${sizeHalfPt}"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="60" w:line="240" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>
      <w:sz w:val="${sizeHalfPt}"/>
    </w:rPr>
  </w:style>
</w:styles>`;
}

export function docxNumberingXml(bulletChar) {
  const leftIndent = DESIGN.bullet.leftIndent * 20; // pt to twips (1pt = 20 twips)
  const hanging = DESIGN.bullet.hanging * 20;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:startOverride w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="${bulletChar}"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="${leftIndent}" w:hanging="${hanging}"/></w:pPr>
      <w:rPr><w:u w:val="none"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;
}

/**
 * Validate that the primary font is available on the system.
 * Returns { available: boolean, font: string, fallback: string }
 */
export function validateFont(fontName) {
  const fs = require('node:fs');
  const fontDir = process.platform === 'win32'
    ? 'C:\\Windows\\Fonts'
    : '/usr/share/fonts';
  const normalizedName = fontName.replace(/\s+/g, '').toLowerCase();
  try {
    const files = fs.readdirSync(fontDir);
    const found = files.some((f) => f.toLowerCase().replace(/\s+/g, '').includes(normalizedName));
    return {
      available: found,
      font: fontName,
      fallback: found ? null : DESIGN.font.fallback.split(',')[0].trim(),
    };
  } catch {
    return { available: false, font: fontName, fallback: DESIGN.font.fallback.split(',')[0].trim() };
  }
}