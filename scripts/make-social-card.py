#!/usr/bin/env python3
"""Render the GitHub social-preview card (1280x640) for Deputy, using Pillow only."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1280, 640
BG = (13, 16, 23)
ACCENT = (110, 168, 254)
VIOLET = (139, 123, 255)
GOOD = (78, 201, 163)
WARN = (230, 190, 95)
TEXT = (233, 238, 246)
DIM = (154, 167, 189)
FAINT = (108, 121, 140)


def F(sz):
    return ImageFont.load_default(sz)


# ── base + ambient glows ──────────────────────────────────────────────
base = Image.new("RGBA", (W, H), BG + (255,))
for cx, cy, col, r, a, b in [
    (170, 120, ACCENT, 430, 66, 170),
    (1140, 560, VIOLET, 470, 62, 180),
]:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (a,))
    base = Image.alpha_composite(base, layer.filter(ImageFilter.GaussianBlur(b)))
img = base.convert("RGB")
draw = ImageDraw.Draw(img)

# ── logo mark: rounded square with accent→violet diagonal gradient ────
mx, my, ms = 80, 96, 104
grad = Image.new("RGBA", (ms, ms), (0, 0, 0, 0))
for yy in range(ms):
    for xx in range(ms):
        t = (xx + yy) / (2 * ms)
        grad.putpixel((xx, yy), (
            int(ACCENT[0] + (VIOLET[0] - ACCENT[0]) * t),
            int(ACCENT[1] + (VIOLET[1] - ACCENT[1]) * t),
            int(ACCENT[2] + (VIOLET[2] - ACCENT[2]) * t),
            255,
        ))
mask = Image.new("L", (ms, ms), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, ms - 1, ms - 1], radius=26, fill=255)
img.paste(grad, (mx, my), mask)
draw.text((mx + ms / 2, my + ms / 2 + 2), "D", font=F(66), fill=(11, 15, 23), anchor="mm")

# ── wordmark ──────────────────────────────────────────────────────────
draw.text((mx + ms + 34, my + ms / 2), "Deputy", font=F(112), fill=TEXT,
          anchor="lm", stroke_width=2, stroke_fill=TEXT)

# ── tagline ───────────────────────────────────────────────────────────
ty = my + ms + 66
draw.text((80, ty), "Delegate outcomes to a crew of Claude Code agents.",
          font=F(40), fill=TEXT)
dim_part = "They plan, build, verify, and ship.  "
draw.text((80, ty + 60), dim_part, font=F(32), fill=DIM)
w = draw.textlength(dim_part, font=F(32))
draw.text((80 + w, ty + 60), "You hold the gates.", font=F(32), fill=ACCENT,
          stroke_width=1, stroke_fill=ACCENT)

# ── pipeline motif: plan · gate · build · check · gate · PR · done ─────
py = 466
x0, x1 = 92, W - 92
nodes = [("plan", ACCENT), ("gate", WARN), ("build", ACCENT), ("check", ACCENT),
         ("gate", WARN), ("PR", ACCENT), ("done", GOOD)]
xs = [x0 + (x1 - x0) * i / (len(nodes) - 1) for i in range(len(nodes))]
draw.line([(x0, py), (x1, py)], fill=(40, 49, 66), width=3)
for x, (label, c) in zip(xs, nodes):
    r = 12
    draw.ellipse([x - r, py - r, x + r, py + r], fill=BG, outline=c, width=4)
    lc = WARN if label == "gate" else GOOD if label == "done" else DIM
    draw.text((x, py + 26), label, font=F(23), fill=lc, anchor="ma")

# ── footer ────────────────────────────────────────────────────────────
draw.line([(80, H - 92), (W - 80, H - 92)], fill=(33, 41, 56), width=1)
draw.text((80, H - 66), "github.com/tiennt235/deputy", font=F(26), fill=DIM)
draw.text((W - 80, H - 66), "Claude Code runtime  ·  MIT", font=F(24), fill=FAINT, anchor="ra")

out = __file__.rsplit("/", 2)[0] + "/docs/social-preview.png"
img.save(out, "PNG")
print("wrote", out, img.size)
