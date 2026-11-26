import { describe, expect, it } from "vitest";
import { bannerEnabled, renderBanner, TAGLINE, WORDMARK } from "../../src/cli/banner.js";

const tty = { isTTY: true, columns: 120 };

describe("bannerEnabled", () => {
  it("is on for an interactive terminal", () => {
    expect(bannerEnabled(tty, {}, false)).toBe(true);
  });

  it("is off when output is not a terminal (piped, redirected, tests)", () => {
    expect(bannerEnabled({}, {}, false)).toBe(false);
    expect(bannerEnabled({ isTTY: false }, {}, false)).toBe(false);
  });

  it("is off with --quiet", () => {
    expect(bannerEnabled(tty, {}, true)).toBe(false);
  });

  it("is off in CI", () => {
    expect(bannerEnabled(tty, { CI: "true" }, false)).toBe(false);
  });

  it("is off with OH_REALLY_QUIET, unless it is empty or 0", () => {
    expect(bannerEnabled(tty, { OH_REALLY_QUIET: "1" }, false)).toBe(false);
    expect(bannerEnabled(tty, { OH_REALLY_QUIET: "0" }, false)).toBe(true);
    expect(bannerEnabled(tty, { OH_REALLY_QUIET: "" }, false)).toBe(true);
  });

  it("is off on a dumb terminal", () => {
    expect(bannerEnabled(tty, { TERM: "dumb" }, false)).toBe(false);
  });
});

describe("renderBanner", () => {
  it("shows the wordmark, tagline and version when there is room", () => {
    const text = renderBanner("1.2.3", 120);
    for (const line of WORDMARK) expect(text).toContain(line);
    expect(text).toContain(TAGLINE);
    expect(text).toContain("v1.2.3");
  });

  it("never draws a line wider than the wordmark", () => {
    const width = Math.max(...WORDMARK.map((l) => l.length));
    for (const line of renderBanner("1.2.3", 120).split("\n")) {
      expect(line.length).toBeLessThanOrEqual(width);
    }
  });

  it("falls back to one line on a narrow terminal", () => {
    const text = renderBanner("1.2.3", 40);
    expect(text.trim()).toBe(`oh-really v1.2.3 · ${TAGLINE}`);
  });

  it("uses the wordmark when the width is unknown", () => {
    expect(renderBanner("1.2.3", undefined)).toContain(WORDMARK[0]);
  });

  it("ends with a blank line so the command output starts clear of it", () => {
    expect(renderBanner("1.2.3", 120).endsWith("\n\n")).toBe(true);
    expect(renderBanner("1.2.3", 40).endsWith("\n\n")).toBe(true);
  });

  it("uses only plain ASCII in the wordmark", () => {
    for (const line of WORDMARK) expect(line).toMatch(/^[\x20-\x7e]*$/);
  });
});
