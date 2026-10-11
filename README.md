# 📸 InstaClone Studio • Autonomous Carousel & Story Cloning Engine

An advanced, offline-first Python web application that analyzes Instagram posts, extracts complex card layouts, and re-creates pixel-perfect 1080×1350 carousels, stories, and video reels with smart face cropping, deckled torn-paper card styling, in-frame photo panning, and a rich 94+ legal sticker library.

---

## ✨ Features

- **🎯 Smart Layout Analysis & Cloning**: Extracts slide structure, card frames, aspect ratios, and visual styling from any Instagram URL without requiring heavy APIs.
- **🖼️ In-Card Crop, Zoom & Pan**:
  - Direct mouse-drag photo sliding inside cards (horizontal and vertical).
  - Mouse-wheel zoom directly on canvas cards (1.0x to 2.5x).
  - Floating on-card mode toolbar (`[ ⤧ Move Card ]`, `[ 🖐️ Pan Photo ]`, `[ 🎯 Reset ]`).
- **📜 Torn Paper Scrapbook Borders**: Toggle between clean rounded aesthetic borders and realistic torn/ripped deckled-edge paper cards.
- **🌟 94+ CC0 & Legal Stickers Library**:
  - **30 CC0 Hand-Drawn Doodles** by Pablo Stanley (100% Commercial-Safe, Public Domain).
  - **17 Beach & Ocean Elements** (Cyan Starfish, Conch Shells, Ocean Wave, Coral).
  - **17 Tropical & Summer Cutouts** (Palm Tree, Coconut, Tropical Hibiscus, Cocktails).
  - **Travel & Vintage Cutouts** (Digicam, Classic Camera, Passport, Compass).
  - **Custom Sticker Upload**: Upload your own transparent PNG cutouts directly into the studio.
- **⚡ Ultra-Fast Zero-Memory Reel Video Rendering**:
  - High-res MP4 video compilation using imageio-ffmpeg demuxer.
  - Zero memory overhead, rock-solid stability on Windows and Linux.
- **🎨 Interactive Story Builder**: Real-time canvas editing modal for custom card nudging, resizing, sticker placement, and 1-click re-rendering.

---

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.10+ installed
- Git

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/vishal-pv/instastories.git
cd instastories

# Create and activate virtual environment (optional but recommended)
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Run Application
```bash
python app.py
```
Or double-click `run_app.bat` on Windows.

Open your browser at:
```
http://localhost:5000
```

---

## 📁 Project Structure

```
instastories/
├── app.py                 # Flask server & REST API
├── run_app.bat            # Quick launcher for Windows
├── requirements.txt       # Python dependencies
├── core/
│   ├── engine.py          # Carousel rendering engine & video compiler
│   └── face_cropper.py    # OpenCV Haar face detection & in-card pan/zoom
├── static/
│   ├── index.html         # Studio interface & Story Builder modal
│   ├── style.css          # Modern dark-mode UI & interactive styles
│   └── app.js             # Canvas pointer interactions, pan & sticker controller
├── assets/
│   └── stickers/          # 94+ transparent CC0 and open-licensed stickers
└── inputs/                # Multimedia input staging directory
```

---

## 🛡️ License & Legal Safety

- Application Code: **MIT License**
- Built-in Doodles: **CC0 1.0 Universal (Public Domain)** by Pablo Stanley ([Open Doodles](https://opendoodles.com)). Free for personal and commercial use with no attribution required.
- Emoji & Marine Icons: **CC BY-SA 4.0** by [OpenMoji](https://openmoji.org).

---

## 👨‍💻 Author
**Vishal Patil** ([@vishal-pv](https://github.com/vishal-pv))
