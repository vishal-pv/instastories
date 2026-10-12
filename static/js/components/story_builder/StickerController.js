// ==========================================================================
// Sticker & Decor Element Controller
// ==========================================================================

import { toDisplayX, toDisplayY, toDisplayW, toDisplayH, to1080X, to1080Y, to1080W, to1080H, checkMagneticSnap } from "../../utils/math.js";
import { searchStickers, uploadSticker } from "../../api/client.js";

export class StickerController {
  constructor(stageEl, options = {}) {
    this.stageEl = stageEl;
    this.options = options; // { onSelect, onUpdate, onMagneticGuide, onAddSticker }
    this.trayEl = document.getElementById("builderStickersTray");
    this.searchInput = document.getElementById("stickerSearchInput");
    this.catBtns = document.querySelectorAll(".st-cat-btn");
    this.uploadInput = document.getElementById("stickerFileInput");
    this.uploadBtn = document.getElementById("btnUploadSticker");
    this.activeCategory = "all";

    this.bindTrayControls();
  }

  bindTrayControls() {
    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => {
        this.loadStickerTray(e.target.value.trim(), this.activeCategory);
      });
    }

    if (this.catBtns) {
      this.catBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          this.catBtns.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          this.activeCategory = btn.dataset.cat || "all";
          const query = this.searchInput ? this.searchInput.value.trim() : "";
          this.loadStickerTray(query, this.activeCategory);
        });
      });
    }

    if (this.uploadBtn && this.uploadInput) {
      this.uploadBtn.addEventListener("click", () => this.uploadInput.click());
      this.uploadInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const res = await uploadSticker(file);
          if (res.success && res.sticker) {
            this.loadStickerTray("", "all");
            if (this.options.onAddSticker) {
              this.options.onAddSticker({
                type: "image_sticker",
                sticker_name: res.sticker.name,
                w: 220,
                h: 220,
                x: 430,
                y: 565,
                rotation: 0
              });
            }
          }
        } catch (err) {
          alert("Sticker upload failed: " + err.message);
        }
      });
    }

    // Quick emoji bar
    const emojis = document.querySelectorAll(".quick-emoji");
    emojis.forEach(em => {
      em.addEventListener("click", () => {
        const char = em.dataset.emoji || "✨";
        if (this.options.onAddSticker) {
          this.options.onAddSticker({
            type: "emoji",
            emoji: char,
            x: 480,
            y: 600,
            rotation: 0,
            font_size: 64
          });
        }
      });
    });
  }

  async loadStickerTray(query = "", category = "all") {
    if (!this.trayEl) return;
    try {
      const data = await searchStickers(query, category);
      this.trayEl.innerHTML = "";
      (data.results || []).forEach(st => {
        const thumb = document.createElement("div");
        thumb.className = "builder-sticker-thumb";
        thumb.title = st.title;
        thumb.innerHTML = `<img src="${st.url}" alt="${st.title}">`;
        thumb.addEventListener("click", () => {
          if (this.options.onAddSticker) {
            this.options.onAddSticker({
              type: "image_sticker",
              sticker_name: st.name,
              w: 220,
              h: 220,
              x: 430,
              y: 565,
              rotation: 0
            });
          }
        });
        this.trayEl.appendChild(thumb);
      });
    } catch (err) {
      console.error("Failed to load sticker tray:", err);
    }
  }

  renderSticker(st, stIdx, isSelected) {
    const sType = st.type || "image_sticker";
    let el;

    if (sType === "image_sticker") {
      el = document.createElement("div");
      el.className = `builder-sticker ${isSelected ? "selected" : ""}`;
      const img = document.createElement("img");
      img.src = `/api/sticker/${st.sticker_name}`;
      img.alt = st.sticker_name;
      el.appendChild(img);
    } else if (sType === "emoji") {
      el = document.createElement("div");
      el.className = `builder-sticker ${isSelected ? "selected" : ""}`;
      el.innerHTML = `<span class="emoji-content">${st.emoji || "🐚"}</span>`;
    } else if (sType === "location_pill") {
      el = document.createElement("div");
      el.className = `builder-pill ${isSelected ? "selected" : ""}`;
      el.textContent = st.text || "📍 Location";
    } else if (sType === "caption") {
      el = document.createElement("div");
      el.className = `builder-caption ${isSelected ? "selected" : ""}`;
      el.textContent = st.text || "Caption Text";
      if (st.color) {
        el.style.color = `rgb(${st.color.join(",")})`;
      }
    }

    el.dataset.stickerIndex = stIdx;
    const dx = toDisplayX(st.x || 100);
    const dy = toDisplayY(st.y || 100);
    const dw = toDisplayW(st.w || 180);
    const dh = toDisplayH(st.h || 180);

    el.style.left = `${dx}px`;
    el.style.top = `${dy}px`;
    if (sType === "image_sticker" || sType === "emoji") {
      el.style.width = `${dw}px`;
      el.style.height = `${dh}px`;
    }

    const rot = st.rotation || 0;
    el.style.transform = `rotate(${rot}deg)`;

    // Attach dragging & selection
    this.attachStickerInteractions(el, st, stIdx);

    return el;
  }

  attachStickerInteractions(el, st, stIdx) {
    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".canva-floating-pill") || e.target.closest(".gizmo-handle") || e.target.closest(".gizmo-rot-handle")) {
        return;
      }
      e.stopPropagation();

      if (this.options.onSelect) {
        this.options.onSelect({ type: "sticker", index: stIdx });
      }

      this.startStickerDrag(e, el, st, stIdx);
    });
  }

  startStickerDrag(e, el, st, stIdx) {
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    this.stageEl.classList.add("is-dragging");

    const startX = e.clientX;
    const startY = e.clientY;
    const origDx = parseFloat(el.style.left) || 0;
    const origDy = parseFloat(el.style.top) || 0;
    const dw = el.offsetWidth;
    const dh = el.offsetHeight;
    const rot = st.rotation || 0;

    let targetDx = origDx;
    let targetDy = origDy;
    let rafId = null;
    let snapActiveX = false;
    let snapActiveY = false;

    const onPointerMove = (moveEv) => {
      const deltaX = moveEv.clientX - startX;
      const deltaY = moveEv.clientY - startY;

      // Magnetic snapping
      const snap = checkMagneticSnap(origDx + deltaX, origDy + deltaY, dw, dh, 6);
      targetDx = snap.dx;
      targetDy = snap.dy;
      snapActiveX = snap.snapGuideX;
      snapActiveY = snap.snapGuideY;

      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          const moveX = targetDx - origDx;
          const moveY = targetDy - origDy;
          el.style.transform = `translate3d(${moveX}px, ${moveY}px, 0) rotate(${rot}deg)`;

          if (this.options.onMagneticGuide) {
            this.options.onMagneticGuide(snapActiveX, snapActiveY);
          }
          if (this.options.onLiveCoords) {
            this.options.onLiveCoords(to1080X(targetDx), to1080Y(targetDy));
          }
          rafId = null;
        });
      }
    };

    const onPointerUp = () => {
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      this.stageEl.classList.remove("is-dragging");

      el.style.transform = `rotate(${rot}deg)`;
      el.style.left = `${targetDx}px`;
      el.style.top = `${targetDy}px`;

      st.x = to1080X(targetDx);
      st.y = to1080Y(targetDy);

      if (this.options.onMagneticGuide) {
        this.options.onMagneticGuide(false, false);
      }
      if (this.options.onDragEnd) {
        this.options.onDragEnd(stIdx, st);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }
}
