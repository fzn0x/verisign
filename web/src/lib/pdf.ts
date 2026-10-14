import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { PageBox } from "./stamp";

let pdfjs: Promise<typeof import("pdfjs-dist")> | null = null;

/** Loads pdf.js on first use so public pages never download it. */
function loadPdfjs() {
  pdfjs ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    },
  );
  return pdfjs;
}

export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = await loadPdfjs();
  // pdf.js transfers the buffer to its worker; hand it a copy so the
  // original bytes stay available for stamping.
  return lib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
}

/** The page's visible size in points, rotation applied. */
export function pageBox(page: PDFPageProxy): PageBox {
  const viewport = page.getViewport({ scale: 1 });
  return { width: viewport.width, height: viewport.height };
}

/**
 * Renders a page into a canvas at the given CSS width, sharp on HiDPI
 * screens. Cancel the returned task before rendering into the same canvas
 * again.
 */
export function renderPage(page: PDFPageProxy, canvas: HTMLCanvasElement, cssWidth: number) {
  const base = page.getViewport({ scale: 1 });
  const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  return page.render({ canvas, viewport });
}
