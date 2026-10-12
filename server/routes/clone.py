import os
from flask import Blueprint, request, jsonify, send_file, send_from_directory
from server.config import OUTPUTS_DIR, INPUTS_DIR
from core.engine import render_custom_slide
from server.services.job_service import (
    start_clone_job,
    get_job,
    get_latest_completed_job,
    update_slide_metadata,
    get_or_create_zip_path
)

clone_bp = Blueprint("clone", __name__, url_prefix="/api")

@clone_bp.route("/clone", methods=["POST"])
def clone_post():
    """Initiates an asynchronous cloning job."""
    data = request.json or {}
    url = data.get("url")
    if not url:
        return jsonify({"error": "Instagram Post URL required"}), 400
        
    job_id = start_clone_job(url)
    return jsonify({"success": True, "job_id": job_id})

@clone_bp.route("/status/<job_id>")
def get_job_status(job_id):
    """Polls the status of an ongoing cloning job."""
    job = get_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)

@clone_bp.route("/latest_job")
def get_latest_job():
    """Returns the most recently completed job so results persist across browser reloads."""
    job = get_latest_completed_job()
    return jsonify({"job": job})

@clone_bp.route("/output/<job_id>/<filename>")
def get_output_file(job_id, filename):
    """Serves generated slide images and videos for browser preview."""
    job_dir = os.path.join(OUTPUTS_DIR, f"job_{job_id}")
    return send_from_directory(job_dir, filename)

@clone_bp.route("/download/<job_id>/<filename>")
def download_file(job_id, filename):
    """Forces direct attachment download of JPG or MP4."""
    job_dir = os.path.join(OUTPUTS_DIR, f"job_{job_id}")
    return send_from_directory(job_dir, filename, as_attachment=True)

@clone_bp.route("/download_zip/<job_id>")
def download_zip(job_id):
    """Streams cached zip archive from disk with zero memory overhead."""
    zip_path = get_or_create_zip_path(job_id)
    if not zip_path or not os.path.exists(zip_path):
        return "Job directory not found", 404
        
    return send_file(
        zip_path,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"instagram_carousel_{job_id}.zip"
    )

@clone_bp.route("/custom_slide", methods=["POST"])
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
        
        # Persist updated metadata in memory and disk
        update_slide_metadata(
            job_id=job_id,
            slide_index=slide_index,
            slots_data=slots_data,
            stickers_data=stickers_data,
            bg_color=bg_color,
            is_full_bleed=is_full_bleed
        )
        
        return jsonify({"success": True, "slide": updated_slide})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
