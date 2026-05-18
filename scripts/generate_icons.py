"""Generate the Raycast extension icons.

Outputs:
  raycast-extension/assets/extension-icon.png   (the base "Kokoro TTS" icon)
  raycast-extension/assets/speak-selection.png  (per-command icons,
  raycast-extension/assets/stop-speaking.png     each color-shifted)
  raycast-extension/assets/speak-clipboard.png
  raycast-extension/assets/speak-text.png
  raycast-extension/assets/voices.png

All are 512x512 PNG, rounded corners, with a centered speaker + sound waves
glyph. Per-command icons use a different gradient and accent so they're
distinguishable in the Raycast root search.

Run after `pip install Pillow` inside the project venv:
    source .venv/bin/activate && python scripts/generate_icons.py
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

SIZE = 512
OUT_DIR = Path(__file__).resolve().parent.parent / "raycast-extension" / "assets"

# Each design: (filename, gradient_start, gradient_end, glyph_style)
# glyph_style is one of: "speaker_waves", "speaker_stop", "speaker_clip",
# "speaker_pen", "speakers_multi"
ICONS = [
    ("extension-icon.png", (124, 92, 255),  (255, 102, 196), "speaker_waves"),
    ("speak-selection.png", (124, 92, 255),  (255, 102, 196), "speaker_waves"),  # same as extension
    ("stop-speaking.png",  (90, 90, 110),   (220, 60, 80),   "speaker_stop"),
    ("speak-clipboard.png",(40, 130, 220),  (90, 220, 200),  "speaker_clip"),
    ("speak-text.png",     (255, 130, 60),  (255, 200, 80),  "speaker_pen"),
    ("voices.png",         (40, 80, 200),   (180, 60, 220),  "speakers_multi"),
]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_background(start, end):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pix = img.load()
    for y in range(SIZE):
        for x in range(SIZE):
            t = (x + y) / (SIZE * 2 - 2)
            pix[x, y] = (*lerp(start, end, t), 255)
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, SIZE, SIZE), radius=SIZE // 6, fill=255)
    img.putalpha(mask)
    return img


def draw_speaker(draw, cx, cy, color=(255, 255, 255, 245), scale=1.0):
    """Draws a speaker cone + box centered at (cx, cy)."""
    sx = scale
    # Back rectangle (the speaker box)
    draw.rounded_rectangle(
        (cx - int(90 * sx), cy - int(50 * sx), cx - int(30 * sx), cy + int(50 * sx)),
        radius=int(10 * sx),
        fill=color,
    )
    # Cone (right-facing triangle)
    draw.polygon(
        [
            (cx - int(30 * sx), cy - int(95 * sx)),
            (cx + int(40 * sx), cy - int(130 * sx)),
            (cx + int(40 * sx), cy + int(130 * sx)),
            (cx - int(30 * sx), cy + int(95 * sx)),
        ],
        fill=color,
    )


def draw_waves(draw, cx, cy, color=(255, 255, 255, 230)):
    """Three concentric sound waves to the right of the speaker."""
    for radius in (60, 110, 160):
        bbox = (cx + 65 - radius, cy - radius, cx + 65 + radius, cy + radius)
        for t in range(8):
            draw.arc(
                (bbox[0] + t, bbox[1] + t, bbox[2] - t, bbox[3] - t),
                start=-35, end=35, fill=color, width=2,
            )


def draw_stop_x(draw, cx, cy, color=(255, 255, 255, 235)):
    """A crisp X glyph to the right of the speaker for 'stop'."""
    cx = cx + 110
    arm = 70
    width = 22
    # Two crossing rounded rectangles rotated 45/-45
    # Approximate by drawing thick lines:
    draw.line([(cx - arm, cy - arm), (cx + arm, cy + arm)], fill=color, width=width)
    draw.line([(cx - arm, cy + arm), (cx + arm, cy - arm)], fill=color, width=width)


def draw_clipboard(draw, cx, cy, color=(255, 255, 255, 235)):
    """A clipboard rectangle next to the speaker."""
    cx = cx + 110
    w, h = 110, 150
    # Body
    draw.rounded_rectangle((cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2),
                           radius=14, outline=color, width=10)
    # Clip at top
    draw.rounded_rectangle((cx - 30, cy - h // 2 - 14, cx + 30, cy - h // 2 + 18),
                           radius=8, fill=color)
    # Three text lines
    for i, offset in enumerate((-30, 0, 30)):
        line_w = (60, 70, 40)[i]
        draw.rounded_rectangle((cx - line_w // 2, cy + offset - 5,
                                cx + line_w // 2, cy + offset + 5),
                               radius=4, fill=color)


def draw_pen(draw, cx, cy, color=(255, 255, 255, 235)):
    """A simple pen/edit glyph next to the speaker."""
    cx = cx + 110
    # Pen body: diagonal capsule
    draw.line([(cx - 50, cy + 60), (cx + 60, cy - 50)], fill=color, width=24)
    # Pen tip (small triangle)
    draw.polygon(
        [(cx - 70, cy + 80), (cx - 50, cy + 60), (cx - 35, cy + 75)],
        fill=color,
    )
    # Underline (page line)
    draw.line([(cx - 80, cy + 95), (cx + 80, cy + 95)], fill=color, width=6)


def draw_multi_speakers(draw, cx, cy, color=(255, 255, 255, 235)):
    """Three small speaker silhouettes to suggest a voice picker."""
    # Override default placement: draw three side-by-side
    for i, offset_x in enumerate((-130, 0, 130)):
        base_color = (255, 255, 255, 235) if i == 1 else (255, 255, 255, 175)
        # Smaller speaker
        x = cx + offset_x
        draw.rounded_rectangle((x - 36, cy - 24, x - 12, cy + 24), radius=4, fill=base_color)
        draw.polygon(
            [(x - 12, cy - 48), (x + 20, cy - 60), (x + 20, cy + 60), (x - 12, cy + 48)],
            fill=base_color,
        )


GLYPHS = {
    "speaker_waves": lambda d, cx, cy: (draw_speaker(d, cx - 50, cy), draw_waves(d, cx - 50, cy)),
    "speaker_stop":  lambda d, cx, cy: (draw_speaker(d, cx - 50, cy), draw_stop_x(d, cx - 50, cy)),
    "speaker_clip":  lambda d, cx, cy: (draw_speaker(d, cx - 70, cy, scale=0.9), draw_clipboard(d, cx - 70, cy)),
    "speaker_pen":   lambda d, cx, cy: (draw_speaker(d, cx - 70, cy, scale=0.9), draw_pen(d, cx - 70, cy)),
    "speakers_multi": lambda d, cx, cy: (draw_multi_speakers(d, cx, cy),),
}


def render(start, end, glyph_style) -> Image.Image:
    img = make_background(start, end)
    draw = ImageDraw.Draw(img)
    GLYPHS[glyph_style](draw, SIZE // 2, SIZE // 2)
    # Subtle inner glow
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.rounded_rectangle((0, 0, SIZE, SIZE), radius=SIZE // 6, outline=(0, 0, 0, 50), width=4)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=3))
    img.alpha_composite(glow)
    return img


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for filename, start, end, glyph in ICONS:
        path = OUT_DIR / filename
        render(start, end, glyph).save(path, "PNG")
        print(f"wrote {path.name} ({path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
