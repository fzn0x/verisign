import { describe, expect, it } from "vitest";
import { digestProblem, groups, normalizeDigest, sha512 } from "./hash";
import { normalizeSerial, serialOf } from "./format";

const abc =
  "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f";

describe("sha512", () => {
  it("matches the FIPS 180-2 test vector", async () => {
    expect(await sha512(new TextEncoder().encode("abc"))).toBe(abc);
  });
});

describe("normalizeDigest", () => {
  it("accepts shasum output", () => {
    expect(normalizeDigest(`${abc.toUpperCase()}  a1-letter.pdf\n`)).toBe(abc);
  });
  it("accepts certutil output with spaced bytes", () => {
    const spaced = abc.match(/../g)!.join(" ");
    expect(normalizeDigest(spaced)).toBe(abc);
  });
  it("accepts Get-FileHash table output", () => {
    const table = `Algorithm Hash Path\n--------- ---- ----\nSHA512 ${abc.toUpperCase()} C:\\letter.pdf`;
    expect(normalizeDigest(table)).toBe(abc);
  });
});

describe("digestProblem", () => {
  it("names what is wrong", () => {
    expect(digestProblem("")).toBe("empty");
    expect(digestProblem("xyz")).toBe("not-hex");
    expect(digestProblem(abc.slice(1))).toBe("too-short");
    expect(digestProblem(abc + "0")).toBe("too-long");
    expect(digestProblem(abc)).toBeNull();
  });
});

describe("groups", () => {
  it("splits into eight rows of sixteen", () => {
    const rows = groups(abc);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.length === 16)).toBe(true);
    expect(rows.join("")).toBe(abc);
  });
});

describe("serials", () => {
  it("round-trips typed serials", () => {
    expect(normalizeSerial("k7q4-m2xd-9pra")).toBe("K7Q4M2XD9PRA");
    expect(normalizeSerial("OILO 0000 0000")).toBe("011000000000");
    expect(normalizeSerial("K7Q4-M2XD-9PRU")).toBeNull();
    expect(serialOf("K7Q4M2XD9PRA")).toBe("K7Q4-M2XD-9PRA");
  });
});
