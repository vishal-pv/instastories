// ==========================================================================
// Sidebar Inspector Controls (Card, Crop & Sticker Properties)
// ==========================================================================

export class Inspector {
  constructor(options = {}) {
    this.options = options; // { onUpdateCard, onUpdateSticker, onSwapMedia, onDeleteItem, onNudge }
    this.cardEmpty = document.getElementById("cardInspectorEmpty");
    this.cardContent = document.getElementById("cardInspectorContent");
    this.stickerInspector = document.getElementById("stickerInspector");

    // Card inspector elements
    this.valX = document.getElementById("valX");
    this.valY = document.getElementById("valY");
    this.valW = document.getElementById("valW");
    this.valH = document.getElementById("valH");
    this.zoomInput = document.getElementById("zoomInput");
    this.zoomVal = document.getElementById("zoomVal");
    this.panXInput = document.getElementById("panXInput");
    this.panXVal = document.getElementById("panXVal");
    this.panYInput = document.getElementById("panYInput");
    this.panYVal = document.getElementById("panYVal");
    this.radiusInput = document.getElementById("radiusInput");
    this.radiusVal = document.getElementById("radiusVal");
    this.shadowToggle = document.getElementById("shadowToggle");
    this.btnResetCrop = document.getElementById("btnResetCrop");
    this.btnTogglePanMode = document.getElementById("btnTogglePanMode");
    this.panModeHint = document.getElementById("panModeHint");
    this.deleteCardBtn = document.getElementById("deleteCardBtn");

    // Sticker inspector elements
    this.selectedStickerTitle = document.getElementById("selectedStickerTitle");
    this.stickerSizeInput = document.getElementById("stickerSizeInput");
    this.stickerSizeVal = document.getElementById("stickerSizeVal");
    this.stickerRotInput = document.getElementById("stickerRotInput");
    this.stickerRotVal = document.getElementById("stickerRotVal");
    this.deleteStickerBtn = document.getElementById("deleteStickerBtn");

    // Media swapper tray
    this.builderMediaTray = document.getElementById("builderMediaTray");

    this.bindEvents();
  }

