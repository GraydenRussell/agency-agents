import { afterEach, describe, expect, it } from "vitest";
import { isAllowedEmail, isDevAuth, isPublicPath } from "./config";

describe("auth config", () => {
  const orig = { ...process.env };
  afterEach(() => {
    process.env = { ...orig };
  });

  it("only allows the configured email, case-insensitively", () => {
    process.env.ALLOWED_EMAIL = "Grayden@Example.com";
    expect(isAllowedEmail("grayden@example.com")).toBe(true);
    expect(isAllowedEmail("tyce@example.com")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
    process.env.ALLOWED_EMAIL = "";
    expect(isAllowedEmail("")).toBe(false);
  });

  it("refuses dev auth on Vercel", () => {
    process.env.AUTH_MODE = "dev";
    delete process.env.VERCEL;
    expect(isDevAuth()).toBe(true);
    process.env.VERCEL = "1";
    expect(isDevAuth()).toBe(false);
  });

  it("classifies public paths", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/cron/inbox")).toBe(true);
    expect(isPublicPath("/today")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});
