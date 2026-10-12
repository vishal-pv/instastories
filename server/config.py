import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUTS_DIR = os.path.join(BASE_DIR, "inputs")
OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")
STICKERS_DIR = os.path.join(BASE_DIR, "assets", "stickers")
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Ensure required runtime directories exist
os.makedirs(INPUTS_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.makedirs(STICKERS_DIR, exist_ok=True)

MAX_CONTENT_LENGTH = 500 * 1024 * 1024  # Support up to 500MB media uploads
