import os
import io
import time
import zipfile
import threading
import uuid
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from PIL import Image

import cv2
from core.engine import CloningPipeline, render_custom_slide
from core.face_cropper import load_upright_image

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024  # Support up to 500MB uploads (high-res videos)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUTS_DIR = os.path.join(BASE_DIR, "inputs")
OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")
STICKERS_DIR = os.path.join(BASE_DIR, "assets", "stickers")
os.makedirs(INPUTS_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.makedirs(STICKERS_DIR, exist_ok=True)

# In-memory job tracker with disk persistence
jobs = {}

def load_existing_jobs():
    """Scans outputs/ directory and restores completed jobs into memory on startup."""
    import json
    if not os.path.exists(OUTPUTS_DIR):
        return
    subdirs = [d for d in os.listdir(OUTPUTS_DIR) if d.startswith("job_") and os.path.isdir(os.path.join(OUTPUTS_DIR, d))]
    subdirs.sort(key=lambda d: os.path.getmtime(os.path.join(OUTPUTS_DIR, d)))
    for d in subdirs:
        j_id = d.replace("job_", "")
        j_dir = os.path.join(OUTPUTS_DIR, d)
        meta_path = os.path.join(j_dir, "job_meta.json")
        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    jobs[j_id] = json.load(f)
                    continue
            except Exception:
                pass
        # Reconstruct from files if metadata file is absent
        files = os.listdir(j_dir)
        jpgs = sorted([f for f in files if f.startswith("slide_") and f.endswith(".jpg")])
        if jpgs:
            slides = []
            for idx, jf in enumerate(jpgs, 1):
                base = os.path.splitext(jf)[0]
                mp4_name = f"{base}.mp4"
                slides.append({
                    "index": idx,
                    "title": f"Slide {idx}",
                    "jpg": jf,
                    "mp4": mp4_name if mp4_name in files else jf
                })
            jobs[j_id] = {
                "id": j_id,
                "url": "https://www.instagram.com/p/DeWFEfKlD3X",
                "status": "completed",
                "percent": 100,
                "message": "Cloning complete! Ready to view & download.",
                "result": {
                    "slides": slides,
                    "reel": "full_carousel_reel.mp4" if "full_carousel_reel.mp4" in files else None,
                    "output_dir": j_dir
                }
            }

load_existing_jobs()


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/api/media", methods=["GET"])
def get_media():
    """Lists all files in inputs/ directory with live thumbnails."""
    import urllib.parse
    files = []
    valid_img = [".jpg", ".jpeg", ".png"]
    valid_vid = [".mp4", ".mov", ".avi"]
    
    for f in sorted(os.listdir(INPUTS_DIR)):
        p = os.path.join(INPUTS_DIR, f)
        if not os.path.isfile(p):
            continue
        ext = os.path.splitext(f)[1].lower()
        size_mb = round(os.path.getsize(p) / (1024 * 1024), 2)
        
        m_type = "image" if ext in valid_img else ("video" if ext in valid_vid else "other")
        if m_type != "other":
            files.append({
                "name": f,
                "type": m_type,
                "size_mb": size_mb,
                "thumb_url": f"/api/thumbnail/{urllib.parse.quote(f)}"
            })
            
    return jsonify({"files": files, "count": len(files)})

@app.route("/api/thumbnail/<path:filename>")
def get_thumbnail(filename):
    """Generates on-the-fly fast thumbnail for both images and videos."""
    import urllib.parse
    filename = urllib.parse.unquote(filename)
    safe_name = os.path.basename(filename)
    p = os.path.join(INPUTS_DIR, safe_name)
    if not os.path.exists(p):
        return "Not found", 404
    try:
        ext = os.path.splitext(safe_name)[1].lower()
        if ext in [".mp4", ".mov", ".avi"]:
            cap = cv2.VideoCapture(p)
            ret, frame = cap.read()
            cap.release()
            if not ret or frame is None:
                return "Failed to extract video thumbnail", 500
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img = Image.fromarray(rgb)
        else:
            img = load_upright_image(p)
            
        img.thumbnail((300, 300))
        bio = io.BytesIO()
        img.save(bio, "JPEG", quality=80)
        bio.seek(0)
        return send_file(bio, mimetype="image/jpeg")
    except Exception as e:
        return str(e), 500

@app.route("/api/upload", methods=["POST"])
def upload_files():
    """Uploads multimedia files into inputs/ folder safely."""
    if "files" not in request.files:
        return jsonify({"error": "No files provided"}), 400
        
    uploaded = []
    files = request.files.getlist("files")
    if not files or len(files) == 0:
        return jsonify({"error": "No files selected"}), 400

    for f in files:
        if f and f.filename:
            safe_name = os.path.basename(f.filename)
            save_path = os.path.join(INPUTS_DIR, safe_name)
            f.save(save_path)
            uploaded.append(safe_name)
            
    return jsonify({"success": True, "uploaded": uploaded, "count": len(uploaded)})

@app.route("/api/delete_media", methods=["POST"])
def delete_media():
    """Deletes a file from inputs/."""
    data = request.json or {}
    filename = data.get("filename")
    if not filename:
        return jsonify({"error": "Filename required"}), 400
    import urllib.parse
    filename = urllib.parse.unquote(filename)
    safe_name = os.path.basename(filename)
    p = os.path.join(INPUTS_DIR, safe_name)
    if os.path.exists(p):
        try:
            os.remove(p)
            return jsonify({"success": True, "deleted": safe_name})
        except Exception as e:
            return jsonify({"error": f"Failed to delete file: {str(e)}"}), 500
    return jsonify({"error": f"File '{safe_name}' not found"}), 404

def run_pipeline_worker(job_id, url):
    job_out_dir = os.path.join(OUTPUTS_DIR, f"job_{job_id}")
    
    def update_progress(msg, pct):
        jobs[job_id]["status"] = "running"
        jobs[job_id]["message"] = msg
        jobs[job_id]["percent"] = pct
        
    try:
        pipeline = CloningPipeline(
            post_url=url,
            inputs_dir=INPUTS_DIR,
            output_dir=job_out_dir,
            progress_cb=update_progress
        )
        result = pipeline.run()
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["percent"] = 100
        jobs[job_id]["message"] = "Cloning complete! Ready to view & download."
        jobs[job_id]["result"] = result
        try:
            import json
            with open(os.path.join(job_out_dir, "job_meta.json"), "w", encoding="utf-8") as f:
                json.dump(jobs[job_id], f, indent=2)
        except Exception as err:
            print("Failed to save job metadata:", err)
    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["message"] = str(e)

@app.route("/api/clone", methods=["POST"])
def start_clone():
    """Initiates an asynchronous cloning job."""
    data = request.json or {}
    url = data.get("url")
    if not url:
        return jsonify({"error": "Instagram Post URL required"}), 400
        
    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {
        "id": job_id,
        "url": url,
        "status": "queued",
        "percent": 0,
        "message": "Initializing pipeline..."
    }
    
    thread = threading.Thread(target=run_pipeline_worker, args=(job_id, url), daemon=True)
    thread.start()
    
    return jsonify({"success": True, "job_id": job_id})

@app.route("/api/status/<job_id>")
def get_status(job_id):
    """Polls the status of an ongoing cloning job."""
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)

