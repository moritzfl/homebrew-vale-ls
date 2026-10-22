#!/usr/bin/env bun
/**
 * Sync Homebrew tap formulae with GitHub releases.
 *
 * Usage:
 *   bun scripts/sync-tap.ts                # update formulae
 *   bun scripts/sync-tap.ts --prune        # also delete stale versioned formulae
 *   bun scripts/sync-tap.ts --check        # exit 1 when the tap drifts from upstream
 *   bun scripts/sync-tap.ts --dry-run      # print actions without writing files
 */

import { createHash } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const FORMULA_NAME = "vale-ls";
const DEFAULT_REPO = "errata-ai/vale-ls";
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TEMPLATE_PATH = join(ROOT, "scripts", "formula.rb.tmpl");
const FORMULA_DIR = join(ROOT, "Formula");

const ASSETS = {
  macos_arm: "vale-ls-aarch64-apple-darwin.zip",
  macos_x86: "vale-ls-x86_64-apple-darwin.zip",
  linux_arm: "vale-ls-aarch64-unknown-linux-gnu.zip",
  linux_x86: "vale-ls-x86_64-unknown-linux-gnu.zip",
} as const;

type Target = keyof typeof ASSETS;
const TARGETS = Object.keys(ASSETS) as Target[];

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;

const LIVE_CHECK_BLOCK = `  livecheck do
    url :stable
    strategy :github_latest
  end
`;

const KEG_ONLY_BLOCK = `  keg_only :versioned_formula
`;

interface Options {
  repo: string;
  includePrereleases: boolean;
  prune: boolean;
  dryRun: boolean;
  check: boolean;
}

type Version = [number, number, number];

interface Release {
  version: Version;
  tag: string;
  assets: Record<Target, string>;
  sha256: Partial<Record<Target, string>>;
}

interface PlannedFormula {
  path: string;
  label: string;
  content: string;
}

function parseOptions(): Options | null {
  const { values } = parseArgs({
    options: {
      repo: { type: "string", default: DEFAULT_REPO },
      "include-prereleases": { type: "boolean", default: false },
      prune: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      check: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(
      "Usage: bun scripts/sync-tap.ts [--repo owner/name] [--include-prereleases]\n" +
        "                              [--prune] [--dry-run] [--check]",
    );
    return null;
  }

  return {
    repo: values.repo as string,
    includePrereleases: values["include-prereleases"] as boolean,
    prune: values.prune as boolean,
    dryRun: values["dry-run"] as boolean,
    check: values.check as boolean,
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
    redirect: "follow",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error ${response.status} for ${url}: ${body}`);
  }
  return response.json();
}

async function* listReleases(repo: string): AsyncGenerator<Record<string, unknown>> {
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`;
    const payload = await fetchJson(url);
    if (!Array.isArray(payload)) {
      throw new Error("Unexpected GitHub API response.");
    }
    if (payload.length === 0) {
      return;
    }
    for (const item of payload) {
      yield item as Record<string, unknown>;
    }
  }
}

function parseRelease(raw: Record<string, unknown>, includePrereleases: boolean): Release | null {
  if (!includePrereleases && (raw.draft || raw.prerelease)) {
    return null;
  }

  const tag = raw.tag_name;
  if (typeof tag !== "string") {
    return null;
  }

  const match = SEMVER_RE.exec(tag);
  if (!match) {
    return null;
  }

  const version: Version = [Number(match[1]), Number(match[2]), Number(match[3])];
  const assets = {} as Record<Target, string>;
  const rawAssets = Array.isArray(raw.assets) ? raw.assets : [];

  for (const asset of rawAssets as Array<Record<string, unknown>>) {
    const name = asset.name;
    const url = asset.browser_download_url;
    if (typeof name !== "string" || typeof url !== "string") {
      continue;
    }
    const target = TARGETS.find((key) => ASSETS[key] === name);
    if (target) {
      assets[target] = url;
    }
  }

  const missing = TARGETS.filter((key) => !assets[key]);
  if (missing.length > 0) {
    console.error(`Skipping ${tag}: missing assets ${missing.map((key) => ASSETS[key]).join(", ")}`);
    return null;
  }

  return { version, tag, assets, sha256: {} };
}

async function sha256OfUrl(url: string): Promise<string> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  const hasher = createHash("sha256");
  for await (const chunk of response.body) {
    hasher.update(chunk);
  }
  return hasher.digest("hex");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Reuse checksums of an already generated formula when it pins the same version,
 * so incremental syncs (and the weekly drift check) only download missing releases.
 */
async function cachedSha256(path: string, version: Version): Promise<Record<Target, string> | null> {
  if (!existsSync(path)) {
    return null;
  }
  const content = await readFile(path, "utf8");
  const pinned = /^ {2}version "([^"]+)"$/m.exec(content);
  if (pinned?.[1] !== version.join(".")) {
    return null;
  }

  const sha256 = {} as Record<Target, string>;
  for (const target of TARGETS) {
    const pattern = new RegExp(
      `url "[^"]*${escapeRegExp(ASSETS[target])}"\\s*\\n\\s*sha256 "([0-9a-f]{64})"`,
    );
    const match = pattern.exec(content);
    if (!match) {
      return null;
    }
    sha256[target] = match[1];
  }
  return sha256;
}

