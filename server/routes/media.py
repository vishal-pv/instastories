from flask import Blueprint, request, jsonify, send_file
from server.services.media_service import (
    list_media,
    generate_thumbnail_bytes,
    save_uploaded_media,
    delete_media_by_name
)

media_bp = Blueprint("media", __name__, url_prefix="/api")

@media_bp.route("/media", methods=["GET"])
def get_media():
    """Lists all files in inputs/ directory with live thumbnails."""
    data = list_media()
    return jsonify(data)

@media_bp.route("/thumbnail/<path:filename>")
def get_thumbnail(filename):
    """Generates on-the-fly fast thumbnail for both images and videos."""
    try:
        bio = generate_thumbnail_bytes(filename)
        if not bio:
            return "Thumbnail not available or file not found", 404
        return send_file(bio, mimetype="image/jpeg")
    except Exception as e:
        return str(e), 500

@media_bp.route("/upload", methods=["POST"])
def upload_files():
    """Uploads multimedia files into inputs/ folder safely."""
    if "files" not in request.files:
        return jsonify({"error": "No files provided"}), 400
        
    files = request.files.getlist("files")
    if not files or len(files) == 0:
        return jsonify({"error": "No files selected"}), 400

    uploaded = save_uploaded_media(files)
    return jsonify({"success": True, "uploaded": uploaded, "count": len(uploaded)})

@media_bp.route("/delete_media", methods=["POST"])
def delete_media():
    """Deletes a file from inputs/."""
    data = request.json or {}
    filename = data.get("filename")
    if not filename:
        return jsonify({"error": "Filename required"}), 400
        
    try:
        found, name = delete_media_by_name(filename)
        if found:
            return jsonify({"success": True, "deleted": name})
        return jsonify({"error": f"File '{name}' not found"}), 404
    except Exception as e:
        return jsonify({"error": f"Failed to delete file: {str(e)}"}), 500
