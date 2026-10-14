import type { PDFDocumentProxy } from "pdfjs-dist";
import { create } from "zustand";
import { ApiError, api } from "../lib/api";
import { sha512 } from "../lib/hash";
import { openPdf, pageBox } from "../lib/pdf";
import {
  PT_PER_MM,
  STAMP_DEFAULT_MM,
  footprint,
  inspectPdf,
  layoutStamp,
  stampPdf,
  type PageBox,
  type StampContent,
} from "../lib/stamp";
import type { Issuer, Stamp, StudioDocument } from "../lib/types";

/** Placeholder used to size the preview before a serial is reserved. */
export const PREVIEW_ID = "XXXXXXXXXXXX";
const MARGIN_MM = 12;

export type Phase = "empty" | "loading" | "ready" | "issuing" | "done";
export type IssueStep = "reserve" | "stamp" | "hash" | "record";
export type Anchor = `${"top" | "middle" | "bottom"}-${"left" | "center" | "right"}`;

export interface IssuedResult {
  doc: StudioDocument;
  bytes: Uint8Array;
  sha512: string;
  fileName: string;
}

interface SigningState {
  phase: Phase;
  step: IssueStep | null;
  error: string | null;
  file: File | null;
  bytes: ArrayBuffer | null;
  pdf: PDFDocumentProxy | null;
  pages: PageBox[];
  /** The source already carries a digital signature that stamping would invalidate. */
  alreadySigned: boolean;
  title: string;
  page: number;
  x: number;
  y: number;
  sizeMm: number;
  caption: boolean;
  /** True until the stamp has been placed on a freshly loaded file. */
  needsPlacement: boolean;
  /** A reserved record whose digest could not be saved yet. */
  unrecorded: { doc: StudioDocument; bytes: Uint8Array; sha512: string; stamp: Stamp } | null;
  result: IssuedResult | null;

  load: (file: File) => Promise<void>;
  setTitle: (title: string) => void;
  setPage: (page: number) => void;
  setSize: (sizeMm: number, issuer: Issuer) => void;
  setCaption: (caption: boolean, issuer: Issuer) => void;
  moveTo: (x: number, y: number, issuer: Issuer) => void;
  anchor: (where: Anchor, issuer: Issuer) => void;
  issue: () => Promise<void>;
  retryRecord: () => Promise<void>;
  reset: () => void;
}

const initial = {
  phase: "empty" as Phase,
  step: null,
  error: null,
  file: null,
  bytes: null,
  pdf: null,
  pages: [],
  alreadySigned: false,
  title: "",
  page: 1,
  x: 0,
  y: 0,
  sizeMm: STAMP_DEFAULT_MM,
  caption: true,
  needsPlacement: false,
  unrecorded: null,
  result: null,
};

function previewContent(issuer: Issuer, caption: boolean, verifyUrl?: string, id?: string): StampContent {
  return {
    verifyUrl: verifyUrl ?? `${window.location.origin}/v/${PREVIEW_ID}`,
    id: id ?? PREVIEW_ID,
    issuer,
    caption,
  };
}

/** The stamp's footprint on the current page, as fractions. */
export function stampFootprint(s: Pick<SigningState, "pages" | "page" | "sizeMm" | "caption">, issuer: Issuer) {
  const box = s.pages[s.page - 1];
  if (!box) return { w: 0, h: 0 };
  return footprint(layoutStamp(previewContent(issuer, s.caption), s.sizeMm), box);
}