async function fillSha256(release: Release): Promise<Record<Target, string>> {
  const version = release.version.join(".");
  const cached = await cachedSha256(join(FORMULA_DIR, `${FORMULA_NAME}@${version}.rb`), release.version);
  if (cached) {
    release.sha256 = cached;
    return cached;
  }

  console.error(`Computing sha256 for ${release.tag}`);
  for (const target of TARGETS) {
    release.sha256[target] = await sha256OfUrl(release.assets[target]);
  }
  return release.sha256 as Record<Target, string>;
}

const liveCheckMinorBlock = (repo: string, major: number, minor: number) => `  livecheck do
    url "https://github.com/${repo}/releases"
    strategy :github_releases
    regex(/^v?${major}\\.${minor}\\.\\d+$/i)
  end
`;

interface FormulaSpec {
  className: string;
  version: Version;
  sha256: Record<Target, string>;
  livecheck: string;
  kegOnly: boolean;
}

function buildFormula(template: string, repo: string, spec: FormulaSpec): string {
  const replacements: Record<string, string> = {
    class_name: spec.className,
    repo,
    version: spec.version.join("."),
    live_check: spec.livecheck.replace(/\n+$/, ""),
    keg_only: (spec.kegOnly ? KEG_ONLY_BLOCK : "").replace(/\n+$/, ""),
    sha_mac_arm: spec.sha256.macos_arm,
    sha_mac_x86: spec.sha256.macos_x86,
    sha_linux_arm: spec.sha256.linux_arm,
    sha_linux_x86: spec.sha256.linux_x86,
  };

  let rendered = template;
  for (const [key, value] of Object.entries(replacements)) {
    rendered = rendered.split("${" + key + "}").join(value);
  }

  return rendered.replaceAll("\n\n\n", "\n\n").replace(/\s+$/, "") + "\n";
}

async function planFormulae(
  template: string,
  opts: Options,
  releases: Release[],
): Promise<PlannedFormula[]> {
  const byVersion = new Map<string, Release>();
  for (const release of releases) {
    byVersion.set(release.version.join("."), release);
  }

  const selected = [...byVersion.values()].sort((a, b) => compareVersions(a.version, b.version));
  const latest = selected[selected.length - 1];

  const byMinor = new Map<string, Release>();
  for (const release of selected) {
    const key = `${release.version[0]}.${release.version[1]}`;
    const current = byMinor.get(key);
    if (!current || compareVersions(release.version, current.version) > 0) {
      byMinor.set(key, release);
    }
  }

  console.log(
    `Selected ${selected.length} releases, latest is ${latest.version.join(".")}. ` +
      `Generating ${byMinor.size} minor aliases.`,
  );

  for (const release of selected) {
    await fillSha256(release);
  }

  const planned: PlannedFormula[] = [];

  planned.push({
    path: join(FORMULA_DIR, `${FORMULA_NAME}.rb`),
    label: `${FORMULA_NAME}.rb`,
    content: buildFormula(template, opts.repo, {
      className: "ValeLs",
      version: latest.version,
      sha256: latest.sha256 as Record<Target, string>,
      livecheck: LIVE_CHECK_BLOCK,
      kegOnly: false,
    }),
  });

  for (const release of [...byMinor.values()].sort((a, b) => compareVersions(a.version, b.version))) {
    const [major, minor] = release.version;
    planned.push({
      path: join(FORMULA_DIR, `${FORMULA_NAME}@${major}.${minor}.rb`),
      label: `${FORMULA_NAME}@${major}.${minor}.rb`,
      content: buildFormula(template, opts.repo, {
        className: `ValeLsAT${major}${minor}`,
        version: release.version,
        sha256: release.sha256 as Record<Target, string>,
        livecheck: liveCheckMinorBlock(opts.repo, major, minor),
        kegOnly: true,
      }),
    });
  }

  for (const release of selected) {
    const [major, minor, patch] = release.version;
    planned.push({
      path: join(FORMULA_DIR, `${FORMULA_NAME}@${major}.${minor}.${patch}.rb`),
      label: `${FORMULA_NAME}@${major}.${minor}.${patch}.rb`,
      content: buildFormula(template, opts.repo, {
        className: `ValeLsAT${major}${minor}${patch}`,
        version: release.version,
        sha256: release.sha256 as Record<Target, string>,
        livecheck: "",
        kegOnly: true,
      }),
    });
  }

  return planned;
}

