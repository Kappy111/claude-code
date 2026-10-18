"""Generate the extension's PNG icons (16/32/48/128).

A rounded indigo tile with a simple camera + folder glyph. Run with:
    python3 make_icons.py
"""
from PIL import Image, ImageDraw

SIZES = [16, 32, 48, 128]
BG = (79, 70, 229)        # indigo-600
BG_DARK = (67, 56, 202)   # indigo-700 (shutter ring)
FG = (255, 255, 255)
ACCENT = (165, 180, 252)  # indigo-300


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def make(size):
    # Supersample for crisp edges, then downscale.
    scale = 8
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Background tile.
    rounded_rect(d, (0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=BG)

    # Folder tab behind the camera (bottom-left hint of the "folders" idea).
    tab_top = int(s * 0.30)
    d.rounded_rectangle(
        (int(s * 0.14), tab_top, int(s * 0.60), int(s * 0.44)),
        radius=int(s * 0.03),
        fill=ACCENT,
    )

    # Camera body.
    body = (int(s * 0.14), int(s * 0.40), int(s * 0.86), int(s * 0.80))
    rounded_rect(d, body, radius=int(s * 0.07), fill=FG)

    # Viewfinder bump on top of the camera body.
    d.rounded_rectangle(
        (int(s * 0.34), int(s * 0.33), int(s * 0.56), int(s * 0.44)),
        radius=int(s * 0.02),
        fill=FG,
    )

    # Lens.
    cx, cy = s * 0.50, s * 0.60
    r_outer = s * 0.17
    r_inner = s * 0.11
    d.ellipse(
        (cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer), fill=BG_DARK
    )
    d.ellipse(
        (cx - r_inner, cy - r_inner, cx + r_inner, cy + r_inner), fill=BG
    )
    # Lens glint.
    gr = s * 0.035
    d.ellipse(
        (cx - r_inner * 0.5 - gr, cy - r_inner * 0.5 - gr,
         cx - r_inner * 0.5 + gr, cy - r_inner * 0.5 + gr),
        fill=ACCENT,
    )

    img = img.resize((size, size), Image.LANCZOS)
    img.save(f"icon{size}.png")
    print(f"wrote icon{size}.png")


if __name__ == "__main__":
    for sz in SIZES:
        make(sz)
