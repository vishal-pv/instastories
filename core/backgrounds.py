import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance

def extract_dominant_colors(pil_img, num_colors=4):
    """
    Extracts dominant harmonious color palette from an image using OpenCV K-Means.
    Returns RGB tuples.
    """
    try:
        small = pil_img.resize((150, 150), Image.Resampling.BOX)
        np_img = np.array(small)
        if len(np_img.shape) == 3 and np_img.shape[2] == 4:
            np_img = cv2.cvtColor(np_img, cv2.COLOR_RGBA2RGB)
            
        pixels = np_img.reshape((-1, 3)).astype(np.float32)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        flags = cv2.KMEANS_RANDOM_CENTERS
        _, _, centers = cv2.kmeans(pixels, num_colors, None, criteria, 10, flags)
        
        colors = [tuple(map(int, c)) for c in centers]
        # Sort by brightness / saturation
        colors.sort(key=lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2])
        return colors
    except Exception:
        return [(235, 230, 220), (210, 200, 185), (170, 160, 145), (120, 110, 95)]

def soften_color(rgb, factor=0.45):
    """Blends color with warm off-white for elegant pastel/editorial tones."""
    r, g, b = rgb
    base_r, base_g, base_b = (248, 246, 242)
    nr = int(r * factor + base_r * (1 - factor))
    ng = int(g * factor + base_g * (1 - factor))
    nb = int(b * factor + base_b * (1 - factor))
    return (nr, ng, nb)

def create_ambient_blur_background(pil_img, width=1080, height=1350, blur_radius=75, tint=(255, 255, 255), tint_alpha=0.25):
    """
    Creates a luxury cinematic blurred backdrop directly from the photo.
    Guarantees 100% color harmony with the foreground subject.
    """
    # Scale to cover
    img_w, img_h = pil_img.size
    scale = max(width / img_w, height / img_h)
    new_w, new_h = int(img_w * scale), int(img_h * scale)
    scaled = pil_img.resize((new_w, new_h), Image.Resampling.BILINEAR)
    
    # Center crop
    left = (new_w - width) // 2
    top = (new_h - height) // 2
    cropped = scaled.crop((left, top, left + width, top + height))
    
    # Heavy Gaussian blur
    blurred = cropped.filter(ImageFilter.GaussianBlur(blur_radius))
    
    # Soften brightness & contrast
    enhancer = ImageEnhance.Brightness(blurred)
    blurred = enhancer.enhance(1.08)
    
    # Add subtle tint overlay
    if tint_alpha > 0:
        overlay = Image.new("RGBA", (width, height), (*tint, int(255 * tint_alpha)))
        base_rgba = blurred.convert("RGBA")
        blended = Image.alpha_composite(base_rgba, overlay)
        return blended.convert("RGB")
        
    return blurred

def create_harmonious_gradient(color_top, color_bottom, width=1080, height=1350, diagonal=False):
    """
    Generates a silky smooth multi-stop gradient between two harmonious colors.
    """
    base = Image.new("RGB", (width, height))
    r1, g1, b1 = color_top
    r2, g2, b2 = color_bottom
    
    # Create gradient array
    if not diagonal:
        # Vertical gradient
        alphas = np.linspace(0, 1, height).reshape(height, 1)
        r = np.tile(r1 * (1 - alphas) + r2 * alphas, (1, width))
        g = np.tile(g1 * (1 - alphas) + g2 * alphas, (1, width))
        b = np.tile(b1 * (1 - alphas) + b2 * alphas, (1, width))
    else:
        # Diagonal gradient
        y = np.linspace(0, 1, height).reshape(height, 1)
        x = np.linspace(0, 1, width).reshape(1, width)
        alphas = (y * 0.7 + x * 0.3)
        r = r1 * (1 - alphas) + r2 * alphas
        g = g1 * (1 - alphas) + g2 * alphas
        b = b1 * (1 - alphas) + b2 * alphas
        
    rgb_arr = np.stack([r, g, b], axis=-1).astype(np.uint8)
    return Image.fromarray(rgb_arr)

def create_split_panel_background(color_panel, color_base, panel_w=540, width=1080, height=1350):
    """
    Generates an editorial split panel background (e.g. left scrapbook panel + right neutral canvas).
    """
    canvas = create_harmonious_gradient(color_base, soften_color(color_base, 0.7), width, height)
    panel = create_harmonious_gradient(color_panel, soften_color(color_panel, 0.8), panel_w, height)
    canvas.paste(panel, (0, 0))
    
    # Add subtle vertical shadow divider line
    d = ImageDraw.Draw(canvas)
    for i in range(12):
        alpha = int(25 * (1 - i / 12.0))
        d.line([(panel_w + i, 0), (panel_w + i, height)], fill=(40, 40, 40, alpha) if canvas.mode == "RGBA" else (180 - i*5, 180 - i*5, 180 - i*5))
        
    return canvas

def generate_dynamic_background(user_img, ref_slide_img=None, layout_type="auto", width=1080, height=1350):
    """
    Master intelligent background generator.
    Selects the most suitable, premium background tailored to the image and layout:
    - Never flat/stark white.
    - Ambient blur for video & single cards.
    - Harmonized pastel gradients for collages and postcards.
    - Dual split panels for scrapbooks.
    """
    # Extract palette from user's photo
    palette = extract_dominant_colors(user_img, num_colors=4)
    
    # Extract reference palette if available
    ref_palette = extract_dominant_colors(ref_slide_img, num_colors=4) if ref_slide_img else None
    
    # Pick primary & secondary tones
    if ref_palette and len(ref_palette) >= 2:
        top_color = soften_color(ref_palette[1], factor=0.55)
        bot_color = soften_color(ref_palette[0], factor=0.40)
    else:
        top_color = soften_color(palette[1], factor=0.50)
        bot_color = soften_color(palette[0], factor=0.35)
        
    if layout_type in ["video_spotlight", "hero_single", "hero_card", "hero_full"]:
        # Ambient blurred backdrop with soft frosted glass tint
        return create_ambient_blur_background(user_img, width, height, blur_radius=85, tint_alpha=0.25)
        
    elif layout_type == "polaroid_scrapbook":
        # Split panel with harmonious tone
        panel_color = soften_color(palette[2] if len(palette) > 2 else palette[0], factor=0.7)
        base_color = soften_color(palette[0], factor=0.25)
        return create_split_panel_background(panel_color, base_color, panel_w=540, width=width, height=height)
        
    elif layout_type == "dual_postcards":
        # Warm editorial duo-tone gradient
        c1 = soften_color(palette[1], factor=0.40)
        c2 = soften_color(palette[2] if len(palette) > 2 else palette[0], factor=0.20)
        return create_harmonious_gradient(c1, c2, width, height, diagonal=True)
        
    else:
        # Default: Silky soft pastel gradient harmonized with the image
        c1 = soften_color(palette[1], factor=0.35)
        c2 = soften_color(palette[0], factor=0.20)
        return create_harmonious_gradient(c1, c2, width, height, diagonal=False)
