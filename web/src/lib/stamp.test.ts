import { PDFDocument, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { inspectPdf, layoutStamp, printable, stampPdf, type StampContent } from "./stamp";
import { verificationQr } from "./qr";

const content: StampContent = {
  verifyUrl: "https://verisign.example.com/v/K7Q4M2XD9PRA",
  id: "K7Q4M2XD9PRA",
  issuer: { organization: "Midori Research", signatory: "Ada Signatory" },
  caption: true,
};

async function blankPdf(pages: number, rotate = 0): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    pdf.addPage([595.28, 841.89]).setRotation(degrees(rotate));
  }
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("verificationQr", () => {
  it("uses a compact symbol for an upper-cased URL", () => {
    const qr = verificationQr(content.verifyUrl);
    // Alphanumeric mode keeps a ~45 character URL within version 3 or 4.
    expect(qr.size).toBeLessThanOrEqual(33);
    expect(qr.path.startsWith("M0 0h7")).toBe(true); // finder pattern top row
  });
});

describe("layoutStamp", () => {
  it("scales with the requested size", () => {
    const small = layoutStamp(content, 18);
    const large = layoutStamp(content, 30);
    expect(large.qrSize / small.qrSize).toBeCloseTo(30 / 18);
    expect(large.width).toBeGreaterThan(small.width);
    expect(small.lines).toHaveLength(4);
  });
  it("is just the code and its quiet zone without a caption", () => {
    const bare = layoutStamp({ ...content, caption: false }, 22);
    expect(bare.lines).toHaveLength(0);
    expect(bare.width).toBeCloseTo(bare.height);
  });
});

describe("printable", () => {
  it("keeps Windows-1252 text and replaces the rest", () => {
    expect(printable("Café — Zoë")).toBe("Café — Zoë");
    expect(printable("緑 Research")).toBe("? Research");
  });
});

describe("stampPdf", () => {
  it("stamps the chosen page and keeps the document readable", async () => {
    const source = await blankPdf(2);
    const out = await stampPdf(source, content, { page: 2, x: 0.6, y: 0.85, sizeMm: 22 });
    expect(out.byteLength).toBeGreaterThan(source.byteLength);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(2);
  });
  it("handles rotated pages", async () => {
    for (const angle of [90, 180, 270]) {
      const out = await stampPdf(await blankPdf(1, angle), content, { page: 1, x: 0.1, y: 0.1, sizeMm: 20 });
      expect((await PDFDocument.load(out)).getPage(0).getRotation().angle).toBe(angle);
    }
  });
  it("is deterministic for the same input", async () => {
    const source = await blankPdf(1);
    const stamp = { page: 1, x: 0.5, y: 0.5, sizeMm: 22 };
    const a = await stampPdf(source, content, stamp);
    const b = await stampPdf(source, content, stamp);
    expect(a).toEqual(b);
  });
});

describe("inspectPdf", () => {
  it("reports page count and rejects garbage", async () => {
    expect(await inspectPdf(await blankPdf(3))).toEqual({ pageCount: 3, signed: false });
    expect(await inspectPdf(new TextEncoder().encode("not a pdf").buffer as ArrayBuffer)).toBe("unreadable");
  });
});
