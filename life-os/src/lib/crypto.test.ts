import { describe, expect, it } from "vitest";
import { decrypt, decryptJson, encrypt, encryptJson, hmac, safeEqual } from "./crypto";

describe("crypto", () => {
  it("round-trips AES-GCM with a fresh IV each time", () => {
    const a = encrypt("refresh-token-123");
    const b = encrypt("refresh-token-123");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("refresh-token-123");
    expect(decryptJson<{ x: number }>(encryptJson({ x: 1 }))).toEqual({ x: 1 });
  });

  it("rejects tampered ciphertext", () => {
    const c = Buffer.from(encrypt("secret"), "base64");
    c[c.length - 1] = (c[c.length - 1] ?? 0) ^ 0xff;
    expect(() => decrypt(c.toString("base64"))).toThrow();
  });

  it("signs and compares HMACs", () => {
    const sig = hmac("k", "msg");
    expect(safeEqual(sig, hmac("k", "msg"))).toBe(true);
    expect(safeEqual(sig, hmac("k", "other"))).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
  });
});
