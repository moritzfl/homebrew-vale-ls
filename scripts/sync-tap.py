#!/usr/bin/env python3
"""Sync Homebrew tap formulae with GitHub releases."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from string import Template
from typing import Dict, Iterable, List, Optional, Tuple

FORMULA_NAME = "vale-ls"

ASSET_NAMES = {
    "macos_arm": "vale-ls-aarch64-apple-darwin.zip",
    "macos_x86": "vale-ls-x86_64-apple-darwin.zip",
    "linux_arm": "vale-ls-aarch64-unknown-linux-gnu.zip",
    "linux_x86": "vale-ls-x86_64-unknown-linux-gnu.zip",
}

SEMVER_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")

LIVE_CHECK_BLOCK = """  livecheck do
    url :stable
    strategy :github_latest
  end
"""

LIVE_CHECK_MINOR_BLOCK = """  livecheck do
    url "https://github.com/{repo}/releases"
    strategy :github_releases
    regex(/^v?{major}\\.{minor}\\.\\d+$/i)
  end
"""

KEG_ONLY_BLOCK = """  keg_only :versioned_formula
"""


class ReleaseInfo:
    def __init__(self, version: Tuple[int, int, int], tag: str, assets: Dict[str, str]):
        self.version = version
        self.tag = tag
        self.assets = assets
        self.sha256: Dict[str, str] = {}

    @property
    def version_str(self) -> str:
        return f"{self.version[0]}.{self.version[1]}.{self.version[2]}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Homebrew formulae for all published vale-ls releases.",
    )
    parser.add_argument(
        "--repo",
        default="errata-ai/vale-ls",
        help="GitHub repo in owner/name form (default: errata-ai/vale-ls)",
    )
    parser.add_argument(
        "--include-prereleases",
        action="store_true",
        help="Include prereleases and drafts",
    )
    parser.add_argument(
        "--prune",
        action="store_true",
        help="Delete versioned formulae not present in GitHub releases",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print actions without writing files",
    )
    return parser.parse_args()


def github_request(url: str) -> urllib.request.Request:
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/vnd.github+json")
    return req


def fetch_json(url: str) -> object:
    req = github_request(url)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"GitHub API error {exc.code} for {url}: {body}") from exc


def iter_releases(repo: str) -> Iterable[dict]:
    page = 1
    while True:
        url = f"https://api.github.com/repos/{repo}/releases?per_page=100&page={page}"
        payload = fetch_json(url)
        if not isinstance(payload, list):
            raise SystemExit("Unexpected GitHub API response.")
        if not payload:
            break
        for item in payload:
            yield item
        page += 1


def parse_release(release: dict, include_prereleases: bool) -> Optional[ReleaseInfo]:
    if not include_prereleases and (release.get("draft") or release.get("prerelease")):
        return None

    tag = release.get("tag_name")
    if not isinstance(tag, str):
        return None

    match = SEMVER_RE.match(tag)
    if not match:
        return None

    version = tuple(int(group) for group in match.groups())

    assets = {}
    for asset in release.get("assets", []):
        name = asset.get("name")
        url = asset.get("browser_download_url")
        if name in ASSET_NAMES.values() and isinstance(url, str):
            assets[name] = url

    missing = [name for name in ASSET_NAMES.values() if name not in assets]
    if missing:
        print(f"Skipping {tag}: missing assets {', '.join(missing)}", file=sys.stderr)
        return None

    return ReleaseInfo(version=version, tag=tag, assets=assets)


def sha256_of_url(url: str) -> str:
    req = github_request(url)
    hasher = hashlib.sha256()
    with urllib.request.urlopen(req, timeout=120) as resp:
        while True:
            chunk = resp.read(1024 * 128)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


def compute_sha256(release: ReleaseInfo) -> None:
    for key, name in ASSET_NAMES.items():
        url = release.assets[name]
        release.sha256[key] = sha256_of_url(url)


def render_from_template(
    template: str,
    replacements: Dict[str, str],
) -> str:
    return Template(template).safe_substitute(replacements)


def build_formula(
    template: str,
    class_name: str,
    version: str,
    sha256: Dict[str, str],
    livecheck_block: str,
    keg_only: bool,
    repo: str,
) -> str:
    livecheck = livecheck_block
    keg_only_block = KEG_ONLY_BLOCK if keg_only else ""

    replacements = {
        "class_name": class_name,
        "repo": repo,
        "version": version,
        "live_check": livecheck.rstrip("\n"),
        "keg_only": keg_only_block.rstrip("\n"),
        "sha_mac_arm": sha256["macos_arm"],
        "sha_mac_x86": sha256["macos_x86"],
        "sha_linux_arm": sha256["linux_arm"],
        "sha_linux_x86": sha256["linux_x86"],
    }

    rendered = render_from_template(template, replacements)
    return rendered.replace("\n\n\n", "\n\n").rstrip() + "\n"


def write_file(path: Path, content: str, dry_run: bool) -> bool:
    if path.exists():
        current = path.read_text(encoding="utf-8")
        if current == content:
            return False
    if dry_run:
        print(f"Would write {path}")
        return True
    path.write_text(content, encoding="utf-8")
    print(f"Wrote {path}")
    return True


def prune_formulas(formula_dir: Path, keep: List[Path], dry_run: bool) -> None:
    keep_set = {path.resolve() for path in keep}
    for path in formula_dir.glob(f"{FORMULA_NAME}@*.rb"):
        if path.resolve() in keep_set:
            continue
        if dry_run:
            print(f"Would delete {path}")
            continue
        path.unlink()
        print(f"Deleted {path}")


def main() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parent.parent
    template_path = root / "scripts" / "formula.rb.tmpl"
    if not template_path.exists():
        raise SystemExit(f"Template not found: {template_path}")
    template = template_path.read_text(encoding="utf-8")

    releases: List[ReleaseInfo] = []
    for raw in iter_releases(args.repo):
        parsed = parse_release(raw, args.include_prereleases)
        if parsed:
            releases.append(parsed)

    if not releases:
        raise SystemExit("No valid releases found.")

    selected_by_version: Dict[Tuple[int, int, int], ReleaseInfo] = {}
    for release in releases:
        selected_by_version[release.version] = release

    selected = sorted(selected_by_version.values(), key=lambda r: r.version)
    latest = max(selected, key=lambda r: r.version)

    selected_by_minor: Dict[Tuple[int, int], ReleaseInfo] = {}
    for release in selected:
        key = (release.version[0], release.version[1])
        current = selected_by_minor.get(key)
        if current is None or release.version > current.version:
            selected_by_minor[key] = release

    print(
        f"Selected {len(selected)} releases, latest is {latest.version_str}. "
        f"Generating {len(selected_by_minor)} minor aliases."
    )

    for release in selected:
        compute_sha256(release)

    formula_dir = root / "Formula"
    formula_dir.mkdir(parents=True, exist_ok=True)

    written: List[Path] = []

    latest_formula = build_formula(
        template=template,
        class_name="ValeLs",
        version=latest.version_str,
        sha256=latest.sha256,
        livecheck_block=LIVE_CHECK_BLOCK,
        keg_only=False,
        repo=args.repo,
    )
    latest_path = formula_dir / f"{FORMULA_NAME}.rb"
    written.append(latest_path)
    write_file(latest_path, latest_formula, args.dry_run)

    for (major, minor), release in sorted(selected_by_minor.items()):
        class_name = f"ValeLsAT{major}{minor}"
        formula_name = f"{FORMULA_NAME}@{major}.{minor}.rb"
        livecheck_block = LIVE_CHECK_MINOR_BLOCK.format(
            repo=args.repo, major=major, minor=minor
        )
        content = build_formula(
            template=template,
            class_name=class_name,
            version=release.version_str,
            sha256=release.sha256,
            livecheck_block=livecheck_block,
            keg_only=True,
            repo=args.repo,
        )
        path = formula_dir / formula_name
        written.append(path)
        write_file(path, content, args.dry_run)

    for release in selected:
        major, minor, patch = release.version
        class_name = f"ValeLsAT{major}{minor}{patch}"
        formula_name = f"{FORMULA_NAME}@{major}.{minor}.{patch}.rb"
        content = build_formula(
            template=template,
            class_name=class_name,
            version=release.version_str,
            sha256=release.sha256,
            livecheck_block="",
            keg_only=True,
            repo=args.repo,
        )
        path = formula_dir / formula_name
        written.append(path)
        write_file(path, content, args.dry_run)

    if args.prune:
        prune_formulas(formula_dir, written, args.dry_run)


if __name__ == "__main__":
    main()
