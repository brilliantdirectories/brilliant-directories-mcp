"""Reference-resolution battery: every cross-reference in the skill sources must
resolve to an existing heading (exact, prefix, or substring per corpus convention).
Also verifies the flattened outputs carry the same headings."""
import re, sys, os

ROOT = r"c:\Users\Jason\Desktop\CursorProjects\TESTBASH\bd-cursor-config\brilliant-directories-mcp\bd-skill-content"
SOURCES = ["SKILL.md", "shared/METHODOLOGY.md", "shared/ANTI-SLOP.md", "shared/URL-PATTERNS.md",
           "shared/GEOCODING.md", "content-types/blog.md", "content-types/events.md", "content-types/jobs.md"]
FLATTENED = ["flattened/blog.system.md", "flattened/events.system.md", "flattened/jobs.system.md"]

def headings(text):
    hs = set()
    for m in re.finditer(r"^#{1,6}\s+(.+?)\s*$", text, re.M):
        h = m.group(1).strip()
        hs.add(h)
        hs.add(re.sub(r"^Rule:\s*", "", h))  # Rule: X also referenced as bare X
    # bold grep-able labels ("**How to apply** - ...") are valid targets per corpus convention
    for m in re.finditer(r"^\*\*([^*]+?)\*\*\s+[-—]", text, re.M):
        hs.add(m.group(1).strip())
    return hs

def refs(text, fname):
    out = []
    for m in re.finditer(r"METHODOLOGY\s+`([^`]+)`", text):
        out.append((fname, "METHODOLOGY `%s`" % m.group(1), m.group(1)))
    for m in re.finditer(r"\*\*Rule:\s*([^*]+?)\*\*", text):
        out.append((fname, "**Rule: %s**" % m.group(1), "Rule: " + m.group(1).strip()))
    for m in re.finditer(r"per\s+`([^`]+)`", text):
        out.append((fname, "per `%s`" % m.group(1), m.group(1)))
    for m in re.finditer(r"the\s+`([^`]+)`\s+section", text):
        out.append((fname, "the `%s` section" % m.group(1), m.group(1)))
    for m in re.finditer(r"[Ss]ee\s+(?:the\s+)?`([^`]+)`", text):
        out.append((fname, "see `%s`" % m.group(1), m.group(1)))
    return out

# Known non-heading backtick targets: tool names, params, files, field names.
NONHEADING = re.compile(r"<name>|\.md$|^(list|get|create|update|delete|search|verify|login|render|refresh|match)[A-Z]|"
                        r"^(data_|post_|property|order_|limit|page|user_id|type_of_feature|system_name|form_name|feature_categories|is_default|--|/|content-types/|shared/|prompts/|mcp__|auto_image_import|next_page|shortfall_reason|Topic/nuance|Current UTC datetime|<|\d)", re.I)

all_heads = set()
texts = {}
for f in SOURCES:
    t = open(os.path.join(ROOT, f), encoding="utf-8").read()
    texts[f] = t
    all_heads |= headings(t)

failures, checked = [], 0
for f, label, target in [r for f in SOURCES for r in refs(texts[f], f)]:
    t = target.strip()
    if NONHEADING.search(t):
        continue  # tool/param/file reference, not a section reference
    checked += 1
    ok = any(h == t or h.startswith(t) or t in h for h in all_heads)
    if not ok:
        failures.append((f, label))

print("headings indexed: %d | section-references checked: %d" % (len(all_heads), checked))
for f, label in failures:
    print("  UNRESOLVED  %s -> %s" % (f, label))
if not failures:
    print("  ALL SECTION REFERENCES RESOLVE")

# flattened parity: every source heading must appear in at least one flattened file
flat = " ".join(open(os.path.join(ROOT, f), encoding="utf-8").read() for f in FLATTENED)
missing = [h for h in sorted(all_heads) if ("# " + h) not in flat and h not in flat]
print("flattened carries all headings:" , "YES" if not missing else "MISSING: %s" % missing[:5])
sys.exit(1 if failures or missing else 0)
