"""Generate the Raycast extension icon as a 512x512 PNG.

Renders a soft purple-to-pink gradient background with a stylized speaker +
soundwave glyph centered on it. Output: raycast-extension/assets/extension-icon.png

Run after `pip install Pillow` inside the project venv.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

SIZE = 512
OUT = Path(__file__).resolve().parent.parent / "raycast-extension" / "assets" / "extension-icon.png"


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def render() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pixels = img.load()

    # Diagonal gradient from top-left to bottom-right.
    top_left = (124, 92, 255)     # vivid violet
    bottom_right = (255, 102, 196)  # pink
    for y in range(SIZE):
        for x in range(SIZE):
            t = (x + y) / (SIZE * 2 - 2)
            pixels[x, y] = (*lerp(top_left, bottom_right, t), 255)

    # Round the corners by clipping with a rounded-square mask.
    mask = Image.new("L", (SIZE, SIZE), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, SIZE, SIZE), radius=SIZE // 6, fill=255)
    img.putalpha(mask)

    # Speaker icon: trapezoidal cone + small rect at the back.
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2 - 50, SIZE // 2
    speaker_color = (255, 255, 255, 245)

    # Back rectangle (the speaker box)
    draw.rounded_rectangle(
        (cx - 90, cy - 50, cx - 30, cy + 50),
        radius=10,
        fill=speaker_color,
    )
    # Cone (triangle-ish)
    draw.polygon(
        [
            (cx - 30, cy - 95),
            (cx + 40, cy - 130),
            (cx + 40, cy + 130),
            (cx - 30, cy + 95),
        ],
        fill=speaker_color,
    )

    # Three sound waves on the right
    wave_color = (255, 255, 255, 230)
    for i, radius in enumerate((60, 110, 160)):
        bbox = (cx + 65 - radius, cy - radius, cx + 65 + radius, cy + radius)
        # Draw an arc — sound wave shape (right-facing crescent)
        for thickness_step in range(8):
            draw.arc(
                (bbox[0] + thickness_step, bbox[1] + thickness_step,
                 bbox[2] - thickness_step, bbox[3] - thickness_step),
                start=-35,
                end=35,
                fill=wave_color,
                width=2,
            )

    # Subtle inner shadow / glow
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.rounded_rectangle((0, 0, SIZE, SIZE), radius=SIZE // 6, outline=(0, 0, 0, 50), width=4)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=3))
    img.alpha_composite(glow)

    return img


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    render().save(OUT, "PNG")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