function clamp(value: number, max: number) {
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

function baseName(name: string) {
  return name.replace(/\.pdf$/i, "");
}

function message(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const useSigning = create<SigningState>()((set, get) => {
  /** Places the stamp at an anchor with a fixed margin from the page edge. */
  function anchored(where: Anchor, issuer: Issuer, state = get()) {
    const box = state.pages[state.page - 1];
    if (!box) return { x: 0, y: 0 };
    const { w, h } = stampFootprint(state, issuer);
    const mx = (MARGIN_MM * PT_PER_MM) / box.width;
    const my = (MARGIN_MM * PT_PER_MM) / box.height;
    const [v, hz] = where.split("-") as ["top" | "middle" | "bottom", "left" | "center" | "right"];
    const x = hz === "left" ? mx : hz === "center" ? (1 - w) / 2 : 1 - w - mx;
    const y = v === "top" ? my : v === "middle" ? (1 - h) / 2 : 1 - h - my;
    return { x: clamp(x, 1 - w), y: clamp(y, 1 - h) };
  }

  /** Keeps the stamp on the page after its size or page changes. */
  function contained(issuer: Issuer, state = get()) {
    const { w, h } = stampFootprint(state, issuer);
    return { x: clamp(state.x, 1 - w), y: clamp(state.y, 1 - h) };
  }

  async function record(doc: StudioDocument, bytes: Uint8Array, digest: string, stamp: Stamp) {
    set({ step: "record" });
    try {
      const finalized = await api.studio.finalize(doc.id, { sha512: digest, fileSize: bytes.byteLength, stamp });
      const fileName = `${baseName(get().file?.name ?? "document")}-signed.pdf`;
      set({ phase: "done", step: null, unrecorded: null, result: { doc: finalized, bytes, sha512: digest, fileName } });
      downloadPdf(bytes, fileName);
    } catch (err) {
      set({
        phase: "ready",
        step: null,
        unrecorded: { doc, bytes, sha512: digest, stamp },
        error: message(err, "The fingerprint could not be recorded.") + " The stamped file is kept here; record it again before downloading.",
      });
    }
  }

  return {
    ...initial,

    async load(file) {
      void get().pdf?.loadingTask.destroy();
      set({ ...initial, phase: "loading", file, title: baseName(file.name) });
      try {
        const bytes = await file.arrayBuffer();
        const inspection = await inspectPdf(bytes);
        if (inspection === "encrypted") {
          set({ ...initial, error: "This PDF is password-protected. Remove the protection, then choose it again." });
          return;
        }
        if (inspection === "unreadable") {
          set({ ...initial, error: "This file could not be read as a PDF. It may be damaged." });
          return;
        }
        const pdf = await openPdf(bytes);
        const pages: PageBox[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          pages.push(pageBox(await pdf.getPage(i)));
        }
        set({ phase: "ready", bytes, pdf, pages, alreadySigned: inspection.signed, page: 1, needsPlacement: true });
      } catch {
        set({ ...initial, error: "This file could not be opened. Try another PDF." });
      }
    },

    setTitle: (title) => set({ title }),

    setPage(page) {
      const state = get();
      if (page < 1 || page > state.pages.length) return;
      set({ page });
    },

    setSize(sizeMm, issuer) {
      set({ sizeMm });
      set(contained(issuer));
    },

    setCaption(caption, issuer) {
      set({ caption });
      set(contained(issuer));
    },

    moveTo(x, y, issuer) {
      const { w, h } = stampFootprint(get(), issuer);
      set({ x: clamp(x, 1 - w), y: clamp(y, 1 - h), needsPlacement: false });
    },

    anchor(where, issuer) {
      set({ ...anchored(where, issuer), needsPlacement: false });
    },

    async issue() {
      const state = get();
      if (!state.file || !state.bytes || state.phase !== "ready") return;
      if (state.unrecorded) {
        return get().retryRecord();
      }
      set({ phase: "issuing", step: "reserve", error: null });

      let doc: StudioDocument;
      try {
        doc = await api.studio.create({
          title: state.title.trim() || baseName(state.file.name),
          fileName: state.file.name,
          fileSize: state.file.size,
          pageCount: state.pages.length,
        });
      } catch (err) {
        set({ phase: "ready", step: null, error: message(err, "A serial could not be reserved.") });
        return;
      }

      let bytes: Uint8Array;
      let digest: string;
      let stamp: Stamp;
      try {
        set({ step: "stamp" });
        const content = previewContent(doc.issuer, state.caption, doc.verifyUrl, doc.id);
        const box = state.pages[state.page - 1]!;
        const { w, h } = footprint(layoutStamp(content, state.sizeMm), box);
        stamp = { page: state.page, x: clamp(state.x, 1 - w), y: clamp(state.y, 1 - h), sizeMm: state.sizeMm };
        bytes = await stampPdf(state.bytes, content, stamp);
        set({ step: "hash" });
        digest = await sha512(bytes as BufferSource);
      } catch {
        await api.studio.discard(doc.id).catch(() => undefined);
        set({ phase: "ready", step: null, error: "The PDF could not be stamped. It may use features this tool cannot edit." });
        return;
      }
      await record(doc, bytes, digest, stamp);
    },

    async retryRecord() {
      const pending = get().unrecorded;
      if (!pending) return;
      set({ phase: "issuing", error: null });
      await record(pending.doc, pending.bytes, pending.sha512, pending.stamp);
    },

    reset() {
      void get().pdf?.loadingTask.destroy();
      set({ ...initial });
    },
  };
});

