"""Generate StudyBlock app icons (PNG + SVG) using only the Python standard library.

Usage (from the repo root):
    py tools/make_icons.py

Writes only inside icons/:
    icon-192.png, icon-512.png        rounded accent square, transparent corners (purpose "any")
    icon-maskable-512.png             full-bleed accent, logo inside the 80% safe zone (purpose "maskable")
    apple-touch-icon.png              180x180, full-bleed (iOS rounds the corners itself)
    icon.svg                          same drawing, viewBox 0 0 512 512

The logo: three white rounded blocks on the accent square
(bottom-left solid, bottom-right 70% opacity, top-centre 45% opacity).

Accent = default purple oklch(0.50 0.16 300) converted to sRGB = #7347AF.
"""

import math
import os
import struct
import zlib

ACCENT = (0x73, 0x47, 0xAF)  # sRGB of oklch(0.50 0.16 300)
ACCENT_HEX = "#7347AF"
WHITE = (255, 255, 255)

# Geometry in a 512x512 design space.
SQUARE = (0, 0, 512, 512)
SQUARE_RADIUS = 112
BLOCK_RADIUS = 22
# (x0, y0, x1, y1, opacity)
BLOCKS = [
    (120, 268, 244, 392, 1.00),  # bottom-left, solid
    (268, 268, 392, 392, 0.70),  # bottom-right
    (194, 120, 318, 244, 0.45),  # top-centre
]

SS = 4  # supersampling grid per axis for edge pixels

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "icons")


def rrect_sdf(px, py, rect, r):
    """Signed distance from point to a rounded rectangle (negative inside)."""
    x0, y0, x1, y1 = rect
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    hx, hy = (x1 - x0) / 2.0 - r, (y1 - y0) / 2.0 - r
    qx, qy = abs(px - cx) - hx, abs(py - cy) - hy
    ox, oy = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ox, oy) + min(max(qx, qy), 0.0) - r


def coverage(px, py, rect, r, scale):
    """Coverage (0..1) of the output pixel (px, py) by a shape given in design units.

    `scale` = design units per output pixel. Pixels clearly inside/outside are decided
    from the SDF at the centre; edge pixels are supersampled SS x SS.
    """
    cx, cy = (px + 0.5) * scale, (py + 0.5) * scale
    d = rrect_sdf(cx, cy, rect, r)
    margin = scale * 0.75  # > half-diagonal of a pixel (0.707 px)
    if d <= -margin:
        return 1.0
    if d >= margin:
        return 0.0
    hits = 0
    for j in range(SS):
        sy = (py + (j + 0.5) / SS) * scale
        for i in range(SS):
            sx = (px + (i + 0.5) / SS) * scale
            if rrect_sdf(sx, sy, rect, r) <= 0.0:
                hits += 1
    return hits / float(SS * SS)


def transform_rect(rect, k):
    """Scale a rect about the design centre (256, 256)."""
    x0, y0, x1, y1 = rect
    return (256 + (x0 - 256) * k, 256 + (y0 - 256) * k, 256 + (x1 - 256) * k, 256 + (y1 - 256) * k)


def render(size, full_bleed, logo_scale):
    """Return RGBA bytes rows for one icon."""
    scale = 512.0 / size
    blocks = [(transform_rect(b[:4], logo_scale), b[4]) for b in BLOCKS]
    block_r = BLOCK_RADIUS * logo_scale
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            if full_bleed:
                a = 1.0
            else:
                a = coverage(px, py, SQUARE, SQUARE_RADIUS, scale)
            r, g, b = (float(c) for c in ACCENT)
            # Composite white blocks "over" the accent (straight alpha).
            for rect, opacity in blocks:
                c = coverage(px, py, rect, block_r, scale) * opacity
                if c <= 0.0:
                    continue
                out_a = c + a * (1.0 - c)
                if out_a <= 0.0:
                    continue
                r = (WHITE[0] * c + r * a * (1.0 - c)) / out_a
                g = (WHITE[1] * c + g * a * (1.0 - c)) / out_a
                b = (WHITE[2] * c + b * a * (1.0 - c)) / out_a
                a = out_a
            if a <= 0.0:
                row += b"\x00\x00\x00\x00"
            else:
                row += bytes((int(round(r)), int(round(g)), int(round(b)), int(round(a * 255))))
        rows.append(bytes(row))
    return rows


def png_bytes(size, rows):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + r for r in rows)  # filter type 0 per scanline
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def svg_text():
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">',
        '  <rect x="0" y="0" width="512" height="512" rx="%d" fill="%s"/>' % (SQUARE_RADIUS, ACCENT_HEX),
    ]
    for x0, y0, x1, y1, op in BLOCKS:
        attr = "" if op >= 1 else ' fill-opacity="%g"' % op
        parts.append(
            '  <rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="#FFFFFF"%s/>'
            % (x0, y0, x1 - x0, y1 - y0, BLOCK_RADIUS, attr)
        )
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def write(name, data):
    path = os.path.join(OUT_DIR, name)
    mode = "wb" if isinstance(data, bytes) else "w"
    kwargs = {} if mode == "wb" else {"encoding": "utf-8", "newline": "\n"}
    with open(path, mode, **kwargs) as f:
        f.write(data)
    print("wrote", os.path.relpath(path, ROOT))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    specs = [
        ("icon-192.png", 192, False, 1.0),
        ("icon-512.png", 512, False, 1.0),
        ("icon-maskable-512.png", 512, True, 0.8),  # logo within the 80% safe zone
        ("apple-touch-icon.png", 180, True, 0.9),
    ]
    for name, size, bleed, k in specs:
        write(name, png_bytes(size, render(size, bleed, k)))
    write("icon.svg", svg_text())
    print("accent", ACCENT_HEX)


if __name__ == "__main__":
    main()