@app.route("/api/latest_job")
def get_latest_job():
    """Returns the most recently completed job so results persist across browser reloads."""
    for j_id, j_data in reversed(list(jobs.items())):
        if j_data.get("status") == "completed":
            return jsonify({"job": {**j_data, "id": j_id}})
    return jsonify({"job": None})

@app.route("/api/output/<job_id>/<filename>")
def get_output_file(job_id, filename):
    """Serves generated slide images and videos for browser preview."""
    job_dir = os.path.join(OUTPUTS_DIR, f"job_{job_id}")
    return send_from_directory(job_dir, filename)

@app.route("/api/download/<job_id>/<filename>")
def download_file(job_id, filename):
    """Forces direct attachment download of JPG or MP4."""
    job_dir = os.path.join(OUTPUTS_DIR, f"job_{job_id}")
    return send_from_directory(job_dir, filename, as_attachment=True)

@app.route("/api/download_zip/<job_id>")
def download_zip(job_id):
    """Streams cached zip archive from disk with zero memory overhead."""
    job_dir = os.path.join(OUTPUTS_DIR, f"job_{job_id}")
    if not os.path.exists(job_dir):
        return "Job directory not found", 404
        
    zip_path = os.path.join(job_dir, f"instagram_carousel_{job_id}.zip")
    if not os.path.exists(zip_path):
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(job_dir):
                if "reference_slides" in root:
                    continue
                for f in files:
                    if f.endswith(".zip"):
                        continue
                    full_p = os.path.join(root, f)
                    rel_p = os.path.relpath(full_p, job_dir)
                    zf.write(full_p, rel_p)
                    
    return send_file(
        zip_path,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"instagram_carousel_{job_id}.zip"
    )

