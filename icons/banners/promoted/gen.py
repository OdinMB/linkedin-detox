"""Wrapper to generate promoted banner images."""
import subprocess
import sys

PYTHON = "C:/Users/User/.claude/skills/openai-imagegen/venv/Scripts/python"
SCRIPT = "C:/Users/User/.claude/skills/openai-imagegen/scripts/generate_image.py"
REF = "D:/projects/linkedin/icons/banners/slop-factory.png"
OUT_DIR = "D:/projects/linkedin/icons/banners/promoted"

images = [
    {
        "name": "money-shredder",
        "prompt": "Adopt the exact art style from the reference image - lime green (#39ff14) and black only, bold outlines, simple cartoon icon on white background. A paper shredder machine eating dollar bills, with shredded strips coming out the bottom. No text, no shadows, no gradients.",
    },
    {
        "name": "ad-blocker",
        "prompt": "Adopt the exact art style from the reference image - lime green (#39ff14) and black only, bold outlines, simple cartoon icon on white background. A shield or stop sign blocking a megaphone. The megaphone has an X over it. No text, no shadows, no gradients.",
    },
    {
        "name": "corporate-megaphone",
        "prompt": "Adopt the exact art style from the reference image - lime green (#39ff14) and black only, bold outlines, simple cartoon icon on white background. A corporate figure in a suit holding a megaphone that is being muted or silenced with a big X or mute symbol. No text, no shadows, no gradients.",
    },
    {
        "name": "spam-filter",
        "prompt": "Adopt the exact art style from the reference image - lime green (#39ff14) and black only, bold outlines, simple cartoon icon on white background. A funnel catching and filtering spam envelopes, clean envelopes come out the bottom. No text, no shadows, no gradients.",
    },
    {
        "name": "wallet-trap",
        "prompt": "Adopt the exact art style from the reference image - lime green (#39ff14) and black only, bold outlines, simple cartoon icon on white background. A mousetrap baited with a wallet or money bag. No text, no shadows, no gradients.",
    },
]

for i, img in enumerate(images):
    out = f"{OUT_DIR}/{img['name']}.png"
    cmd = [PYTHON, SCRIPT, img["prompt"], out, "-i", REF]
    # For images 2-5, also use image 1 as a second reference
    if i > 0:
        first_out = f"{OUT_DIR}/{images[0]['name']}.png"
        cmd.extend(["-i", first_out])

    print(f"\n{'='*60}")
    print(f"Generating {i+1}/5: {img['name']}")
    print(f"{'='*60}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    if result.returncode != 0:
        print(f"FAILED: {img['name']} (exit code {result.returncode})")
        sys.exit(1)
    print(f"Done: {out}")

print("\nAll 5 images generated successfully!")
