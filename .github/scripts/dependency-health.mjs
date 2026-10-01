import fs from "node:fs";
import { execFileSync } from "node:child_process";

const auditPath = process.argv[2] ?? "dependency-audit.json";
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const vulnerabilities = Object.entries(audit.vulnerabilities ?? {});

const counts = audit.metadata?.vulnerabilities ?? {};
const blocked = [];
const major = [];
const automatic = [];

for (const [name, info] of vulnerabilities) {
  const fix = info.fixAvailable;
  if (fix === false) {
    blocked.push([name, info]);
  } else if (fix && typeof fix === "object" && fix.isSemVerMajor) {
    major.push([name, info]);
  } else if (fix) {
    automatic.push([name, info]);
  } else {
    blocked.push([name, info]);
  }
}

function explain(name) {
  try {
    const raw = execFileSync("npm", ["explain", name, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const entries = JSON.parse(raw);
    const rows = Array.isArray(entries) ? entries : [entries];
    const paths = rows
      .flatMap((entry) => {
        const out = [];
        if (entry?.location) out.push(entry.location);
        if (entry?.dependents) {
          for (const parent of entry.dependents) {
            const label = [
              parent.name,
              parent.version ? "@" + parent.version : "",
              parent.location ? " (" + parent.location + ")" : "",
            ].join("");
            if (label) out.push("via " + label);
          }
        }
        return out;
      })
      .filter(Boolean);
    return [...new Set(paths)].slice(0, 4);
  } catch {
    return [];
  }
}

function advisorySummary(info) {
  const via = Array.isArray(info.via) ? info.via : [];
  const titles = via
    .filter((x) => x && typeof x === "object")
    .map((x) => x.title || x.source)
    .filter(Boolean);
  return [...new Set(titles)].slice(0, 3);
}

function fixText(info) {
  const fix = info.fixAvailable;
  if (fix === false || !fix) return "No automatic fix available";
  if (typeof fix === "object") {
    const version = fix.version ? "@" + fix.version : "";
    return `${fix.name ?? "dependency"}${version}${fix.isSemVerMajor ? " (semver-major)" : ""}`;
  }
  return "Automatic fix available";
}

const totalBlocked = blocked.length + major.length;
const lines = [];

if (totalBlocked === 0) {
  lines.push("<!-- dependency-health:clean -->");
  lines.push("# Dependency health");
  lines.push("");
  lines.push("No npm advisories currently require manual intervention.");
  lines.push("");
  lines.push(`Automatically addressable advisories: ${automatic.length}`);
} else {
  lines.push("<!-- dependency-health:unresolved -->");
  lines.push("# Dependency health");
  lines.push("");
  lines.push("This issue is maintained automatically by the `Dependency health` workflow.");
  lines.push("Dependabot continues to handle updates it can resolve safely; this report tracks only blockers or fixes that require a semver-major change.");
  lines.push("");
  lines.push("## Audit summary");
  lines.push("");
  lines.push(`- Critical: ${counts.critical ?? 0}`);
  lines.push(`- High: ${counts.high ?? 0}`);
  lines.push(`- Moderate: ${counts.moderate ?? 0}`);
  lines.push(`- Low: ${counts.low ?? 0}`);
  lines.push(`- Automatically addressable: ${automatic.length}`);
  lines.push(`- Blocked / manual review: ${totalBlocked}`);
  lines.push("");

  for (const [heading, rows] of [
    ["Blocked by the current dependency graph", blocked],
    ["Requires a semver-major fix", major],
  ]) {
    if (!rows.length) continue;
    lines.push(`## ${heading}`);
    lines.push("");
    for (const [name, info] of rows.sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`### \`${name}\``);
      lines.push("");
      lines.push(`- Severity: ${info.severity ?? "unknown"}`);
      lines.push(`- Installed vulnerable range: \`${info.range ?? "unknown"}\``);
      lines.push(`- Fix: ${fixText(info)}`);
      const titles = advisorySummary(info);
      if (titles.length) lines.push(`- Advisories: ${titles.join("; ")}`);
      const paths = explain(name);
      if (paths.length) {
        lines.push("- Dependency paths:");
        for (const path of paths) lines.push(`  - \`${path}\``);
      }
      lines.push("");
    }
  }

  lines.push("## Policy");
  lines.push("");
  lines.push("- Patch/minor Dependabot PRs are validated and merged automatically.");
  lines.push("- Major updates and dependency-graph blockers stay visible here for deliberate remediation.");
  lines.push("- This issue closes automatically when no manual blockers remain.");
}

process.stdout.write(lines.join("\n") + "\n");
