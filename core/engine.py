import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from moviepy import (
    ColorClip,
    ImageClip,
    VideoFileClip,
    CompositeVideoClip,
    concatenate_videoclips
)

import random
from core.harvester import harvest_instagram_post
from core.face_cropper import load_upright_image, smart_face_crop, crop_zoom_pan_image
from core.stickers import load_sticker, make_polaroid, create_location_pill
from core.backgrounds import generate_dynamic_background, extract_dominant_colors
from core.layout_analyzer import analyze_slide_layout

def generate_torn_polygon(w, h, margin=20, roughness=4.5, step=5, seed=None):
    if seed is not None:
        random.seed(seed)
    pts = []
    for x in range(margin, w - margin, step):
        pts.append((x, margin + random.uniform(-roughness, roughness)))
    pts.append((w - margin, margin))
    for y in range(margin, h - margin, step):
        pts.append((w - margin + random.uniform(-roughness, roughness), y))
    pts.append((w - margin, h - margin))
    for x in range(w - margin, margin, -step):
        pts.append((x, h - margin + random.uniform(-roughness, roughness)))
    pts.append((margin, h - margin))
    for y in range(h - margin, margin, -step):
        pts.append((margin + random.uniform(-roughness, roughness), y))
    pts.append((margin, margin))
    smoothed = []
    n = len(pts)
    for i in range(n):
        p_prev, p_curr, p_next = pts[(i - 1) % n], pts[i], pts[(i + 1) % n]
        smoothed.append((0.25 * p_prev[0] + 0.5 * p_curr[0] + 0.25 * p_next[0],
                         0.25 * p_prev[1] + 0.5 * p_curr[1] + 0.25 * p_next[1]))
    return smoothed

def make_torn_paper_card(img, target_size, border_width=12, roughness=4.5, shadow_blur=10, seed=42):
    tw, th = target_size
    pad = 24
    card_w = tw + pad * 2
    card_h = th + pad * 2
    outer_poly = generate_torn_polygon(card_w, card_h, margin=pad - border_width, roughness=roughness, step=4, seed=seed)
    inner_poly = generate_torn_polygon(card_w, card_h, margin=pad, roughness=roughness * 0.7, step=4, seed=seed + 100)
    card = Image.new("RGBA", (card_w, card_h), (0, 0, 0, 0))
    outer_mask = Image.new("L", (card_w, card_h), 0)
    ImageDraw.Draw(outer_mask).polygon(outer_poly, fill=255)
    white_bg = Image.new("RGBA", (card_w, card_h), (252, 250, 246, 255))
    card.paste(white_bg, (0, 0), outer_mask)
    photo_rgba = img.convert("RGBA").resize((tw, th), Image.Resampling.LANCZOS)
    inner_mask = Image.new("L", (card_w, card_h), 0)
    ImageDraw.Draw(inner_mask).polygon(inner_poly, fill=255)
    card.paste(photo_rgba, (pad, pad), inner_mask.crop((pad, pad, pad + tw, pad + th)))
    shadow_mask = outer_mask.filter(ImageFilter.GaussianBlur(shadow_blur))
    shadow_img = Image.new("RGBA", (card_w + 20, card_h + 20), (0, 0, 0, 0))
    s_layer = Image.new("RGBA", (card_w, card_h), (20, 15, 10, 85))
    shadow_img.paste(s_layer, (10, 16), shadow_mask)
    final_card = Image.new("RGBA", (card_w + 20, card_h + 20), (0, 0, 0, 0))
    final_card = Image.alpha_composite(final_card, shadow_img)
    final_card.paste(card, (10, 10), card)
    return final_card

def add_card_styling(img, corner_radius=14, border_width=3, border_color=(255, 255, 255)):
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([(0, 0), (w, h)], radius=corner_radius, fill=255)
    
    rounded_img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    rounded_img.paste(img.convert('RGBA'), (0, 0), mask)
    d_border = ImageDraw.Draw(rounded_img)
    if border_width > 0:
        d_border.rounded_rectangle([(0, 0), (w - 1, h - 1)], radius=corner_radius, outline=border_color, width=border_width)
        
    return rounded_img

