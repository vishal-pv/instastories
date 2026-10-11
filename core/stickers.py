import os
from PIL import Image, ImageDraw, ImageFont
from .face_cropper import smart_face_crop

def get_font(size=36, bold=False):
    font_paths = [
        "C:\\Windows\\Fonts\\arialbd.ttf" if bold else "C:\\Windows\\Fonts\\arial.ttf",
        "C:\\Windows\\Fonts\\segoeuib.ttf" if bold else "C:\\Windows\\Fonts\\segoeui.ttf",
        "C:\\Windows\\Fonts\\calibrib.ttf" if bold else "C:\\Windows\\Fonts\\calibri.ttf",
    ]
    for p in font_paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

def make_polaroid(img, size=(420, 520), label=""):
    """Creates a classic Polaroid card with drop shadow border and handwritten label."""
    pw, ph = size
    photo_w, photo_h = int(pw * 0.88), int(ph * 0.74)
    cropped_photo = smart_face_crop(img, photo_w, photo_h)
    
    polaroid = Image.new("RGBA", (pw, ph), (252, 251, 248, 255))
    d = ImageDraw.Draw(polaroid)
    d.rectangle([(0, 0), (pw-1, ph-1)], outline=(220, 218, 210), width=1)
    
    px = (pw - photo_w) // 2
    py = int(ph * 0.07)
    polaroid.paste(cropped_photo, (px, py))
    
    if label:
        font = get_font(28, bold=True)
        bbox = d.textbbox((0, 0), label, font=font)
        tw = bbox[2] - bbox[0]
        tx = (pw - tw) // 2
        ty = py + photo_h + 18
        d.text((tx, ty), label, font=font, fill=(50, 50, 50, 240))
        
    return polaroid

def create_location_pill(text="📍 Goa, India", bg_color=(255, 255, 255, 240), text_color=(30, 30, 30, 255)):
    """Creates an authentic Instagram Location pill badge."""
    font = get_font(32, bold=True)
    dummy = Image.new("RGBA", (1, 1))
    d = ImageDraw.Draw(dummy)
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    
    pad_x, pad_y = 35, 18
    w, h = tw + (pad_x * 2), th + (pad_y * 2)
    pill = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    p_draw = ImageDraw.Draw(pill)
    p_draw.rounded_rectangle([(0, 0), (w, h)], radius=h // 2, fill=bg_color)
    p_draw.text((pad_x, pad_y - bbox[1]), text, font=font, fill=text_color)
    return pill

def load_sticker(name):
    """Loads sticker from assets/stickers/ folder with RGBA transparency."""
    p = os.path.join(os.path.dirname(__file__), "..", "assets", "stickers", name)
    if os.path.exists(p):
        return Image.open(p).convert("RGBA")
    return None
