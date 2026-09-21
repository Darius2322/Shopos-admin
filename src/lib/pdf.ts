/**
 * A tiny, dependency-free PDF writer — just enough for receipts, quotations, invoices and statements:
 * text (Helvetica / Courier, regular / bold), lines and filled rectangles, several pages.
 * No library is added to the bundle, and nothing leaves the device: the PDF is built in the browser.
 * Text is limited to Latin-1 (anything else prints as "?") because the standard fonts are used.
 */
export type PdfFont = 'helv' | 'helvb' | 'cour' | 'courb';

// Helvetica advance widths (1/1000 em) for ASCII 32..126.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];

export function textWidth(str: string, size: number, font: PdfFont = 'helv'): number {
  if (font === 'cour' || font === 'courb') return str.length * 0.6 * size;
  let w = 0;
  for (const ch of str) { const c = ch.charCodeAt(0); w += (c >= 32 && c <= 126 ? HELV[c - 32] : 556); }
  return (w / 1000) * size * (font === 'helvb' ? 1.06 : 1);
}

/** Word-wrap to a pixel width. */
export function wrapToWidth(text: string, maxW: number, size: number, font: PdfFont = 'helv'): string[] {
  const out: string[] = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const trial = cur ? `${cur} ${word}` : word;
      if (textWidth(trial, size, font) <= maxW) { cur = trial; continue; }
      if (cur) out.push(cur);
      let w = word;
      while (textWidth(w, size, font) > maxW && w.length > 1) {   // hard-break very long words
        let n = w.length - 1; while (n > 1 && textWidth(w.slice(0, n), size, font) > maxW) n--;
        out.push(w.slice(0, n)); w = w.slice(n);
      }
      cur = w;
    }
    out.push(cur);
  }
  return out;
}

const esc = (s: string) => s.replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
const num = (n: number) => (Math.round(n * 100) / 100).toString();
type RGB = [number, number, number];
const rgb = (c: RGB) => `${num(c[0])} ${num(c[1])} ${num(c[2])}`;

export class PdfDoc {
  private pages: string[][] = [];
  private cur = 0;
  constructor(public width: number, public height: number) { this.addPage(); }

  addPage() { this.pages.push([]); this.cur = this.pages.length - 1; }
  /** Select an existing page to draw on (used for footers once the page count is known). */
  setPage(i: number) { this.cur = Math.max(0, Math.min(i, this.pages.length - 1)); }
  get pageCount() { return this.pages.length; }
  private get ops() { return this.pages[this.cur]; }

  /** y is measured from the TOP of the page. */
  text(str: string, x: number, y: number, o: { size?: number; font?: PdfFont; align?: 'left' | 'right' | 'center'; color?: RGB } = {}) {
    const size = o.size ?? 10, font = o.font ?? 'helv';
    let px = x;
    if (o.align === 'right') px = x - textWidth(str, size, font);
    else if (o.align === 'center') px = x - textWidth(str, size, font) / 2;
    const F = { helv: 'F1', helvb: 'F2', cour: 'F3', courb: 'F4' }[font];
    this.ops.push(`BT ${rgb(o.color ?? [0, 0, 0])} rg /${F} ${num(size)} Tf ${num(px)} ${num(this.height - y)} Td (${esc(str)}) Tj ET`);
  }
  line(x1: number, y1: number, x2: number, y2: number, o: { width?: number; color?: RGB } = {}) {
    this.ops.push(`${rgb(o.color ?? [0, 0, 0])} RG ${num(o.width ?? 0.7)} w ${num(x1)} ${num(this.height - y1)} m ${num(x2)} ${num(this.height - y2)} l S`);
  }
  rect(x: number, y: number, w: number, h: number, o: { fill?: RGB; stroke?: RGB; lineWidth?: number } = {}) {
    const p = `${num(x)} ${num(this.height - y - h)} ${num(w)} ${num(h)} re`;
    if (o.fill && o.stroke) this.ops.push(`${rgb(o.fill)} rg ${rgb(o.stroke)} RG ${num(o.lineWidth ?? 0.7)} w ${p} B`);
    else if (o.fill) this.ops.push(`${rgb(o.fill)} rg ${p} f`);
    else this.ops.push(`${rgb(o.stroke ?? [0, 0, 0])} RG ${num(o.lineWidth ?? 0.7)} w ${p} S`);
  }

  private build(): string {
    const objs: string[] = [];
    const add = (body: string) => { objs.push(body); return objs.length; };
    const fonts = ['Helvetica', 'Helvetica-Bold', 'Courier', 'Courier-Bold'];
    // 1 catalog, 2 pages (filled in below), 3..6 fonts
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add('');
    fonts.forEach((f) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
    const kids: number[] = [];
    for (const ops of this.pages) {
      const content = ops.join('\n');
      const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const pageId = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.width)} ${num(this.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${contentId} 0 R >>`);
      kids.push(pageId);
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return out;
  }

  toBytes(): Uint8Array {
    const s = this.build();
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;   // every char is < 256 by construction
    return bytes;
  }
  toBlob(): Blob { return new Blob([this.toBytes() as BlobPart], { type: 'application/pdf' }); }
}

/** Saves the PDF. On phones that support it the share sheet is offered; otherwise a normal download. */
export async function savePdf(doc: PdfDoc, filename: string): Promise<void> {
  const blob = doc.toBlob();
  const file = new File([blob], filename, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  void file; void nav; // (plain download is the most reliable across Android Chrome / desktop; sharing stays a separate button)
}

export async function sharePdf(doc: PdfDoc, filename: string, title: string): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const file = new File([doc.toBlob()], filename, { type: 'application/pdf' });
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title }); return true; } catch { return false; }
  }
  return false;
}
