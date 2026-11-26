import { describe, expect, it } from "vitest";
import { isAllowed } from "../../src/net/allowlist.js";

describe("isAllowed", () => {
  it("denies everything with an empty allowlist", () => {
    expect(isAllowed("api.anthropic.com", 443, [])).toBe(false);
  });

  it("allows a plain host on the web ports only", () => {
    const rules = ["api.anthropic.com"];
    expect(isAllowed("api.anthropic.com", 443, rules)).toBe(true);
    expect(isAllowed("api.anthropic.com", 80, rules)).toBe(true);
    expect(isAllowed("api.anthropic.com", 22, rules)).toBe(false);
  });

  it("allows only the stated port when a rule has one", () => {
    expect(isAllowed("github.com", 22, ["github.com:22"])).toBe(true);
    expect(isAllowed("github.com", 443, ["github.com:22"])).toBe(false);
  });

  it("matches subdomains with *. but never the bare or look-alike domain", () => {
    const rules = ["*.example.com"];
    expect(isAllowed("a.example.com", 443, rules)).toBe(true);
    expect(isAllowed("a.b.example.com", 443, rules)).toBe(true);
    expect(isAllowed("example.com", 443, rules)).toBe(false);
    expect(isAllowed("evil-example.com", 443, rules)).toBe(false);
  });

  it("ignores case and a trailing dot on the requested host", () => {
    expect(isAllowed("API.Anthropic.COM.", 443, ["api.anthropic.com"])).toBe(true);
  });

  it("does not treat a suffix match as a host match", () => {
    expect(isAllowed("notgithub.com", 443, ["github.com"])).toBe(false);
  });

  it("only allows IP addresses that are listed exactly", () => {
    expect(isAllowed("1.1.1.1", 443, ["*.example.com"])).toBe(false);
    expect(isAllowed("127.0.0.1", 8080, ["127.0.0.1:8080"])).toBe(true);
  });

  it("rejects invalid ports", () => {
    expect(isAllowed("github.com", 0, ["github.com"])).toBe(false);
    expect(isAllowed("github.com", Number.NaN, ["github.com"])).toBe(false);
    expect(isAllowed("github.com", 70000, ["github.com:70000"])).toBe(false);
  });
});