def paste_card_with_shadow(canvas, card_rgba, box, shadow_offset=(0, 10), shadow_blur=18, shadow_opacity=120):
    sx, sy, sw, sh = box
    pad = shadow_blur * 2
    
    card_alpha = card_rgba.split()[3]
    shadow_img = Image.new('RGBA', (sw + pad * 2, sh + pad * 2), (0, 0, 0, 0))
    black_fill = Image.new('RGBA', (sw, sh), (0, 0, 0, shadow_opacity))
    shadow_img.paste(black_fill, (pad, pad), card_alpha)
    shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(shadow_blur))
    
    canvas_rgba = canvas.convert('RGBA')
    shadow_pos = (sx + shadow_offset[0] - pad, sy + shadow_offset[1] - pad)
    canvas_rgba.alpha_composite(shadow_img, dest=shadow_pos)
    canvas_rgba.alpha_composite(card_rgba, dest=(sx, sy))
    return canvas_rgba.convert('RGB')

def create_textured_canvas(w, h, bg_color):
    noise = np.random.normal(0, 3.5, (h, w, 3)).astype(np.int16)
    base_np = np.full((h, w, 3), bg_color, dtype=np.int16) + noise
    base_np = np.clip(base_np, 0, 255).astype(np.uint8)
    return Image.fromarray(base_np)

def get_font(size=36, bold=False):
    candidates = [
        "C:\\Windows\\Fonts\\segoeui.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
        "C:\\Windows\\Fonts\\calibri.ttf"
    ]
    if bold:
        candidates = [
            "C:\\Windows\\Fonts\\segoeuib.ttf",
            "C:\\Windows\\Fonts\\arialbd.ttf",
            "C:\\Windows\\Fonts\\calibrib.ttf"
        ] + candidates
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()

