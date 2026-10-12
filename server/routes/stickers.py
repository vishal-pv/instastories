import os
from flask import Blueprint, request, jsonify, send_from_directory
from server.config import STICKERS_DIR
from server.services.sticker_service import (
    list_all_stickers,
    search_stickers,
    save_custom_sticker
)

stickers_bp = Blueprint("stickers", __name__, url_prefix="/api")

@stickers_bp.route("/stickers", methods=["GET"])
def get_stickers():
    """Lists available beach & scrapbook stickers for the Story Builder with categories."""
    stickers = list_all_stickers()
    return jsonify({"stickers": stickers})

@stickers_bp.route("/stickers/search", methods=["GET"])
def find_stickers():
    """Searches stickers by query across title, filename, and category."""
    q = request.args.get("q", "")
    cat = request.args.get("category", "")
    results = search_stickers(query=q, category=cat)
    return jsonify({"results": results, "count": len(results)})

@stickers_bp.route("/stickers/upload", methods=["POST"])
def upload_sticker():
    """Allows users to upload their own transparent PNG cutouts as stickers."""
    if "sticker" not in request.files:
        return jsonify({"error": "No sticker file provided"}), 400
    st_file = request.files["sticker"]
    if not st_file or not st_file.filename:
        return jsonify({"error": "Empty filename"}), 400
        
    st_meta, err = save_custom_sticker(st_file)
    if err:
        return jsonify({"error": err}), 400
        
    return jsonify({
        "success": True,
        "sticker": st_meta
    })

@stickers_bp.route("/sticker/<filename>")
def serve_sticker_asset(filename):
    """Serves sticker assets for canvas overlay."""
    safe_name = os.path.basename(filename)
    return send_from_directory(STICKERS_DIR, safe_name)
