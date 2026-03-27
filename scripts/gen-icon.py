"""Generate radioactive trefoil icon in toxic green on transparent background."""
import os
from PIL import Image, ImageDraw, ImageChops

SIZE = 1024
CENTER = SIZE // 2
GREEN = (57, 255, 20, 255)  # #39ff14
TRANSPARENT = (0, 0, 0, 0)

# -- Build the trefoil on a fresh canvas --
img = Image.new("RGBA", (SIZE, SIZE), TRANSPARENT)
draw = ImageDraw.Draw(img)

outer_r = int(SIZE * 0.42)       # blade outer radius
inner_hole_r = int(SIZE * 0.18)  # ring cut radius
center_dot_r = int(SIZE * 0.07)  # center dot radius
gap_half = 8                     # half-gap in degrees between blades

# 1) Draw three pie-slice blades
for i in range(3):
    start = i * 120 + gap_half - 90
    end = start + 120 - 2 * gap_half
    bbox = [CENTER - outer_r, CENTER - outer_r, CENTER + outer_r, CENTER + outer_r]
    draw.pieslice(bbox, start, end, fill=GREEN)

# 2) Punch out the inner ring by pasting a transparent circle
mask = Image.new("L", (SIZE, SIZE), 255)
mask_draw = ImageDraw.Draw(mask)
mask_draw.ellipse(
    [CENTER - inner_hole_r, CENTER - inner_hole_r,
     CENTER + inner_hole_r, CENTER + inner_hole_r],
    fill=0
)
# Apply mask: where mask is 0, make img transparent
r, g, b, a = img.split()
a = ImageChops.multiply(a, mask)
img = Image.merge("RGBA", (r, g, b, a))

# 3) Draw solid center dot back on top
draw2 = ImageDraw.Draw(img)
draw2.ellipse(
    [CENTER - center_dot_r, CENTER - center_dot_r,
     CENTER + center_dot_r, CENTER + center_dot_r],
    fill=GREEN
)

# -- Save outputs --
assets_dir = "D:/projects/linkedin/.claude/skills/linkedin-detox-style/assets"
icons_dir = "D:/projects/linkedin/icons"

# Transparent versions (-transparent suffix)
img.save(os.path.join(assets_dir, "icon-master-transparent.png"), "PNG")
print("Saved icon-master-transparent.png")

for size in [128, 48, 16]:
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(os.path.join(icons_dir, f"icon{size}-transparent.png"), "PNG")
    print(f"Saved icon{size}-transparent.png")

# Black background versions (original names)
BLACK = (0, 0, 0, 255)
bg_master = Image.new("RGBA", (SIZE, SIZE), BLACK)
bg_master.paste(img, (0, 0), img)
bg_master.save(os.path.join(assets_dir, "icon-master.png"), "PNG")
print("Saved icon-master.png (black bg)")

for size in [128, 48, 16]:
    resized = bg_master.resize((size, size), Image.LANCZOS)
    resized.save(os.path.join(icons_dir, f"icon{size}.png"), "PNG")
    print(f"Saved icon{size}.png (black bg)")

print("Done!")
