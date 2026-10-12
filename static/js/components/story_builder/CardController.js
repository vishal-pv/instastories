// ==========================================================================
// Card Element & Photo Pan/Zoom Controller
// ==========================================================================

import { toDisplayX, toDisplayY, toDisplayW, toDisplayH, to1080X, to1080Y, to1080W, to1080H, checkMagneticSnap, clamp } from "../../utils/math.js";

export class CardController {
  constructor(stageEl, options = {}) {
    this.stageEl = stageEl;
    this.options = options; // { onSelect, onUpdate, onMagneticGuide }
    this.panModeSlotIdx = null;
  }

  renderCard(slot, slotIdx, isSelected, activePanIdx) {
    const box = slot.box || [60, 60, 960, 1230];
    const dx = toDisplayX(box[0]);
    const dy = toDisplayY(box[1]);
    const dw = toDisplayW(box[2]);
    const dh = toDisplayH(box[3]);

    const card = document.createElement("div");
    card.className = `builder-card ${isSelected ? "selected" : ""}`;
    card.dataset.slotIndex = slotIdx;
    card.style.left = `${dx}px`;
    card.style.top = `${dy}px`;
    card.style.width = `${dw}px`;
    card.style.height = `${dh}px`;

    // Visual styles: corner radius, shadow, torn paper
    const radius = slot.corner_radius !== undefined ? slot.corner_radius : 14;
    card.style.borderRadius = `${radius}px`;

    const cardStyle = slot.card_style || "rounded";
    if (cardStyle === "torn_paper") {
      card.classList.add("style-torn");
    }

    if (slot.shadow === false) {
      card.style.boxShadow = "none";
    }

    // Media element wrap
    const mediaWrap = document.createElement("div");
    mediaWrap.className = "builder-card-media-wrap";

    const mediaName = slot.media_name || "";
    const isVideo = mediaName.endsWith(".mp4") || mediaName.endsWith(".mov");

    let mediaEl;
    if (isVideo) {
      mediaEl = document.createElement("video");
      mediaEl.src = `/api/output/${slot.job_id || ""}/${slot.media_name || ""}`;
      mediaEl.muted = true;
      mediaEl.loop = true;
      mediaEl.autoplay = true;
    } else {
      mediaEl = document.createElement("img");
      mediaEl.src = slot.thumb_url || (mediaName ? `/api/thumbnail/${encodeURIComponent(mediaName)}` : "");
      mediaEl.alt = mediaName;
    }

    // Apply In-Card Zoom & Pan Transform
    const zoom = slot.zoom !== undefined ? slot.zoom : 1.0;
    const panX = slot.pan_x !== undefined ? slot.pan_x : 0;
    const panY = slot.pan_y !== undefined ? slot.pan_y : 0;
    mediaEl.style.transform = `scale(${zoom}) translate(${panX}%, ${panY}%)`;

    mediaWrap.appendChild(mediaEl);
    card.appendChild(mediaWrap);

    // Pan Mode Indicator
    const isPanActive = (activePanIdx === slotIdx);
    if (isPanActive) {
      card.classList.add("pan-active");
    }

    // Floating Mode Bar on selected card
    if (isSelected) {
      const modeBar = document.createElement("div");
      modeBar.className = "card-floating-toolbar";

      const moveBtn = document.createElement("button");
      moveBtn.type = "button";
      moveBtn.className = `cft-btn ${!isPanActive ? "active" : ""}`;
      moveBtn.innerHTML = "<span>⤧</span><span>Move</span>";
      moveBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      moveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.options.onTogglePan) this.options.onTogglePan(false);
      });

      const panBtn = document.createElement("button");
      panBtn.type = "button";
      panBtn.className = `cft-btn ${isPanActive ? "active" : ""}`;
      panBtn.innerHTML = "<span>🖐️</span><span>Pan Photo</span>";
      panBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      panBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.options.onTogglePan) this.options.onTogglePan(!isPanActive);
      });

      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "cft-btn";
      resetBtn.innerHTML = "<span>🎯</span><span>Reset</span>";
      resetBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      resetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.options.onResetCrop) this.options.onResetCrop(slotIdx);
      });

      modeBar.appendChild(moveBtn);
      modeBar.appendChild(panBtn);
      modeBar.appendChild(resetBtn);
      card.appendChild(modeBar);
    }

    // Pointer events for drag vs pan
    this.attachCardInteractions(card, mediaEl, slot, slotIdx, isPanActive);

    return card;
  }

  attachCardInteractions(cardEl, mediaEl, slot, slotIdx, isPanActive) {
    // Double click toggles pan mode
    cardEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (this.options.onTogglePan) this.options.onTogglePan(!isPanActive);
    });

    // Pointer down handler
    cardEl.addEventListener("pointerdown", (e) => {
      // Don't trigger if clicked on toolbar or handle
      if (e.target.closest(".canva-floating-pill") || e.target.closest(".card-floating-toolbar") || e.target.closest(".gizmo-handle") || e.target.closest(".gizmo-rot-handle")) {
        return;
      }
      e.preventDefault(); // CRITICAL: Completely prevents browser HTML5 ghost drag and selection
      e.stopPropagation();

      if (this.options.onSelect) {
        this.options.onSelect({ type: "card", index: slotIdx });
      }

      if (isPanActive) {
        this.startPhotoPan(e, mediaEl, slot, slotIdx);
      } else {
        this.startCardDrag(e, cardEl, slot, slotIdx);
      }
    });

    // Mouse wheel zoom inside card
    cardEl.addEventListener("wheel", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const currentZoom = slot.zoom !== undefined ? slot.zoom : 1.0;
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      const newZoom = clamp(Math.round((currentZoom + delta) * 100) / 100, 1.0, 2.5);

      slot.zoom = newZoom;
      mediaEl.style.transform = `scale(${newZoom}) translate(${slot.pan_x || 0}%, ${slot.pan_y || 0}%)`;

      if (this.options.onUpdate) {
        this.options.onUpdate({ slotIdx, slot, field: "zoom" });
      }
    }, { passive: false });
  }

  startCardDrag(e, cardEl, slot, slotIdx) {
    try { cardEl.setPointerCapture(e.pointerId); } catch (_) {}
    this.stageEl.classList.add("is-dragging");

    const startX = e.clientX;
    const startY = e.clientY;
    const origDx = parseFloat(cardEl.style.left) || 0;
    const origDy = parseFloat(cardEl.style.top) || 0;
    const dw = cardEl.offsetWidth;
    const dh = cardEl.offsetHeight;

    let targetDx = origDx;
    let targetDy = origDy;
    let rafId = null;
    let snapActiveX = false;
    let snapActiveY = false;

    const onPointerMove = (moveEv) => {
      moveEv.preventDefault();
      const deltaX = moveEv.clientX - startX;
      const deltaY = moveEv.clientY - startY;

      // Magnetic center snapping
      const snap = checkMagneticSnap(origDx + deltaX, origDy + deltaY, dw, dh, 6);
      targetDx = snap.dx;
      targetDy = snap.dy;
      snapActiveX = snap.snapGuideX;
      snapActiveY = snap.snapGuideY;

      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          // Hardware-accelerated GPU translation (ZERO layout reflow during drag)
          const moveX = targetDx - origDx;
          const moveY = targetDy - origDy;
          cardEl.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`;

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

    const onPointerUp = (upEv) => {
      try { cardEl.releasePointerCapture(e.pointerId); } catch (_) {}
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      this.stageEl.classList.remove("is-dragging");

      // Commit final position to style.left & style.top
      cardEl.style.transform = "";
      cardEl.style.left = `${targetDx}px`;
      cardEl.style.top = `${targetDy}px`;

      slot.box[0] = to1080X(targetDx);
      slot.box[1] = to1080Y(targetDy);

      if (this.options.onMagneticGuide) {
        this.options.onMagneticGuide(false, false);
      }
      if (this.options.onDragEnd) {
        this.options.onDragEnd(slotIdx, slot);
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  startPhotoPan(e, mediaEl, slot, slotIdx) {
    try { mediaEl.setPointerCapture(e.pointerId); } catch (_) {}
    this.stageEl.classList.add("is-dragging");

    const startX = e.clientX;
    const startY = e.clientY;
    const origPanX = slot.pan_x !== undefined ? slot.pan_x : 0;
    const origPanY = slot.pan_y !== undefined ? slot.pan_y : 0;
    const zoom = slot.zoom !== undefined ? slot.zoom : 1.0;

    let newPanX = origPanX;
    let newPanY = origPanY;
    let rafId = null;

    const onPointerMove = (moveEv) => {
      moveEv.preventDefault();
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;

      // Convert pixel delta to percentage offset
      newPanX = clamp(Math.round(origPanX + (dx / 3.0)), -50, 50);
      newPanY = clamp(Math.round(origPanY + (dy / 3.0)), -50, 50);

      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          mediaEl.style.transform = `scale(${zoom}) translate(${newPanX}%, ${newPanY}%)`;
          if (this.options.onLivePan) {
            this.options.onLivePan(slotIdx, newPanX, newPanY);
          }
          rafId = null;
        });
      }
    };

    const onPointerUp = () => {
      try { mediaEl.releasePointerCapture(e.pointerId); } catch (_) {}
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      this.stageEl.classList.remove("is-dragging");

      slot.pan_x = newPanX;
      slot.pan_y = newPanY;

      if (this.options.onPanEnd) {
        this.options.onPanEnd(slotIdx, slot);
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }
}
