from flask import Flask, send_from_directory
from flask_cors import CORS
from server.config import STATIC_DIR, MAX_CONTENT_LENGTH
from server.routes.media import media_bp
from server.routes.stickers import stickers_bp
from server.routes.clone import clone_bp
from server.services.job_service import load_existing_jobs

def create_app():
    """Application factory for InstaClone Studio server."""
    app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")
    CORS(app)
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

    # Restore previously generated jobs from disk
    load_existing_jobs()

    # Register modular route blueprints
    app.register_blueprint(media_bp)
    app.register_blueprint(stickers_bp)
    app.register_blueprint(clone_bp)

    @app.route("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    return app
