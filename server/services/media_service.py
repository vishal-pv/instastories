import os
import io
import urllib.parse
import cv2
from PIL import Image
from core.face_cropper import load_upright_image
from server.config import INPUTS_DIR

VALID_IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
VALID_VID_EXTS = {".mp4", ".mov", ".avi"}

def list_media():
    """Lists all multimedia files in inputs/ with metadata and thumbnail URLs."""
    files = []
    if not os.path.exists(INPUTS_DIR):
        return {"files": [], "count": 0}
        
    for f in sorted(os.listdir(INPUTS_DIR)):
        p = os.path.join(INPUTS_DIR, f)
        if not os.path.isfile(p):
            continue
        ext = os.path.splitext(f)[1].lower()
        size_mb = round(os.path.getsize(p) / (1024 * 1024), 2)
        
        m_type = "image" if ext in VALID_IMG_EXTS else ("video" if ext in VALID_VID_EXTS else "other")
        if m_type != "other":
            files.append({
                "name": f,
                "type": m_type,
                "size_mb": size_mb,
                "thumb_url": f"/api/thumbnail/{urllib.parse.quote(f)}"
            })
            
    return {"files": files, "count": len(files)}

def generate_thumbnail_bytes(filename):
    """Extracts on-the-fly fast thumbnail (JPEG) for image or video."""
    safe_name = os.path.basename(urllib.parse.unquote(filename))
    p = os.path.join(INPUTS_DIR, safe_name)
    if not os.path.exists(p):
        return None
        
    ext = os.path.splitext(safe_name)[1].lower()
    if ext in VALID_VID_EXTS:
        cap = cv2.VideoCapture(p)
        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            return None
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb)
    else:
        img = load_upright_image(p)
        
    img.thumbnail((300, 300))
    bio = io.BytesIO()
    img.save(bio, "JPEG", quality=80)
    bio.seek(0)
    return bio

def save_uploaded_media(files):
    """Saves incoming file objects to the inputs/ directory."""
    uploaded = []
    for f in files:
        if f and f.filename:
            safe_name = os.path.basename(f.filename)
            save_path = os.path.join(INPUTS_DIR, safe_name)
            f.save(save_path)
            uploaded.append(safe_name)
    return uploaded

def delete_media_by_name(filename):
    """Safely removes a file from inputs/."""
    safe_name = os.path.basename(urllib.parse.unquote(filename))
    p = os.path.join(INPUTS_DIR, safe_name)
    if os.path.exists(p):
        os.remove(p)
        return True, safe_name
    return False, safe_name
