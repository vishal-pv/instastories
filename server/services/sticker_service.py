import os
import time
from server.config import STICKERS_DIR

CATEGORY_MAP = {
    "doodle": "doodles", "peep": "doodles",
    "starfish": "beach", "shell": "beach", "wave": "beach", "coral": "beach", "sunglasses": "beach",
    "dolphin": "beach", "turtle": "beach", "fish": "beach", "octopus": "beach", "anchor": "beach",
    "sailboat": "beach", "sunset": "beach", "sunrise": "beach",
    "palm": "tropical", "hibiscus": "tropical", "coconut": "tropical", "drink": "tropical",
    "cocktail": "tropical", "bubble_tea": "tropical", "ice_cream": "tropical", "shaved_ice": "tropical",
    "watermelon": "tropical", "pineapple": "tropical", "strawberry": "tropical", "cherries": "tropical",
    "lemon": "tropical", "avocado": "tropical", "volcano": "tropical",
    "camera": "vintage", "digicam": "vintage", "compass": "vintage", "sketch": "vintage",
    "luggage": "travel", "suitcase": "travel", "passport": "travel", "ticket": "travel",
    "tent": "travel", "scooter": "travel", "balloon": "travel", "rainbow": "travel",
    "washi": "decor", "tape": "decor", "heart": "decor", "sparkle": "decor", "star": "decor",
    "popper": "decor", "ribbon": "decor", "letter": "decor", "music": "decor", "guitar": "decor",
    "flower": "decor", "clover": "decor", "flame": "decor", "button": "decor", "sunflower": "decor"
}

def get_sticker_category(filename):
    lower_name = filename.lower()
    for kw, cat in CATEGORY_MAP.items():
        if kw in lower_name:
            return cat
    return "other"

def list_all_stickers():
    """Returns all available stickers with title and category."""
    if not os.path.exists(STICKERS_DIR):
        return []
    files = [f for f in os.listdir(STICKERS_DIR) if f.lower().endswith((".png", ".webp", ".jpg")) and not f.endswith("_hq.png")]
    stickers = []
    for f in sorted(files):
        stickers.append({
            "name": f,
            "title": os.path.splitext(f)[0].replace("_", " ").title(),
            "category": get_sticker_category(f),
            "url": f"/api/sticker/{f}"
        })
    return stickers

def search_stickers(query="", category=""):
    """Filters stickers by search keyword and category."""
    all_st = list_all_stickers()
    q = (query or "").strip().lower()
    cat = (category or "").strip().lower()
    
    results = []
    for item in all_st:
        item_cat = item["category"]
        if cat and cat != "all" and item_cat != cat:
            continue
        if not q or (q in item["name"].lower()) or (q in item["title"].lower()) or (q in item_cat):
            results.append(item)
    return results

def save_custom_sticker(st_file):
    """Saves user custom PNG/WebP sticker."""
    ext = os.path.splitext(st_file.filename)[1].lower()
    if ext not in [".png", ".webp", ".jpg", ".jpeg"]:
        return None, "Only PNG, WebP, or JPG images allowed"
    safe_name = f"custom_{int(time.time())}_{st_file.filename.replace(' ', '_')}"
    dest_path = os.path.join(STICKERS_DIR, safe_name)
    st_file.save(dest_path)
    
    return {
        "name": safe_name,
        "title": os.path.splitext(st_file.filename)[0].replace("_", " ").title(),
        "category": "custom",
        "url": f"/api/sticker/{safe_name}"
    }, None
