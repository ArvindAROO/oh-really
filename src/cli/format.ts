import type { Report } from "../platform/evaluate.js";
import type { SandboxPolicy } from "../policy/resolve.js";

/** Text for `oh-really doctor`. */
export function formatReport(report: Report): string {
  const lines = [`Sandbox backend: ${report.backend ?? "none"}`, ""];
  for (const c of report.checks) {
    lines.push(`  ${c.ok ? "ok  " : "FAIL"}  ${c.label}: ${c.detail}`);
    if (c.hint) lines.push(`        ${c.hint}`);
  }
  lines.push(
    "",
    report.supported
      ? "This system is ready: every protection can be enforced."
      : "This system cannot run sandboxed yet. Fix the items marked FAIL, or use --yolo to run without protection.",
  );
  return lines.join("\n") + "\n";
}

/** Text for `oh-really explain <tool>`. */
export function formatExplain(tool: string, policy: SandboxPolicy, sources: string[]): string {
  const list = (paths: string[]) => (paths.length ? paths.map((p) => `  ${p}`) : ["  (nothing)"]);
  const internet = {
    off: "Internet: none",
    open: "Internet: anything (no filtering)",
    allowlist: `Internet: only ${policy.network.allow.join(", ") || "(no sites)"}`,
  }[policy.network.mode];

  return (
    [
      `${tool} can read and change:`,
      ...list(policy.readWrite),
      "",
      `${tool} can read:`,
      ...list(policy.readOnly),
      "  (plus the system files programs need to run)",
      "",
      ...(policy.hidden.length
        ? [`Hidden even inside the folder:`, ...list(policy.hidden), ""]
        : []),
      internet,
      `Git push: ${policy.gitPush ? "allowed" : "not allowed"}`,
      `Environment variables passed: ${policy.envPass.join(", ") || "basics only"}`,
      "",
      ...sources.map((s) => `Settings from: ${s}`),
    ].join("\n") + "\n"
  );
}
