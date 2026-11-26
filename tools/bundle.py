#!/usr/bin/env python3
"""Build dist/studyblock.html: StudyBlock as one file that opens by double-click (file://).

Usage (from anywhere):  py tools/bundle.py

How it works
- css/style.css is inlined into a <style> tag.
- Every js/**/*.js and modules/**/*.js becomes a data: URL in an import map, keyed by the
  specifier "sb:/<path>". Relative import specifiers ("./x.js", "../lib/y.js") in those files are
  rewritten to "sb:/<resolved path>", since relative URLs can't resolve inside data: modules.
- Only module folders listed in a domain of modules/index.json, plus the role-only modules named
  as "exclusive" by a role listed in roles/index.json, are bundled; archived or unlisted folders
  are skipped (and named in the summary line).
- Non-JS data (modules/**/*.json|csv|md, presets/**/*.json, roles/**/*.json) is embedded as text in
  window.__SB_BUNDLE__ = { files: { "<path>": "<text>" } }, read by js/lib/source.js.
- The app's module script tag is replaced by an inline `import "sb:/js/app.js";`.
- Lucide is inlined only if vendor/lucide.min.js exists; otherwise the CDN tag stays
  (icons then need internet; the app works without them).
- PWA bits (manifest link, service worker) are left out: they can't work on file://.

Standard library only. Writes only inside dist/. Output is deterministic (sorted, no timestamps).
"""

import base64
import json
import posixpath
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
OUT = DIST / "studyblock.html"

DATA_EXTS = {".json", ".csv", ".md"}
MODULE_EXTS = DATA_EXTS | {".js"}
PATH_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]*(/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$")

# Static and dynamic import specifiers written as string literals:
#   import x from './a.js' | import './a.js' | export { x } from './a.js' | import('./a.js')
IMPORT_RE = re.compile(
    r"""(?P<pre>\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(?P<q>['"])(?P<spec>[^'"\n]+)(?P=q)"""
)


def fail(msg):
    print(f"bundle.py: error: {msg}", file=sys.stderr)
    sys.exit(1)


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def read_text(p: Path) -> str:
    try:
        return p.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        fail(f"{rel(p)} is not valid UTF-8")


ID_RE = re.compile(r"^[a-z0-9-]+$")


def listed_modules():
    """Module ids listed in some domain of modules/index.json (archived or unlisted folders are skipped)."""
    try:
        idx = json.loads(read_text(ROOT / "modules" / "index.json"))
    except (OSError, ValueError) as e:
        fail(f"modules/index.json could not be read: {e}")
    ids = set()
    domains = idx.get("domains") if isinstance(idx, dict) else None
    if isinstance(domains, list):
        for d in domains:
            mods = d.get("modules") if isinstance(d, dict) else None
            for mid in mods if isinstance(mods, list) else []:
                if isinstance(mid, str) and ID_RE.match(mid):
                    ids.add(mid)
    elif isinstance(idx, dict) and isinstance(idx.get("modules"), list):  # legacy flat registry
        ids = {m for m in idx["modules"] if isinstance(m, str) and ID_RE.match(m)}
    return ids


def role_modules():
    """Role-only module ids: the "exclusive" of each role listed in roles/index.json."""
    try:
        idx = json.loads(read_text(ROOT / "roles" / "index.json"))
    except (OSError, ValueError):
        return set()
    ids = set()
    for rid in idx.get("roles", []) if isinstance(idx, dict) and isinstance(idx.get("roles"), list) else []:
        if not (isinstance(rid, str) and ID_RE.match(rid)):
            continue
        try:
            role = json.loads(read_text(ROOT / "roles" / f"{rid}.json"))
        except (OSError, ValueError):
            continue
        ex = role.get("exclusive") if isinstance(role, dict) else None
        if isinstance(ex, str) and ID_RE.match(ex) and (ROOT / "modules" / ex).is_dir():
            ids.add(ex)
    return ids


def collect():
    """Returns (js_paths, data_paths, skipped_dirs): sorted root-relative posix paths, and the
    module folders left out because no domain lists them (e.g. archived modules)."""
    js, data = set(), set()
    for p in (ROOT / "js").rglob("*.js"):
        if p.is_file():
            js.add(rel(p))
    listed = listed_modules() | role_modules()
    skipped = set()
    for p in (ROOT / "modules").rglob("*"):
        if p.is_file() and p.suffix.lower() in MODULE_EXTS:
            parts = p.relative_to(ROOT / "modules").parts
            # Files directly under modules/ (index.json) always; modules/<id>/... only when listed.
            if len(parts) > 1 and parts[0] not in listed:
                skipped.add(parts[0])
                continue
            (js if p.suffix.lower() == ".js" else data).add(rel(p))
    for folder in ("presets", "roles"):
        for p in (ROOT / folder).rglob("*.json"):
            if p.is_file():
                data.add(rel(p))
    for path in js | data:
        if not PATH_RE.match(path) or ".." in path:
            fail(f"unsupported file name: {path}")
    return sorted(js), sorted(data), sorted(skipped)


def rewrite_imports(path: str, src: str, js_set: set) -> str:
    base = posixpath.dirname(path)

    def repl(m):
        spec = m.group("spec")
        if spec.startswith("sb:/"):
            target = spec[4:]
        elif spec.startswith("./") or spec.startswith("../"):
            target = posixpath.normpath(posixpath.join(base, spec))
        elif spec.startswith("/") or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", spec):
            fail(f"{path}: absolute import specifier {spec!r} is not allowed (use a relative path)")
        else:
            return m.group(0)  # bare specifier: leave to the import map / browser
        if target.startswith("../") or target == ".." or target not in js_set:
            fail(f"{path}: import {spec!r} resolves to {target!r}, which is not a bundled JS file")
        q = m.group("q")
        return f"{m.group('pre')}{q}sb:/{target}{q}"

    return IMPORT_RE.sub(repl, src)


def script_safe_json(obj) -> str:
    # ensure_ascii escapes U+2028/2029; "<" -> < keeps "</script" and "<!--" out of the tag.
    return json.dumps(obj, sort_keys=True, ensure_ascii=True, separators=(",", ":")).replace("<", "\\u003c")


def replace_once(html: str, pattern: str, replacement, what: str, flags=0) -> str:
    rx = re.compile(pattern, flags)
    found = rx.findall(html)
    if len(found) != 1:
        fail(f"index.html: expected exactly one {what}, found {len(found)}")
    return rx.sub(lambda m: replacement, html, count=1)


MIME = {".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp"}


def inline_icon_links(html: str) -> str:
    """Relative <link rel="...icon..." href="..."> become data: URLs (or are dropped if missing)."""

    def repl(m):
        tag = m.group(0)
        if not re.search(r"""\brel\s*=\s*["'][^"']*icon[^"']*["']""", tag, re.I):
            return tag
        hm = re.search(r"""\bhref\s*=\s*["']([^"']+)["']""", tag, re.I)
        if not hm:
            return tag
        href = hm.group(1)
        if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", href) or href.startswith("//"):
            return tag
        p = (ROOT / href).resolve()
        mime = MIME.get(p.suffix.lower())
        if not mime or ROOT not in p.parents or not p.is_file():
            return ""
        uri = f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode('ascii')}"
        return tag[: hm.start(1)] + uri + tag[hm.end(1):]

    return re.sub(r"<link\b[^>]*>", repl, html, flags=re.I)


