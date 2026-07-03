#!/usr/bin/env python3
"""Flattens the skill's knowledge files into one system prompt per skill.

Reads skill-reading-order.json (the shared manifest: core files + per-skill
content-type file, in the order SKILL.md tells the AI to read them) and
writes bd-skill-content/flattened/{skill}.system.md. prompts/ is excluded
by design — those are customer-facing sample prompts, not system-prompt
content.

Usage (from the repo root):
  python scripts/flatten.py           regenerate flattened/
  python scripts/flatten.py --check   drift-check: fail (exit 1) if any
                                      flattened file is stale vs. the
                                      loose sources

Output is deterministic (CRLF normalized to LF, one trailing newline per
section) so --check is a meaningful byte-compare and git diffs are clean.
"""
import json
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "bd-skill-content"
OUT_DIR = SRC / "flattened"
MANIFEST = Path(__file__).resolve().parent / "skill-reading-order.json"
DIVIDER = "===== FILE: {path} ====="
REF_RE = re.compile(r"(?:\.\./)?((?:shared|content-types)/[\w.-]+\.md)")


def read_section(rel_path):
    path = SRC / rel_path
    if not path.is_file():
        sys.exit(f"ERROR: manifest references missing file: {rel_path}")
    text = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
    if rel_path == "SKILL.md" and text.startswith("---\n"):
        # Strip the claude.ai loader frontmatter (name/description block).
        end = text.find("\n---\n", 4)
        if end != -1:
            text = text[end + len("\n---\n"):]
    return DIVIDER.format(path=rel_path) + "\n\n" + text.strip("\n") + "\n"


def check_refs(skill, paths, sections):
    included = set(paths)
    dangling = set()
    for path, text in zip(paths, sections):
        for ref in REF_RE.findall(text):
            # SKILL.md's routing table names every content-type by design.
            if path == "SKILL.md" and ref.startswith("content-types/"):
                continue
            if ref not in included:
                dangling.add(ref)
    if dangling:
        sys.exit(
            f"ERROR: {skill} blob references files it does not inline: "
            + ", ".join(sorted(dangling))
        )


def flatten(manifest):
    out = {}
    for skill, files in manifest["skills"].items():
        paths = manifest["core_order"] + files
        sections = [read_section(p) for p in paths]
        check_refs(skill, paths, sections)
        out[skill] = "\n".join(sections)
    return out


def main():
    check = "--check" in sys.argv[1:]
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8-sig"))
    flattened = flatten(manifest)
    expected = {f"{skill}.system.md" for skill in flattened}
    orphans = sorted(
        p.name for p in OUT_DIR.glob("*.system.md") if p.name not in expected
    )

    if check:
        stale = []
        for skill, text in flattened.items():
            target = OUT_DIR / f"{skill}.system.md"
            if not target.is_file() or target.read_bytes() != text.encode("utf-8"):
                stale.append(skill)
        if stale or orphans:
            msg = "DRIFT:"
            if stale:
                msg += " stale for: " + ", ".join(stale) + "."
            if orphans:
                msg += " orphaned (not in manifest): " + ", ".join(orphans) + "."
            sys.exit(msg + "\nRun: python scripts/flatten.py")
        print(f"OK: flattened/ is current ({len(flattened)} skills)")
        return

    OUT_DIR.mkdir(exist_ok=True)
    for name in orphans:
        (OUT_DIR / name).unlink()
        print(f"removed orphan: flattened/{name}")
    for skill, text in flattened.items():
        target = OUT_DIR / f"{skill}.system.md"
        with open(target, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print(f"{target.relative_to(SRC)}  {len(text):,} chars  ~{len(text) // 4:,} tokens")


if __name__ == "__main__":
    main()