function compareVersions(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

async function readFormula(path: string): Promise<string | null> {
  if (!existsSync(path)) {
    return null;
  }
  return readFile(path, "utf8");
}

async function writePlan(planned: PlannedFormula[], opts: Options): Promise<void> {
  for (const formula of planned) {
    const current = await readFormula(formula.path);
    if (current === formula.content) {
      continue;
    }
    if (opts.dryRun) {
      console.log(`Would write ${formula.path}`);
    } else {
      await writeFile(formula.path, formula.content, "utf8");
      console.log(`Wrote ${formula.path}`);
    }
  }
}

async function versionedFormulae(): Promise<string[]> {
  if (!existsSync(FORMULA_DIR)) {
    return [];
  }
  const entries = await readdir(FORMULA_DIR);
  return entries.filter((name) => name.startsWith(`${FORMULA_NAME}@`) && name.endsWith(".rb"));
}

async function prunePlan(
  planned: PlannedFormula[],
  opts: Options,
): Promise<string[]> {
  const keep = new Set(planned.map((formula) => basename(formula.path)));
  const removed: string[] = [];

  for (const name of await versionedFormulae()) {
    if (keep.has(name)) {
      continue;
    }
    const path = join(FORMULA_DIR, name);
    if (opts.dryRun) {
      console.log(`Would delete ${path}`);
    } else {
      await unlink(path);
      console.log(`Deleted ${path}`);
    }
    removed.push(name);
  }

  return removed;
}

function appendStepSummary(lines: string[]): void {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) {
    return;
  }
  try {
    appendFileSync(target, lines.join("\n") + "\n");
  } catch {
    // Step summaries are cosmetic; never fail the check because of them.
  }
}

async function runCheck(planned: PlannedFormula[]): Promise<number> {
  const drift: string[] = [];

  for (const formula of planned) {
    const current = await readFormula(formula.path);
    if (current === null) {
      drift.push(`missing \`${formula.label}\``);
    } else if (current !== formula.content) {
      drift.push(`outdated \`${formula.label}\``);
    }
  }

  const keep = new Set(planned.map((formula) => basename(formula.path)));
  for (const name of await versionedFormulae()) {
    if (!keep.has(name)) {
      drift.push(`orphaned \`${name}\``);
    }
  }

  if (drift.length === 0) {
    console.log("Tap is in sync with upstream releases.");
    appendStepSummary(["### vale-ls tap is in sync", "", "No missing or outdated formulae."]);
    return 0;
  }

  console.error(`Tap drifted from upstream releases (${drift.length}):`);
  for (const entry of drift) {
    console.error(`  - ${entry}`);
  }
  console.error("Run `bun scripts/sync-tap.ts --prune` and commit the result.");

  appendStepSummary([
    "### vale-ls tap drifted from upstream releases",
    "",
    ...drift.map((entry) => `- ${entry}`),
    "",
    "Run `bun scripts/sync-tap.ts --prune` and commit the result.",
  ]);

  return 1;
}

async function main(): Promise<number> {
  const opts = parseOptions();
  if (!opts) {
    return 0;
  }

  if (!existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template not found: ${TEMPLATE_PATH}`);
  }
  const template = await readFile(TEMPLATE_PATH, "utf8");

  const releases: Release[] = [];
  for await (const raw of listReleases(opts.repo)) {
    const release = parseRelease(raw, opts.includePrereleases);
    if (release) {
      releases.push(release);
    }
  }

  if (releases.length === 0) {
    throw new Error("No valid releases found.");
  }

  await mkdir(FORMULA_DIR, { recursive: true });
  const planned = await planFormulae(template, opts, releases);

  if (opts.check) {
    return runCheck(planned);
  }

  await writePlan(planned, opts);

  if (opts.prune) {
    await prunePlan(planned, opts);
  }

  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