@app.route("/api/stickers")
def list_stickers():
    """Lists available beach & scrapbook stickers for the Story Builder with categories."""
    if not os.path.exists(STICKERS_DIR):
        return jsonify({"stickers": []})
    files = [f for f in os.listdir(STICKERS_DIR) if f.lower().endswith((".png", ".webp", ".jpg")) and not f.endswith("_hq.png")]
    
    category_map = {
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

    stickers = []
    for f in sorted(files):
        lower_name = f.lower()
        cat = "other"
        for kw, c in category_map.items():
            if kw in lower_name:
                cat = c
                break
        stickers.append({
            "name": f,
            "title": os.path.splitext(f)[0].replace("_", " ").title(),
            "category": cat,
            "url": f"/api/sticker/{f}"
        })
    return jsonify({"stickers": stickers})

@app.route("/api/stickers/search", methods=["GET"])
def search_stickers():
    """Searches stickers by query across title, filename, and category."""
    q = (request.args.get("q") or "").strip().lower()
    cat = (request.args.get("category") or "").strip().lower()
    
    if not os.path.exists(STICKERS_DIR):
        return jsonify({"results": []})
        
    files = [f for f in os.listdir(STICKERS_DIR) if f.lower().endswith((".png", ".webp", ".jpg")) and not f.endswith("_hq.png")]
    results = []
    
    category_map = {
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

    for f in sorted(files):
        title = os.path.splitext(f)[0].replace("_", " ").title()
        file_cat = "other"
        for kw, c in category_map.items():
            if kw in f.lower():
                file_cat = c
                break
                
        if cat and cat != "all" and file_cat != cat:
            continue
            
        if not q or (q in f.lower()) or (q in title.lower()) or (q in file_cat):
            results.append({
                "name": f,
                "title": title,
                "category": file_cat,
                "url": f"/api/sticker/{f}"
            })
            
    return jsonify({"results": results, "count": len(results)})

@app.route("/api/stickers/upload", methods=["POST"])
def upload_sticker():
    """Allows users to upload their own transparent PNG cutouts as stickers."""
    if "sticker" not in request.files:
        return jsonify({"error": "No sticker file provided"}), 400
    st_file = request.files["sticker"]
    if not st_file or not st_file.filename:
        return jsonify({"error": "Empty filename"}), 400
        
    ext = os.path.splitext(st_file.filename)[1].lower()
    if ext not in [".png", ".webp", ".jpg", ".jpeg"]:
        return jsonify({"error": "Only PNG/WebP/JPG sticker images allowed"}), 400
        
    safe_name = f"custom_{int(time.time())}_{st_file.filename.replace(' ', '_')}"
    dest_path = os.path.join(STICKERS_DIR, safe_name)
    st_file.save(dest_path)
    
    return jsonify({
        "success": True,
        "sticker": {
            "name": safe_name,
            "title": os.path.splitext(st_file.filename)[0].replace("_", " ").title(),
            "category": "custom",
            "url": f"/api/sticker/{safe_name}"
        }
    })

@app.route("/api/sticker/<filename>")
def get_sticker(filename):
    """Serves sticker assets for canvas overlay."""
    return send_from_directory(STICKERS_DIR, filename)

@app.route("/api/custom_slide", methods=["POST"])
def custom_slide():
    """Renders a customized slide from user adjustments in the Story Builder."""
    data = request.json or {}
    job_id = data.get("job_id")
    slide_index = int(data.get("slide_index", 1))
    slots_data = data.get("slots", [])
    stickers_data = data.get("stickers", [])
    bg_color = data.get("bg_color", [50, 52, 55])
    is_full_bleed = bool(data.get("is_full_bleed", False))
    
    if not job_id:
        return jsonify({"error": "Job ID required"}), 400
        
    job_dir = os.path.join(OUTPUTS_DIR, f"job_{job_id}")
    if not os.path.exists(job_dir):
        return jsonify({"error": "Job directory not found"}), 404
        
    try:
        updated_slide = render_custom_slide(
            job_dir=job_dir,
            slide_idx=slide_index,
            slots_data=slots_data,
            stickers_data=stickers_data,
            bg_color=bg_color,
            is_full_bleed=is_full_bleed,
            inputs_dir=INPUTS_DIR
        )
        
        # Update job in memory and in job_meta.json
        if job_id in jobs and "result" in jobs[job_id] and "slides" in jobs[job_id]["result"]:
            for i, s in enumerate(jobs[job_id]["result"]["slides"]):
                if s["index"] == slide_index:
                    jobs[job_id]["result"]["slides"][i] = {
                        **s,
                        "slots": slots_data,
                        "stickers": stickers_data,
                        "bg_color": bg_color,
                        "is_full_bleed": is_full_bleed
                    }
                    break
            import json
            meta_path = os.path.join(job_dir, "job_meta.json")
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(jobs[job_id], f, indent=2)
                
        return jsonify({"success": True, "slide": updated_slide})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("\n============================================================")
    print(">> INSTAGRAM CAROUSEL CLONING ENGINE WEB SERVER")
    print(">> Running on: http://localhost:5000")
    print("============================================================\n")
    app.run(host="0.0.0.0", port=5000, debug=False)

