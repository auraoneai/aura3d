"""Rasterize card text from the exact house font file, without system font fallback."""
import io
import json
import sys

from PIL import Image, ImageDraw, ImageFont


def render(spec):
    font = ImageFont.truetype(spec["fontfile"], spec["size"])
    if font.getname() != (spec["family"], spec["weight"]):
        raise ValueError(f"Unexpected font for {spec['fontfile']}: {font.getname()}")

    lines = []
    line = ""
    for word in spec["text"].split():
        candidate = f"{line} {word}" if line else word
        if line and spec["maxWidth"] and font.getlength(candidate) > spec["maxWidth"]:
            lines.append(line)
            line = word
        else:
            line = candidate
    lines.append(line)

    text = "\n".join(lines)
    image = Image.new("RGBA", (1, 1))
    draw = ImageDraw.Draw(image)
    left, top, right, bottom = draw.multiline_textbbox((0, 0), text, font=font, spacing=4)
    image = Image.new("RGBA", (right - left, bottom - top))
    ImageDraw.Draw(image).multiline_text((-left, -top), text, font=font, fill=spec["color"], spacing=4)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


sys.stdout.buffer.write(render(json.load(sys.stdin)))