  bindEvents() {
    // Zoom input
    if (this.zoomInput) {
      this.zoomInput.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (this.zoomVal) this.zoomVal.textContent = `${val.toFixed(2)}x`;
        if (this.options.onUpdateCard) this.options.onUpdateCard({ field: "zoom", value: val });
      });
    }

    // Pan X input
    if (this.panXInput) {
      this.panXInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        if (this.panXVal) this.panXVal.textContent = `${val}%`;
        if (this.options.onUpdateCard) this.options.onUpdateCard({ field: "pan_x", value: val });
      });
    }

    // Pan Y input
    if (this.panYInput) {
      this.panYInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        if (this.panYVal) this.panYVal.textContent = `${val}%`;
        if (this.options.onUpdateCard) this.options.onUpdateCard({ field: "pan_y", value: val });
      });
    }

    // Reset Crop
    if (this.btnResetCrop) {
      this.btnResetCrop.addEventListener("click", () => {
        if (this.options.onResetCrop) this.options.onResetCrop();
      });
    }

    // Toggle Pan Mode
    if (this.btnTogglePanMode) {
      this.btnTogglePanMode.addEventListener("click", () => {
        if (this.options.onTogglePanMode) this.options.onTogglePanMode();
      });
    }

    // Corner radius
    if (this.radiusInput) {
      this.radiusInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        if (this.radiusVal) this.radiusVal.textContent = `${val}px`;
        if (this.options.onUpdateCard) this.options.onUpdateCard({ field: "corner_radius", value: val });
      });
    }

    // Drop Shadow
    if (this.shadowToggle) {
      this.shadowToggle.addEventListener("change", (e) => {
        if (this.options.onUpdateCard) this.options.onUpdateCard({ field: "shadow", value: e.target.checked });
      });
    }

    // Card style buttons
    const styleBtns = document.querySelectorAll(".btn-card-style");
    styleBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        styleBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const style = btn.dataset.style || "rounded";
        if (this.options.onUpdateCard) this.options.onUpdateCard({ field: "card_style", value: style });
      });
    });

    // Nudge buttons for Card
    const nudgeBtns = document.querySelectorAll(".btn-nudge");
    nudgeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const dir = btn.dataset.dir;
        if (this.options.onNudge) this.options.onNudge(dir, "card");
      });
    });

    // Delete Card button
    if (this.deleteCardBtn) {
      this.deleteCardBtn.addEventListener("click", () => {
        if (this.options.onDeleteItem) this.options.onDeleteItem("card");
      });
    }

    // Sticker Size slider
    if (this.stickerSizeInput) {
      this.stickerSizeInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        if (this.stickerSizeVal) this.stickerSizeVal.textContent = `${val}px`;
        if (this.options.onUpdateSticker) this.options.onUpdateSticker({ field: "size", value: val });
      });
    }

    // Sticker Rotation slider
    if (this.stickerRotInput) {
      this.stickerRotInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        if (this.stickerRotVal) this.stickerRotVal.textContent = `${val}°`;
        if (this.options.onUpdateSticker) this.options.onUpdateSticker({ field: "rotation", value: val });
      });
    }

    // Nudge buttons for Sticker
    const nudgeStBtns = document.querySelectorAll(".btn-nudge-st");
    nudgeStBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const dir = btn.dataset.dir;
        if (this.options.onNudge) this.options.onNudge(dir, "sticker");
      });
    });

    // Delete Sticker button
    if (this.deleteStickerBtn) {
      this.deleteStickerBtn.addEventListener("click", () => {
        if (this.options.onDeleteItem) this.options.onDeleteItem("sticker");
      });
    }
  }

  updateSelection(selection, slideData, isPanActive = false) {
    if (!selection) {
      if (this.cardEmpty) this.cardEmpty.style.display = "block";
      if (this.cardContent) this.cardContent.style.display = "none";
      if (this.stickerInspector) this.stickerInspector.style.display = "none";
      return;
    }

    if (selection.type === "card") {
      if (this.cardEmpty) this.cardEmpty.style.display = "none";
      if (this.cardContent) this.cardContent.style.display = "block";
      if (this.stickerInspector) this.stickerInspector.style.display = "none";

      const slot = slideData.slots[selection.index];
      if (!slot) return;

      const box = slot.box || [0, 0, 960, 1200];
      if (this.valX) this.valX.textContent = Math.round(box[0]);
      if (this.valY) this.valY.textContent = Math.round(box[1]);
      if (this.valW) this.valW.textContent = Math.round(box[2]);
      if (this.valH) this.valH.textContent = Math.round(box[3]);

      const zoom = slot.zoom !== undefined ? slot.zoom : 1.0;
      if (this.zoomInput) this.zoomInput.value = zoom;
      if (this.zoomVal) this.zoomVal.textContent = `${zoom.toFixed(2)}x`;

      const panX = slot.pan_x !== undefined ? slot.pan_x : 0;
      if (this.panXInput) this.panXInput.value = panX;
      if (this.panXVal) this.panXVal.textContent = `${panX}%`;

      const panY = slot.pan_y !== undefined ? slot.pan_y : 0;
      if (this.panYInput) this.panYInput.value = panY;
      if (this.panYVal) this.panYVal.textContent = `${panY}%`;

      const radius = slot.corner_radius !== undefined ? slot.corner_radius : 14;
      if (this.radiusInput) this.radiusInput.value = radius;
      if (this.radiusVal) this.radiusVal.textContent = `${radius}px`;

      if (this.shadowToggle) this.shadowToggle.checked = (slot.shadow !== false);

      // Pan mode active styling
      if (this.btnTogglePanMode) {
        if (isPanActive) {
          this.btnTogglePanMode.classList.add("active");
          this.btnTogglePanMode.innerHTML = "<span>🖐️ Exit Pan Mode</span>";
          if (this.panModeHint) this.panModeHint.style.display = "block";
        } else {
          this.btnTogglePanMode.classList.remove("active");
          this.btnTogglePanMode.innerHTML = "<span>🖐️ Direct Mouse Pan inside Card</span>";
          if (this.panModeHint) this.panModeHint.style.display = "none";
        }
      }

      // Card style selector
      const currentStyle = slot.card_style || "rounded";
      document.querySelectorAll(".btn-card-style").forEach(btn => {
        if (btn.dataset.style === currentStyle) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      });
    } else if (selection.type === "sticker") {
      if (this.cardEmpty) this.cardEmpty.style.display = "block";
      if (this.cardContent) this.cardContent.style.display = "none";
      if (this.stickerInspector) this.stickerInspector.style.display = "block";

      const st = (slideData.stickers || [])[selection.index];
      if (!st) return;

      if (this.selectedStickerTitle) {
        this.selectedStickerTitle.textContent = (st.sticker_name || st.emoji || st.text || "Sticker") + " Inspector";
      }

      const size = st.w || 180;
      if (this.stickerSizeInput) this.stickerSizeInput.value = size;
      if (this.stickerSizeVal) this.stickerSizeVal.textContent = `${size}px`;

      const rot = st.rotation || 0;
      if (this.stickerRotInput) this.stickerRotInput.value = rot;
      if (this.stickerRotVal) this.stickerRotVal.textContent = `${rot}°`;
    }
  }

  loadMediaSwapper(mediaFiles, currentSlot) {
    if (!this.builderMediaTray) return;
    this.builderMediaTray.innerHTML = "";

    (mediaFiles || []).forEach(file => {
      const thumb = document.createElement("div");
      thumb.className = "builder-media-thumb";
      if (currentSlot && currentSlot.media_name === file.name) {
        thumb.classList.add("active");
      }
      thumb.title = `Swap to ${file.name}`;
      thumb.innerHTML = `<img src="${file.thumb_url}" alt="${file.name}">`;
      thumb.addEventListener("click", () => {
        if (this.options.onSwapMedia) this.options.onSwapMedia(file.name);
      });
      this.builderMediaTray.appendChild(thumb);
    });
  }
}
