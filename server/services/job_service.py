import os
import json
import uuid
import zipfile
import threading
from server.config import INPUTS_DIR, OUTPUTS_DIR
from core.engine import CloningPipeline

jobs = {}
_jobs_lock = threading.Lock()

def load_existing_jobs():
    """Scans outputs/ directory and restores completed jobs into memory on startup."""
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
        try:
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
        except Exception:
            pass

def get_job(job_id):
    """Returns job dictionary or None."""
    return jobs.get(job_id)

def get_latest_completed_job():
    """Returns the most recently completed job so results persist across browser reloads."""
    for j_id, j_data in reversed(list(jobs.items())):
        if j_data.get("status") == "completed":
            return {**j_data, "id": j_id}
    return None

def run_pipeline_worker(job_id, url):
    """Background worker for autonomous cloning pipeline."""
    job_out_dir = os.path.join(OUTPUTS_DIR, f"job_{job_id}")
    
    def update_progress(msg, pct):
        with _jobs_lock:
            if job_id in jobs:
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
        with _jobs_lock:
            if job_id in jobs:
                jobs[job_id]["status"] = "completed"
                jobs[job_id]["percent"] = 100
                jobs[job_id]["message"] = "Cloning complete! Ready to view & download."
                jobs[job_id]["result"] = result
        try:
            with open(os.path.join(job_out_dir, "job_meta.json"), "w", encoding="utf-8") as f:
                with _jobs_lock:
                    dump_data = dict(jobs.get(job_id, {}))
                json.dump(dump_data, f, indent=2)
        except Exception as err:
            print("Failed to save job metadata:", err)
    except Exception as e:
        with _jobs_lock:
            if job_id in jobs:
                jobs[job_id]["status"] = "error"
                jobs[job_id]["message"] = str(e)

def start_clone_job(url):
    """Spawns an asynchronous background cloning job."""
    job_id = str(uuid.uuid4())[:8]
    with _jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "url": url,
            "status": "queued",
            "percent": 0,
            "message": "Initializing pipeline..."
        }
    
    thread = threading.Thread(target=run_pipeline_worker, args=(job_id, url), daemon=True)
    thread.start()
    return job_id

def update_slide_metadata(job_id, slide_index, slots_data, stickers_data, bg_color, is_full_bleed):
    """Updates memory and disk metadata after user customizations."""
    with _jobs_lock:
        if job_id in jobs and "result" in jobs[job_id] and "slides" in jobs[job_id]["result"]:
            for i, s in enumerate(jobs[job_id]["result"]["slides"]):
                if s.get("index") == slide_index:
                    jobs[job_id]["result"]["slides"][i] = {
                        **s,
                        "slots": slots_data,
                        "stickers": stickers_data,
                        "bg_color": bg_color,
                        "is_full_bleed": is_full_bleed
                    }
                    break
        dump_data = dict(jobs.get(job_id, {})) if job_id in jobs else None

    if dump_data:
        job_dir = os.path.join(OUTPUTS_DIR, f"job_{job_id}")
        meta_path = os.path.join(job_dir, "job_meta.json")
        try:
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(dump_data, f, indent=2)
        except Exception as err:
            print("Error writing updated job metadata:", err)

def get_or_create_zip_path(job_id):
    """Returns absolute path to zipped package, building it if needed."""
    job_dir = os.path.join(OUTPUTS_DIR, f"job_{job_id}")
    if not os.path.exists(job_dir):
        return None
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
    return zip_path