def main():
    index = ROOT / "index.html"
    css = ROOT / "css" / "style.css"
    if not index.is_file() or not css.is_file():
        fail("run from a StudyBlock checkout (index.html and css/style.css are required)")

    js_paths, data_paths, skipped = collect()
    if "js/app.js" not in js_paths:
        fail("js/app.js not found")
    js_set = set(js_paths)

    imports = {}
    for path in js_paths:
        src = rewrite_imports(path, read_text(ROOT / path), js_set)
        src += f"\n//# sourceURL=sb:/{path}\n"
        b64 = base64.b64encode(src.encode("utf-8")).decode("ascii")
        imports[f"sb:/{path}"] = f"data:text/javascript;base64,{b64}"

    files = {path: read_text(ROOT / path) for path in data_paths}

    html = read_text(index)

    css_text = read_text(css)
    if re.search(r"</style", css_text, re.I):
        fail("css/style.css contains '</style'")
    html = replace_once(
        html, r'<link\s+rel="stylesheet"\s+href="css/style\.css"\s*/?>',
        f"<style>\n{css_text}\n</style>", "css/style.css stylesheet link")

    # PWA: no manifest or service worker on file://.
    html = re.sub(r'[ \t]*<link\b[^>]*\brel\s*=\s*["\']manifest["\'][^>]*>\r?\n?', "", html, flags=re.I)
    html = inline_icon_links(html)

    lucide_rx = r'<script\s+src="(?:https://unpkg\.com/lucide@[^"]+|vendor/lucide\.min\.js)"\s*>\s*</script>'
    vendor = ROOT / "vendor" / "lucide.min.js"
    lucide_note = "CDN (icons need internet)"
    if vendor.is_file():
        lucide = re.sub(r"</(script)", r"<\\/\1", read_text(vendor), flags=re.I)
        html = replace_once(html, lucide_rx, f"<script>\n{lucide}\n</script>", "Lucide script tag")
        lucide_note = "inlined from vendor/lucide.min.js"
    elif not re.search(lucide_rx, html):
        lucide_note = "not referenced"

    boot = (
        "<script>window.__SB_BUNDLE__ = Object.freeze({ files: Object.freeze("
        + script_safe_json(files)
        + ") });</script>\n"
        + '  <script type="importmap">' + script_safe_json({"imports": imports}) + "</script>\n"
        + '  <script type="module">import "sb:/js/app.js";</script>'
    )
    html = replace_once(html, r'<script\s+type="module"\s+src="js/app\.js"\s*>\s*</script>', boot,
                        "js/app.js module script tag")

    # Anything still pointing at a local file won't load from file://.
    for m in re.finditer(r"""\b(?:src|href)\s*=\s*["']([^"']+)["']""", html):
        url = m.group(1)
        if url.startswith(("#", "data:", "http:", "https:", "mailto:", "//")):
            continue
        print(f"bundle.py: warning: local reference left in HTML: {url}", file=sys.stderr)

    DIST.mkdir(exist_ok=True)
    out_bytes = html.encode("utf-8")
    with open(OUT, "wb") as f:
        f.write(out_bytes)

    print(f"Wrote {rel(OUT)}: {len(js_paths)} JS modules, {len(data_paths)} data files, "
          f"{len(out_bytes) / 1024:.1f} KiB. Lucide: {lucide_note}.")
    if skipped:
        print(f"Skipped {len(skipped)} module folder(s) not listed in any domain: {', '.join(skipped)}")


if __name__ == "__main__":
    main()
