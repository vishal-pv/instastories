import os
import cv2
import numpy as np
from PIL import Image, ImageOps

CASCADE_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "haarcascade_frontalface_default.xml")
if not os.path.exists(CASCADE_PATH):
    CASCADE_PATH = "haarcascade_frontalface_default.xml"
    
face_cascade = cv2.CascadeClassifier(CASCADE_PATH) if os.path.exists(CASCADE_PATH) else None

def load_upright_image(path):
    """Loads an image with EXIF auto-transpose so DSLR photos are never loaded sideways."""
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    return img.convert("RGB")

def has_skin_tone(bgr_patch):
    """Validates skin tone in YCrCb color space to filter out foliage false-positives."""
    if bgr_patch is None or bgr_patch.size == 0:
        return False
    ycrcb = cv2.cvtColor(bgr_patch, cv2.COLOR_BGR2YCrCb)
    mask = cv2.inRange(ycrcb, np.array([0, 133, 77]), np.array([255, 173, 127]))
    return (np.sum(mask > 0) / float(mask.size)) > 0.18

def smart_face_crop(pil_img, target_w, target_h):
    """Crops an image using face detection with headroom so faces are never cut off."""
    orig_w, orig_h = pil_img.size
    target_aspect = target_w / float(target_h)
    orig_aspect = orig_w / float(orig_h)
    
    if abs(target_aspect - orig_aspect) < 0.04:
        return pil_img.resize((target_w, target_h), Image.Resampling.LANCZOS)
        
    cv_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    scale = 1000.0 / max(orig_h, orig_w)
    small_w = max(1, int(orig_w * scale))
    small_h = max(1, int(orig_h * scale))
    small_bgr = cv2.resize(cv_bgr, (small_w, small_h))
    gray = cv2.cvtColor(small_bgr, cv2.COLOR_BGR2GRAY)
    
    faces = []
    if face_cascade is not None:
        try:
            detected = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
            for (fx, fy, fw, fh) in detected:
                patch = small_bgr[fy:fy+fh, fx:fx+fw]
                if has_skin_tone(patch):
                    faces.append((int(fx / scale), int(fy / scale), int(fw / scale), int(fh / scale)))
        except Exception:
            pass
            
    if target_aspect > orig_aspect:
        # Target wider than original -> crop height
        crop_w = orig_w
        crop_h = int(orig_w / target_aspect)
        crop_x = 0
        if faces:
            avg_fy = sum(f[1] + f[3]//2 for f in faces) / len(faces)
            min_fy = min(f[1] for f in faces)
            ideal_y = avg_fy - (crop_h * 0.35)
            # Ensure uppermost face has headroom and isn't cut at forehead
            ideal_y = min(ideal_y, max(0, min_fy - int(crop_h * 0.10)))
            crop_y = max(0, min(int(ideal_y), orig_h - crop_h))
        else:
            crop_y = int((orig_h - crop_h) * 0.20)
    else:
        # Target taller than original -> crop width
        crop_h = orig_h
        crop_w = int(orig_h * target_aspect)
        crop_y = 0
        if faces:
            avg_fx = sum(f[0] + f[2]//2 for f in faces) / len(faces)
            ideal_x = avg_fx - (crop_w // 2)
            crop_x = max(0, min(int(ideal_x), orig_w - crop_w))
        else:
            crop_x = (orig_w - crop_w) // 2
            
    cropped = pil_img.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))
    return cropped.resize((max(1, target_w), max(1, target_h)), Image.Resampling.LANCZOS)


def crop_zoom_pan_image(pil_img, target_w, target_h, zoom=1.0, pan_x=0.0, pan_y=0.0):
    """
    Performs smart crop with user-controlled zoom (1.0x to 3.0x) and pan (-50% to +50%).
    Allows users to pan left/right/up/down and zoom inside cards smoothly.
    """
    orig_w, orig_h = pil_img.size
    target_aspect = target_w / float(target_h if target_h > 0 else 1)
    orig_aspect = orig_w / float(orig_h if orig_h > 0 else 1)
    
    # 1. Base crop dimensions matching target aspect ratio
    if target_aspect > orig_aspect:
        base_w = orig_w
        base_h = int(orig_w / target_aspect)
        base_x = 0
        base_y = int((orig_h - base_h) * 0.20)
    else:
        base_h = orig_h
        base_w = int(orig_h * target_aspect)
        base_x = (orig_w - base_w) // 2
        base_y = 0
        
    # Check if faces detected to refine default center when pan is 0
    if abs(pan_x) < 0.01 and abs(pan_y) < 0.01 and face_cascade is not None:
        try:
            cv_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            scale = 800.0 / max(orig_h, orig_w)
            small_bgr = cv2.resize(cv_bgr, (max(1, int(orig_w * scale)), max(1, int(orig_h * scale))))
            gray = cv2.cvtColor(small_bgr, cv2.COLOR_BGR2GRAY)
            detected = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
            faces = [f for f in detected if has_skin_tone(small_bgr[f[1]:f[1]+f[3], f[0]:f[0]+f[2]])]
            if faces:
                if target_aspect > orig_aspect:
                    avg_fy = sum(f[1] + f[3]//2 for f in faces) / (len(faces) * scale)
                    min_fy = min(f[1] for f in faces) / scale
                    ideal_y = avg_fy - (base_h * 0.35)
                    ideal_y = min(ideal_y, max(0, min_fy - int(base_h * 0.10)))
                    base_y = max(0, min(int(ideal_y), orig_h - base_h))
                else:
                    avg_fx = sum(f[0] + f[2]//2 for f in faces) / (len(faces) * scale)
                    ideal_x = avg_fx - (base_w // 2)
                    base_x = max(0, min(int(ideal_x), orig_w - base_w))
        except Exception:
            pass

    # 2. Apply Zoom (1.0x to 3.0x)
    zoom = max(1.0, min(3.0, float(zoom)))
    crop_w = max(10, int(base_w / zoom))
    crop_h = max(10, int(base_h / zoom))
    
    # 3. Base center
    center_x = base_x + base_w / 2.0
    center_y = base_y + base_h / 2.0
    
    # 4. Apply Pan offset (-50 to +50 percent)
    max_offset_x = (orig_w - crop_w) / 2.0
    max_offset_y = (orig_h - crop_h) / 2.0
    
    offset_x = (float(pan_x) / 50.0) * max_offset_x if max_offset_x > 0 else 0
    offset_y = (float(pan_y) / 50.0) * max_offset_y if max_offset_y > 0 else 0
    
    final_x = int(np.clip(center_x - crop_w / 2.0 - offset_x, 0, max(0, orig_w - crop_w)))
    final_y = int(np.clip(center_y - crop_h / 2.0 - offset_y, 0, max(0, orig_h - crop_h)))
    
    cropped = pil_img.crop((final_x, final_y, final_x + crop_w, final_y + crop_h))
    return cropped.resize((max(1, target_w), max(1, target_h)), Image.Resampling.LANCZOS)
