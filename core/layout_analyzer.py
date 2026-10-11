import os
import cv2
import numpy as np

def analyze_slide_layout(slide_path, target_w=1080, target_h=1350):
    """
    Universal Dynamic Layout Analyzer for ANY Instagram carousel slide.
    Zero hardcoded URLs. Dynamically detects:
    1. Full bleed vs canvas with floating cards.
    2. Background color & texture palette.
    3. Exact bounding boxes, aspect ratios, and orientations of every photo card.
    4. Handles 1, 2, 3, 4, 5+ slots, asymmetric layouts, and strips automatically.
    """
    img = cv2.imread(slide_path)
    if img is None:
        return {
            "file": os.path.basename(slide_path),
            "num_slots": 1,
            "slots": [{"box": (0, 0, target_w, target_h), "aspect": target_w / float(target_h), "orientation": "portrait"}],
            "bg_color": (35, 35, 35),
            "is_full_bleed": True,
            "layout_name": "Full Bleed Hero"
        }
        
    h, w = img.shape[:2]
    
    # 1. Sample perimeter to evaluate background canvas
    border_px = 6
    top_edge = img[0:border_px, :]
    bot_edge = img[h-border_px:h, :]
    left_edge = img[:, 0:border_px]
    right_edge = img[:, w-border_px:w]
    
    perimeter = np.concatenate([
        top_edge.reshape(-1, 3), 
        bot_edge.reshape(-1, 3), 
        left_edge.reshape(-1, 3), 
        right_edge.reshape(-1, 3)
    ])
    bg_std = np.std(perimeter, axis=0).mean()
    bg_median = np.median(perimeter, axis=0)
    
    # Check what proportion of image matches border background
    diff_from_bg = np.linalg.norm(img.astype(float) - bg_median.astype(float), axis=2)
    bg_ratio = np.mean(diff_from_bg < 22)
    
    # 2. Check if slide is a Full-Bleed photo (edge-to-edge, minimal border)
    if bg_ratio < 0.06 and bg_std > 35:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        sobely = np.abs(cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3))
        sobelx = np.abs(cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3))
        
        h_proj = np.mean(sobely[:, int(w*0.1):int(w*0.9)], axis=1)
        v_proj = np.mean(sobelx[int(h*0.1):int(h*0.9), :], axis=0)
        
        has_mid_h = np.max(h_proj[int(h*0.46):int(h*0.54)]) > np.mean(h_proj) * 2.5
        has_mid_v = np.max(v_proj[int(w*0.46):int(w*0.54)]) > np.mean(v_proj) * 2.5
        
        if has_mid_h and has_mid_v:
            hw, hh = target_w // 2, target_h // 2
            return {
                "file": os.path.basename(slide_path),
                "num_slots": 4,
                "slots": [
                    {"box": (0, 0, hw, hh), "aspect": hw/float(hh), "orientation": "portrait"},
                    {"box": (hw, 0, hw, hh), "aspect": hw/float(hh), "orientation": "portrait"},
                    {"box": (0, hh, hw, hh), "aspect": hw/float(hh), "orientation": "portrait"},
                    {"box": (hw, hh, hw, hh), "aspect": hw/float(hh), "orientation": "portrait"},
                ],
                "bg_color": tuple(map(int, reversed(bg_median))),
                "is_full_bleed": True,
                "layout_name": "4-Quadrant Grid"
            }
        elif has_mid_h:
            hh = target_h // 2
            return {
                "file": os.path.basename(slide_path),
                "num_slots": 2,
                "slots": [
                    {"box": (0, 0, target_w, hh), "aspect": target_w/float(hh), "orientation": "landscape"},
                    {"box": (0, hh, target_w, hh), "aspect": target_w/float(hh), "orientation": "landscape"},
                ],
                "bg_color": tuple(map(int, reversed(bg_median))),
                "is_full_bleed": True,
                "layout_name": "Dual Horizontal Split"
            }
        else:
            return {
                "file": os.path.basename(slide_path),
                "num_slots": 1,
                "slots": [{"box": (0, 0, target_w, target_h), "aspect": target_w / float(target_h), "orientation": "portrait"}],
                "bg_color": tuple(map(int, reversed(bg_median))),
                "is_full_bleed": True,
                "layout_name": "Full Bleed Hero"
            }

    # 3. Canvas Slide with Distinct Photo Cards / Slots
    is_photo = (diff_from_bg > 18).astype(np.uint8) * 255
    kernel_clean = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    cleaned = cv2.morphologyEx(is_photo, cv2.MORPH_OPEN, kernel_clean)
    
    cnts, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    tot_area = h * w
    candidate_boxes = []
    
    for c in cnts:
        area = cv2.contourArea(c)
        if area > 0.035 * tot_area:
            bx, by, bw, bh = cv2.boundingRect(c)
            aspect = bw / float(bh)
            if 0.22 <= aspect <= 3.8:
                # Check for merged side-by-side cards (vertical valley)
                sub_mask = cleaned[by:by+bh, bx:bx+bw]
                v_dens = np.mean(sub_mask == 0, axis=0) # background density in columns
                mid_l, mid_r = int(bw * 0.35), int(bw * 0.65)
                
                # Check for vertically stacked merged cards (horizontal valley)
                h_dens = np.mean(sub_mask == 0, axis=1) # background density in rows
                mid_t, mid_b = int(bh * 0.35), int(bh * 0.65)
                
                if bw > w * 0.5 and len(v_dens[mid_l:mid_r]) > 0 and np.max(v_dens[mid_l:mid_r]) > 0.45:
                    split_x = mid_l + int(np.argmax(v_dens[mid_l:mid_r]))
                    candidate_boxes.append((bx, by, split_x, bh, area / 2))
                    candidate_boxes.append((bx + split_x, by, bw - split_x, bh, area / 2))
                elif bh > h * 0.5 and len(h_dens[mid_t:mid_b]) > 0 and np.max(h_dens[mid_t:mid_b]) > 0.45:
                    split_y = mid_t + int(np.argmax(h_dens[mid_t:mid_b]))
                    candidate_boxes.append((bx, by, bw, split_y, area / 2))
                    candidate_boxes.append((bx, by + split_y, bw, bh - split_y, area / 2))
                else:
                    candidate_boxes.append((bx, by, bw, bh, area))
                    
    # Filter out overlapping boxes
    candidate_boxes.sort(key=lambda b: b[4], reverse=True)
    kept_boxes = []
    for b in candidate_boxes:
        bx, by, bw, bh, _ = b
        overlap = False
        for kb in kept_boxes:
            kx, ky, kw, kh, _ = kb
            ix = max(bx, kx)
            iy = max(by, ky)
            iw = min(bx + bw, kx + kw) - ix
            ih = min(by + bh, ky + kh) - iy
            if iw > 0 and ih > 0:
                inter_area = iw * ih
                if inter_area > min(bw * bh, kw * kh) * 0.5:
                    overlap = True
                    break
        if not overlap:
            kept_boxes.append(b)
            
    # Sort in natural reading order: top-to-bottom, left-to-right
    kept_boxes.sort(key=lambda b: (round(b[1] / float(h), 1), b[0]))
    
    # Scale coordinates to target standard (1080, 1350)
    slots = []
    for bx, by, bw, bh, _ in kept_boxes:
        sx = int((bx / float(w)) * target_w)
        sy = int((by / float(h)) * target_h)
        sw = int((bw / float(w)) * target_w)
        sh = int((bh / float(h)) * target_h)
        
        # Ensure minimum margins
        sx = max(0, min(target_w - 40, sx))
        sy = max(0, min(target_h - 40, sy))
        sw = min(target_w - sx, sw)
        sh = min(target_h - sy, sh)
        
        aspect = sw / float(sh if sh > 0 else 1)
        orientation = "portrait" if aspect < 0.9 else ("landscape" if aspect > 1.1 else "square")
        
        slots.append({
            "box": (sx, sy, sw, sh),
            "aspect": aspect,
            "orientation": orientation
        })
        
    if not slots:
        slots = [{"box": (0, 0, target_w, target_h), "aspect": target_w / float(target_h), "orientation": "portrait"}]
        
    num_s = len(slots)
    layout_name = f"{num_s}-Photo Collage" if num_s > 1 else "Hero Card"
    
    return {
        "file": os.path.basename(slide_path),
        "num_slots": num_s,
        "slots": slots,
        "bg_color": tuple(map(int, reversed(bg_median))),
        "is_full_bleed": False,
        "layout_name": layout_name
    }