class CloningPipeline:
    def __init__(self, post_url, inputs_dir, output_dir, progress_cb=None):
        self.post_url = post_url
        self.inputs_dir = inputs_dir
        self.output_dir = output_dir
        self.progress_cb = progress_cb or (lambda msg, pct: None)
        self.ref_dir = os.path.join(output_dir, "reference_slides")
        
    def scan_media(self):
        valid_img = [".jpg", ".jpeg", ".png"]
        valid_vid = [".mp4", ".mov", ".avi"]
        
        all_imgs = []
        all_vids = []
        
        for f in sorted(os.listdir(self.inputs_dir)):
            p = os.path.join(self.inputs_dir, f)
            if not os.path.isfile(p):
                continue
            ext = os.path.splitext(f)[1].lower()
            if ext in valid_img:
                all_imgs.append(p)
            elif ext in valid_vid:
                all_vids.append(p)
                
        portraits = []
        landscapes = []
        
        for p in all_imgs:
            try:
                with Image.open(p) as img:
                    w, h = img.size
                    if h >= w:
                        portraits.append(p)
                    else:
                        landscapes.append(p)
            except Exception:
                portraits.append(p)
                
        if not portraits and landscapes:
            portraits = landscapes
        if not landscapes and portraits:
            landscapes = portraits
            
        return {
            "all_images": all_imgs,
            "portraits": portraits,
            "landscapes": landscapes,
            "videos": all_vids
        }

    def run(self):
        self.progress_cb("Navigating & harvesting reference slides from Instagram post...", 10)
        ref_slides = harvest_instagram_post(self.post_url, self.ref_dir, self.progress_cb)
        
        self.progress_cb("Scanning user multimedia library (photos & videos)...", 35)
        media = self.scan_media()
        portraits = media["portraits"]
        landscapes = media["landscapes"]
        all_images = media["all_images"] or portraits
        videos = media["videos"]
        
        self.progress_cb("Analyzing aesthetic layout structures with Computer Vision...", 45)
        st_hibiscus = load_sticker("blue_hibiscus.png")
        st_cam = load_sticker("vintage_digicam.png")
        st_tape = load_sticker("washi_tape.png")
        
        cw, ch = 1080, 1350
        duration = 3.5
        
        # If harvester got 0 slides (e.g. offline / restricted), use 5 dynamic archetypes
        if not ref_slides:
            slide_archetypes = [
                {
                    "layout_type": "scrapbook_3card",
                    "layout_name": "3-Photo Scrapbook",
                    "num_slots": 3,
                    "is_full_bleed": False,
                    "bg_color": (50, 52, 55),
                    "slots": [
                        {"box": (36, 49, 1008, 541), "aspect": 1008/541.0, "orientation": "landscape"},
                        {"box": (31, 640, 470, 665), "aspect": 470/665.0, "orientation": "portrait"},
                        {"box": (535, 640, 509, 665), "aspect": 509/665.0, "orientation": "portrait"}
                    ]
                },
                {
                    "layout_type": "grid_4quadrant",
                    "layout_name": "4-Quadrant Collage",
                    "num_slots": 4,
                    "is_full_bleed": False,
                    "bg_color": (45, 48, 50),
                    "slots": [
                        {"box": (38, 56, 480, 580), "aspect": 480/580.0, "orientation": "portrait"},
                        {"box": (560, 56, 480, 580), "aspect": 480/580.0, "orientation": "portrait"},
                        {"box": (38, 680, 480, 580), "aspect": 480/580.0, "orientation": "portrait"},
                        {"box": (560, 680, 480, 580), "aspect": 480/580.0, "orientation": "portrait"}
                    ]
                },
                {
                    "layout_type": "video_spotlight" if videos else "asymmetric_3card",
                    "layout_name": "Video Spotlight Collage" if videos else "Asymmetric Showcase",
                    "num_slots": 3,
                    "is_full_bleed": False,
                    "bg_color": (40, 42, 45),
                    "slots": [
                        {"box": (30, 40, 460, 610), "aspect": 460/610.0, "orientation": "portrait"},
                        {"box": (30, 690, 460, 610), "aspect": 460/610.0, "orientation": "portrait"},
                        {"box": (530, 40, 510, 1260), "aspect": 510/1260.0, "orientation": "portrait"}
                    ]
                },
                {
                    "layout_type": "dual_postcards",
                    "layout_name": "Dual Horizontal Postcards",
                    "num_slots": 2,
                    "is_full_bleed": False,
                    "bg_color": (52, 54, 58),
                    "slots": [
                        {"box": (40, 60, 1000, 570), "aspect": 1000/570.0, "orientation": "landscape"},
                        {"box": (40, 690, 1000, 570), "aspect": 1000/570.0, "orientation": "landscape"}
                    ]
                },
                {
                    "layout_type": "hero_card",
                    "layout_name": "Hero Centerpiece",
                    "num_slots": 1,
                    "is_full_bleed": False,
                    "bg_color": (48, 50, 54),
                    "slots": [
                        {"box": (50, 60, 980, 1230), "aspect": 980/1230.0, "orientation": "portrait"}
                    ]
                }
            ]
        else:
            slide_archetypes = []
            for ref_path in ref_slides:
                analysis = analyze_slide_layout(ref_path)
                analysis["ref_path"] = ref_path
                slide_archetypes.append(analysis)
                
        total_slides = len(slide_archetypes)
        video_clips = []
        slides_info = []
        
        img_cursor = 0
        
        # Dynamically assign available user videos to optimal slides/slots
        video_assignments = {}  # maps (slide_idx, slot_idx) -> video_path
        if videos:
            assigned_vids = 0
            candidate_slides = sorted(range(1, total_slides + 1), key=lambda x: (abs(x - (total_slides // 2 + 1)), -x))
            for s_idx in candidate_slides:
                if assigned_vids >= len(videos):
                    break
                s_meta = slide_archetypes[s_idx - 1]
                s_slots = s_meta.get("slots", [])
                if not s_slots:
                    video_assignments[(s_idx, 0)] = videos[assigned_vids]
                    assigned_vids += 1
                    continue
                # Pick largest area slot on this candidate slide
                best_si = 0
                max_area = 0
                for si, sl in enumerate(s_slots):
                    _, _, w, h = sl["box"]
                    if w * h > max_area:
                        max_area = w * h
                        best_si = si
                video_assignments[(s_idx, best_si)] = videos[assigned_vids]
                assigned_vids += 1
        
        for idx, slide_meta in enumerate(slide_archetypes, start=1):
            pct = 45 + int((idx / float(total_slides)) * 45)
            slots = slide_meta.get("slots", [])
            num_slots = len(slots)
            bg_color = slide_meta.get("bg_color", (35, 35, 35))
            is_full_bleed = slide_meta.get("is_full_bleed", False)
            layout_name = slide_meta.get("layout_name", f"{num_slots}-Photo Layout")
            ref_path = slide_meta.get("ref_path", None)
            
            title = f"Slide {idx}: {layout_name}"
            self.progress_cb(f"Rendering Slide {idx}/{total_slides}: {title}...", pct)
            s_name = f"slide_{idx:02d}"
            
            # Universal Dynamic Canvas Creation with subtle paper texture
            if is_full_bleed and num_slots <= 1:
                canvas = Image.new("RGB", (cw, ch), bg_color)
            else:
                canvas = create_textured_canvas(cw, ch, bg_color)
            
            # Track any video slot on this slide
            active_video_slot = None
            
            slot_details = []
            if is_full_bleed and num_slots <= 1:
                if (idx, 0) in video_assignments:
                    vid_path = video_assignments[(idx, 0)]
                    active_video_slot = {"box": (0, 0, cw, ch), "vid_path": vid_path}
                    cap = cv2.VideoCapture(vid_path)
                    ret, frame = cap.read()
                    cap.release()
                    if ret and frame is not None:
                        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        canvas = smart_face_crop(Image.fromarray(rgb), cw, ch)
                    else:
                        canvas = smart_face_crop(load_upright_image(all_images[img_cursor % len(all_images)]), cw, ch)
                        img_cursor += 1
                    slot_details.append({
                        "box": [0, 0, cw, ch],
                        "media_name": os.path.basename(vid_path),
                        "is_video": True,
                        "corner_radius": 0,
                        "border_width": 0,
                        "shadow": False
                    })
                else:
                    p_path = all_images[img_cursor % len(all_images)]
                    img_cursor += 1
                    canvas = smart_face_crop(load_upright_image(p_path), cw, ch)
                    slot_details.append({
                        "box": [0, 0, cw, ch],
                        "media_name": os.path.basename(p_path),
                        "is_video": False,
                        "corner_radius": 0,
                        "border_width": 0,
                        "shadow": False
                    })
            else:
                # Dynamic Multi-Slot Rendering for ANY detected layout with Soft Drop Shadows
                for s_i, slot in enumerate(slots):
                    sx, sy, sw, sh = slot["box"]
                    if sw <= 10 or sh <= 10:
                        continue
                    aspect = slot.get("aspect", sw / float(sh if sh > 0 else 1))
                    
                    # Check if this slot was dynamically assigned a video
                    if (idx, s_i) in video_assignments:
                        vid_path = video_assignments[(idx, s_i)]
                        m_name = os.path.basename(vid_path)
                        active_video_slot = {"box": (sx, sy, sw, sh), "vid_path": vid_path}
                        cap = cv2.VideoCapture(vid_path)
                        ret, frame = cap.read()
                        cap.release()
                        if ret and frame is not None:
                            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                            c_img = smart_face_crop(Image.fromarray(rgb), sw, sh)
                        else:
                            c_img = smart_face_crop(load_upright_image(all_images[img_cursor % len(all_images)]), sw, sh)
                            img_cursor += 1
                        slot_details.append({
                            "box": [sx, sy, sw, sh],
                            "media_name": m_name,
                            "is_video": True,
                            "corner_radius": 14,
                            "border_width": 3,
                            "shadow": True
                        })
                    else:
                        # Match orientation (portrait vs landscape) intelligently
                        if aspect < 0.88 and portraits:
                            m_path = portraits[img_cursor % len(portraits)]
                        elif aspect > 1.12 and landscapes:
                            m_path = landscapes[img_cursor % len(landscapes)]
                        else:
                            m_path = all_images[img_cursor % len(all_images)]
                        m_name = os.path.basename(m_path)
                        img_cursor += 1
                        c_img = smart_face_crop(load_upright_image(m_path), sw, sh)
                        slot_details.append({
                            "box": [sx, sy, sw, sh],
                            "media_name": m_name,
                            "is_video": False,
                            "corner_radius": 14,
                            "border_width": 3,
                            "shadow": True
                        })
                        
                    # Refined boutique card styling with soft drop shadows & rounded corners
                    if sw < cw * 0.96 or sh < ch * 0.96:
                        styled_card = add_card_styling(c_img, corner_radius=14, border_width=3, border_color=(255, 255, 255))
                        canvas = paste_card_with_shadow(canvas, styled_card, (sx, sy, sw, sh), shadow_offset=(0, 10), shadow_blur=18, shadow_opacity=115)
                    else:
                        canvas.paste(c_img, (sx, sy))

            # Export JPG
            jpg_file = f"{s_name}.jpg"
            jpg_path = os.path.join(self.output_dir, jpg_file)
            canvas.save(jpg_path, "JPEG", quality=98)
            
            # Export MP4
            mp4_file = f"{s_name}.mp4"
            mp4_path = os.path.join(self.output_dir, mp4_file)
            
            if active_video_slot:
                vsx, vsy, vsw, vsh = active_video_slot["box"]
                vid_path = active_video_slot["vid_path"]
                bg = ImageClip(np.array(canvas)).with_duration(duration)
                v = VideoFileClip(vid_path)
                sub = v.subclipped(0, v.duration).with_duration(duration) if v.duration < duration else v.subclipped(0, duration)
                v_res = sub.resized((vsw, vsh)).without_audio().with_position((vsx, vsy))
                slide_clip = CompositeVideoClip([bg, v_res], size=(cw, ch))
            else:
                slide_clip = ImageClip(np.array(canvas)).with_duration(duration)
                
            slide_clip.write_videofile(
                mp4_path,
                fps=30,
                preset="ultrafast",
                codec="libx264",
                ffmpeg_params=["-pix_fmt", "yuv420p"]
            )
            slide_clip.close()
            
            slides_info.append({
                "index": idx,
                "title": title,
                "jpg": jpg_file,
                "mp4": mp4_file,
                "slots": slot_details,
                "bg_color": list(bg_color),
                "is_full_bleed": is_full_bleed
            })
            
        # Stitch Reel (Ultra-fast, zero-memory ffmpeg concat)
        self.progress_cb("Compiling continuous carousel Reel video...", 92)
        try:
            import subprocess
            import imageio_ffmpeg
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            all_mp4s = sorted([s["mp4"] for s in slides_info if os.path.exists(os.path.join(self.output_dir, s["mp4"]))])
            reel_file = "full_carousel_reel.mp4"
            reel_path = os.path.join(self.output_dir, reel_file)
            if all_mp4s:
                concat_txt = os.path.join(self.output_dir, "concat_list.txt")
                with open(concat_txt, "w", encoding="utf-8") as f:
                    for f_name in all_mp4s:
                        f.write(f"file '{f_name}'\n")
                temp_reel = os.path.join(self.output_dir, "temp_reel.mp4")
                cmd = [
                    ffmpeg_exe, "-y", "-f", "concat", "-safe", "0",
                    "-i", concat_txt, "-c", "copy", temp_reel
                ]
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if res.returncode == 0 and os.path.exists(temp_reel):
                    if os.path.exists(reel_path):
                        try:
                            os.remove(reel_path)
                        except Exception:
                            pass
                    os.replace(temp_reel, reel_path)
                if os.path.exists(concat_txt):
                    try:
                        os.remove(concat_txt)
                    except Exception:
                        pass
        except Exception as reel_err:
            print(f"Warning: Reel compilation skipped: {reel_err}")
        
        self.progress_cb("Cloning complete! Ready to view & download.", 100)
        return {
            "slides": slides_info,
            "reel": reel_file,
            "output_dir": self.output_dir
        }


def render_custom_slide(job_dir, slide_idx, slots_data, stickers_data=None, bg_color=(50, 52, 55), is_full_bleed=False, inputs_dir="inputs", duration=3.5):
    """
    Renders a customized slide from user-adjusted coordinates, swapped media,
    and stickers from the interactive Story Builder.
    """
    cw, ch = 1080, 1350
    s_name = f"slide_{slide_idx:02d}"
    
    # 1. Background Canvas
    if is_full_bleed and len(slots_data) <= 1:
        canvas = Image.new("RGB", (cw, ch), tuple(bg_color))
    else:
        canvas = create_textured_canvas(cw, ch, tuple(bg_color))
        
    active_video_slot = None
    
    # 2. Render each slot
    for s in slots_data:
        box = s.get("box", [0, 0, cw, ch])
        sx, sy, sw, sh = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        if sw <= 10 or sh <= 10:
            continue
            
        media_name = s.get("media_name", "")
        media_path = os.path.join(inputs_dir, media_name) if media_name else None
        
        is_video = False
        if media_path and os.path.exists(media_path):
            ext = os.path.splitext(media_path)[1].lower()
            if ext in [".mp4", ".mov", ".avi"]:
                is_video = True
                
        radius = int(s.get("corner_radius", 14))
        b_width = int(s.get("border_width", 3))
        has_shadow = bool(s.get("shadow", True))
        zoom = float(s.get("zoom", 1.0))
        pan_x = float(s.get("pan_x", 0.0))
        pan_y = float(s.get("pan_y", 0.0))
        card_style = s.get("card_style", "rounded")
        
        if is_video:
            active_video_slot = {"box": (sx, sy, sw, sh), "vid_path": media_path}
            cap = cv2.VideoCapture(media_path)
            ret, frame = cap.read()
            cap.release()
            if ret and frame is not None:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                c_img = crop_zoom_pan_image(Image.fromarray(rgb), sw, sh, zoom=zoom, pan_x=pan_x, pan_y=pan_y)
            else:
                c_img = Image.new("RGB", (sw, sh), (30, 30, 30))
        elif media_path and os.path.exists(media_path):
            p_img = load_upright_image(media_path)
            c_img = crop_zoom_pan_image(p_img, sw, sh, zoom=zoom, pan_x=pan_x, pan_y=pan_y)
        else:
            c_img = Image.new("RGB", (sw, sh), (80, 80, 80))
            
        if card_style == "torn_paper":
            styled_card = make_torn_paper_card(c_img, (sw, sh), border_width=12, roughness=4.5)
            # make_torn_paper_card has 24px pad and 10px shadow offset
            canvas.paste(styled_card, (sx - 14, sy - 14), styled_card)
        elif sw < cw * 0.96 or sh < ch * 0.96:
            styled_card = add_card_styling(c_img, corner_radius=radius, border_width=b_width, border_color=(255, 255, 255))
            if has_shadow:
                canvas = paste_card_with_shadow(canvas, styled_card, (sx, sy, sw, sh), shadow_offset=(0, 10), shadow_blur=18, shadow_opacity=115)
            else:
                canvas.paste(styled_card, (sx, sy), styled_card)
        else:
            canvas.paste(c_img, (sx, sy))
            
    # 3. Render Stickers / Location Pills / Captions / Emojis
    if stickers_data:
        stickers_base = os.path.join(os.path.dirname(__file__), "..", "assets", "stickers")
        for st in stickers_data:
            s_type = st.get("type", "image_sticker")
            st_x = int(st.get("x", 100))
            st_y = int(st.get("y", 100))
            st_w = int(st.get("w", 180))
            st_h = int(st.get("h", 180))
            st_rot = float(st.get("rotation", 0))
            
            if s_type == "image_sticker":
                st_name = st.get("sticker_name", "")
                st_path = os.path.join(stickers_base, st_name)
                if not os.path.exists(st_path):
                    st_path = os.path.join("assets", "stickers", st_name)
                    
                if os.path.exists(st_path):
                    try:
                        st_raw = Image.open(st_path).convert("RGBA")
                        st_resized = st_raw.resize((max(20, st_w), max(20, st_h)), Image.Resampling.LANCZOS)
                        if st_rot != 0:
                            st_resized = st_resized.rotate(-st_rot, resample=Image.Resampling.BICUBIC, expand=True)
                            
                        # Soft drop shadow for 3D sticker depth
                        pad = 16
                        sh_img = Image.new("RGBA", (st_resized.width + pad * 2, st_resized.height + pad * 2), (0, 0, 0, 0))
                        sh_mask = st_resized.split()[3].filter(ImageFilter.GaussianBlur(6))
                        sh_fill = Image.new("RGBA", (st_resized.width, st_resized.height), (12, 10, 8, 90))
                        sh_img.paste(sh_fill, (pad + 2, pad + 6), sh_mask)
                        
                        canvas_rgba = canvas.convert("RGBA")
                        canvas_rgba.paste(sh_img, (st_x - pad, st_y - pad), sh_img)
                        canvas_rgba.paste(st_resized, (st_x, st_y), st_resized)
                        canvas = canvas_rgba.convert("RGB")
                    except Exception as st_err:
                        print(f"Error rendering sticker {st_name}: {st_err}")
                        
            elif s_type == "emoji":
                emoji_char = st.get("emoji", "🐚")
                d = ImageDraw.Draw(canvas)
                f_size = int(st.get("font_size", 64))
                font = get_font(size=f_size, bold=True)
                d.text((st_x, st_y), emoji_char, font=font, fill=(255, 255, 255))
                
            elif s_type == "location_pill":
                text = st.get("text", "📍 Goa, India")
                pill_img = create_location_pill(text=text)
                canvas.paste(pill_img, (st_x, st_y), pill_img)
                
            elif s_type == "caption":
                text = st.get("text", "")
                if text:
                    d = ImageDraw.Draw(canvas)
                    font_size = int(st.get("font_size", 36))
                    font = get_font(size=font_size, bold=True)
                    color = tuple(st.get("color", (245, 245, 245)))
                    d.text((st_x, st_y), text, font=font, fill=color)

    # 4. Save JPG
    jpg_file = f"{s_name}.jpg"
    jpg_path = os.path.join(job_dir, jpg_file)
    canvas.save(jpg_path, "JPEG", quality=98)
    
    # 5. Save MP4
    mp4_file = f"{s_name}.mp4"
    mp4_path = os.path.join(job_dir, mp4_file)
    
    if active_video_slot:
        vsx, vsy, vsw, vsh = active_video_slot["box"]
        vid_path = active_video_slot["vid_path"]
        bg = ImageClip(np.array(canvas)).with_duration(duration)
        v = VideoFileClip(vid_path)
        sub = v.subclipped(0, v.duration).with_duration(duration) if v.duration < duration else v.subclipped(0, duration)
        v_res = sub.resized((vsw, vsh)).without_audio().with_position((vsx, vsy))
        slide_clip = CompositeVideoClip([bg, v_res], size=(cw, ch))
    else:
        slide_clip = ImageClip(np.array(canvas)).with_duration(duration)
        
    slide_clip.write_videofile(
        mp4_path,
        fps=30,
        preset="ultrafast",
        codec="libx264",
        ffmpeg_params=["-pix_fmt", "yuv420p"]
    )
    slide_clip.close()
    
    # 6. Recompile full Reel (Ultra-fast, zero-memory ffmpeg concat)
    try:
        import subprocess
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        all_mp4s = sorted([f for f in os.listdir(job_dir) if f.startswith("slide_") and f.endswith(".mp4")])
        if all_mp4s:
            concat_txt = os.path.join(job_dir, "concat_list.txt")
            with open(concat_txt, "w", encoding="utf-8") as f:
                for f_name in all_mp4s:
                    f.write(f"file '{f_name}'\n")
            reel_path = os.path.join(job_dir, "full_carousel_reel.mp4")
            temp_reel = os.path.join(job_dir, "temp_reel.mp4")
            cmd = [
                ffmpeg_exe, "-y", "-f", "concat", "-safe", "0",
                "-i", concat_txt, "-c", "copy", temp_reel
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode == 0 and os.path.exists(temp_reel):
                if os.path.exists(reel_path):
                    try:
                        os.remove(reel_path)
                    except Exception:
                        pass
                os.replace(temp_reel, reel_path)
            if os.path.exists(concat_txt):
                try:
                    os.remove(concat_txt)
                except Exception:
                    pass
    except Exception as reel_err:
        print(f"Warning: Reel recompilation skipped: {reel_err}")
            
    return {
        "index": slide_idx,
        "title": f"Slide {slide_idx}: Custom Layout",
        "jpg": jpg_file,
        "mp4": mp4_file,
        "slots": slots_data,
        "stickers": stickers_data or [],
        "bg_color": list(bg_color),
        "is_full_bleed": is_full_bleed,
        "reel": "full_carousel_reel.mp4"
    }

