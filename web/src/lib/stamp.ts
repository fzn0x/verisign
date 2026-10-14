import {
  PDFDocument,
  StandardFontEmbedder,
  StandardFonts,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from "pdf-lib";
import { hostOf, serialOf } from "./format";
import { verificationQr, type QrCode } from "./qr";
import type { Issuer, Stamp } from "./types";

export const PT_PER_MM = 72 / 25.4;
export const STAMP_MIN_MM = 14;
export const STAMP_MAX_MM = 40;
export const STAMP_DEFAULT_MM = 22;

export interface CaptionLine {
  text: string;
  bold: boolean;
  /** Baseline offset from the stamp's top edge, in points. */
  baseline: number;
  x: number;
  size: number;
}

/** Geometry of the stamp in points, origin at its top-left, y down. */
export interface StampLayout {
  width: number;
  height: number;
  padding: number;
  qrSize: number;
  module: number;
  qr: QrCode;
  lines: CaptionLine[];
}

export interface StampContent {
  verifyUrl: string;
  id: string;
  issuer: Pick<Issuer, "organization" | "signatory">;
  caption: boolean;
}

type FontName = Parameters<typeof StandardFontEmbedder.for>[0];
const regular = StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as FontName);
const bold = StandardFontEmbedder.for(StandardFonts.HelveticaBold as unknown as FontName);

/**
 * The PDF's built-in Helvetica only covers Windows-1252. Characters outside
 * it are replaced so stamping never fails on a name the font cannot print.
 */
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function printable(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 0;
    const ok = (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.includes(ch);
    out += ok ? ch : "?";
  }
  return out;
}

export function captionLines(content: StampContent): { text: string; bold: boolean }[] {
  return [
    { text: printable(content.issuer.organization), bold: true },
    { text: printable(`Signed by ${content.issuer.signatory}`), bold: false },
    { text: `Serial ${serialOf(content.id)}`, bold: false },
    { text: printable(`Verify at ${hostOf(content.verifyUrl)}`), bold: false },
  ];
}

export function layoutStamp(content: StampContent, sizeMm: number): StampLayout {
  const qr = verificationQr(content.verifyUrl);
  const qrSize = sizeMm * PT_PER_MM;
  const module = qrSize / qr.size;
  // Two modules of quiet zone keep the code readable on any background.
  const padding = module * 2;
  let width = qrSize + padding * 2;
  const height = qrSize + padding * 2;
  const lines: CaptionLine[] = [];

  if (content.caption) {
    const size = qrSize * 0.11;
    const leading = size * 1.42;
    const x = padding + qrSize + padding * 1.5;
    const raw = captionLines(content);
    const blockHeight = leading * (raw.length - 1) + size * 0.72;
    let baseline = (height - blockHeight) / 2 + size * 0.72;
    let widest = 0;
    for (const line of raw) {
      const font = line.bold ? bold : regular;
      widest = Math.max(widest, font.widthOfTextAtSize(line.text, size));
      lines.push({ ...line, x, baseline, size });
      baseline += leading;
    }
    width = x + widest + padding * 1.5;
  }
  return { width, height, padding, qrSize, module, qr, lines };
}

/** Visible page size in points, after the page's /Rotate is applied. */
export interface PageBox {
  width: number;
  height: number;
}

/** Stamp footprint as fractions of the page, for keeping it on the page. */
export function footprint(layout: StampLayout, page: PageBox): { w: number; h: number } {
  return { w: layout.width / page.width, h: layout.height / page.height };
}

export type PdfProblem = "encrypted" | "unreadable";

export interface PdfInspection {
  pageCount: number;
  /** The file already carries a digital signature that stamping would break. */
  signed: boolean;
}

/** Checks a chosen file can be stamped before any record is created. */
export async function inspectPdf(source: ArrayBuffer): Promise<PdfInspection | PdfProblem> {
  try {
    const pdf = await PDFDocument.load(source, { updateMetadata: false });
    const head = new TextDecoder("latin1").decode(new Uint8Array(source));
    return { pageCount: pdf.getPageCount(), signed: head.includes("/ByteRange") };
  } catch (err) {
    return err instanceof Error && err.name === "EncryptedPDFError" ? "encrypted" : "unreadable";
  }
}

const INK = rgb(0x11 / 255, 0x11 / 255, 0x11 / 255);
const HAIRLINE = rgb(0xcf / 255, 0xcf / 255, 0xcf / 255);
const WHITE = rgb(1, 1, 1);

/**
 * Draws the stamp onto a copy of the PDF and returns the new bytes. The
 * stamp is drawn in the page's visible orientation, so rotated pages get
 * an upright stamp where the owner placed it.
 */
export async function stampPdf(source: ArrayBuffer, content: StampContent, stamp: Stamp): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source, { updateMetadata: false });
  const page = pdf.getPage(stamp.page - 1);
  const crop = page.getCropBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const sideways = rotation === 90 || rotation === 270;
  const visible: PageBox = sideways ? { width: crop.height, height: crop.width } : { width: crop.width, height: crop.height };

  const layout = layoutStamp(content, stamp.sizeMm);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Map visible coordinates (origin bottom-left, y up) to the page's user space.
  const W = crop.width;
  const H = crop.height;
  const matrix: [number, number, number, number, number, number] =
    rotation === 90
      ? [0, 1, -1, 0, W, 0]
      : rotation === 180
        ? [-1, 0, 0, -1, W, H]
        : rotation === 270
          ? [0, -1, 1, 0, 0, H]
          : [1, 0, 0, 1, 0, 0];
  matrix[4] += crop.x;
  matrix[5] += crop.y;

  const left = stamp.x * visible.width;
  const top = visible.height - stamp.y * visible.height;

  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...matrix));
  page.drawRectangle({
    x: left,
    y: top - layout.height,
    width: layout.width,
    height: layout.height,
    color: WHITE,
    borderColor: HAIRLINE,
    borderWidth: 0.5,
  });
  page.drawSvgPath(layout.qr.path, {
    x: left + layout.padding,
    y: top - layout.padding,
    scale: layout.module,
    color: INK,
    borderWidth: 0,
  });
  for (const line of layout.lines) {
    page.drawText(line.text, {
      x: left + line.x,
      y: top - line.baseline,
      size: line.size,
      font: line.bold ? fontBold : font,
      color: INK,
    });
  }
  page.pushOperators(popGraphicsState());

  return pdf.save();
}
