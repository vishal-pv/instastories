// ==========================================================================
// Master Story Builder Stage Coordinator
// ==========================================================================

import { to1080X, to1080Y, to1080W, to1080H, toDisplayW, toDisplayH } from "../../utils/math.js";
import { TransformGizmo } from "./TransformGizmo.js";
import { FloatingToolbar } from "./FloatingToolbar.js";
import { MagneticGuides } from "./MagneticGuides.js";
import { HistoryManager } from "./HistoryManager.js";
import { CardController } from "./CardController.js";
import { StickerController } from "./StickerController.js";
import { Inspector } from "./Inspector.js";
import { saveCustomSlide } from "../../api/client.js";

export class Stage {
  constructor(stageEl, modalEl, options = {}) {
    this.stageEl = stageEl;
    this.modalEl = modalEl;
    this.options = options; // { showToast, onSlideSaved }

    this.slideData = null;
    this.jobId = null;
    this.slideIndex = 1;
    this.selectedItem = null; // { type: 'card'|'sticker', index: number }
    this.panModeSlotIdx = null;

    // Sub-controllers
    this.magneticGuides = new MagneticGuides(this.stageEl);
    this.history = new HistoryManager((info) => this.updateHistoryButtons(info));
    this.gizmo = new TransformGizmo(
      this.stageEl,
      (transform) => this.handleGizmoTransform(transform),
      () => {
        this.inspector.updateSelection(this.selectedItem, this.slideData, false);
        this.commitHistory();
      }
    );

    this.floatingToolbar = new FloatingToolbar({
      onDuplicate: () => this.duplicateSelected(),
      onCenter: () => this.centerSelected(),
      onLayerUp: () => this.bringForward(),
      onLayerDown: () => this.sendBackward(),
      onDelete: () => this.deleteSelected()
    });

    this.cardCtrl = new CardController(this.stageEl, {
      onSelect: (sel) => this.selectItem(sel),
      onMagneticGuide: (sx, sy) => this.magneticGuides.update(sx, sy),
      onLiveCoords: (x, y) => this.inspector.updateLiveCoords(x, y),
      onDragEnd: () => {
        this.inspector.updateSelection(this.selectedItem, this.slideData, this.panModeSlotIdx !== null);
        this.commitHistory();
      },
      onLivePan: (idx, px, py) => {
        if (this.inspector.panXVal) this.inspector.panXVal.textContent = `${px}%`;
        if (this.inspector.panYVal) this.inspector.panYVal.textContent = `${py}%`;
      },
      onPanEnd: () => {
        this.inspector.updateSelection(this.selectedItem, this.slideData, this.panModeSlotIdx !== null);
        this.commitHistory();
      },
      onTogglePan: (active) => this.togglePanMode(active),
      onResetCrop: (idx) => this.resetCrop(idx)
    });

    this.stickerCtrl = new StickerController(this.stageEl, {
      onSelect: (sel) => this.selectItem(sel),
      onMagneticGuide: (sx, sy) => this.magneticGuides.update(sx, sy),
      onLiveCoords: (x, y) => this.inspector.updateLiveCoords(x, y),
      onDragEnd: () => {
        this.inspector.updateSelection(this.selectedItem, this.slideData, false);
        this.commitHistory();
      },
      onAddSticker: (stData) => this.addSticker(stData)
    });

    this.inspector = new Inspector({
      onUpdateCard: (update) => this.updateActiveCard(update),
      onUpdateSticker: (update) => this.updateActiveSticker(update),
      onSwapMedia: (mediaName) => this.swapMedia(mediaName),
      onDeleteItem: (type) => this.deleteSelected(),
      onResetCrop: () => this.resetCrop(this.selectedItem?.index),
      onTogglePanMode: () => this.togglePanMode(this.panModeSlotIdx === null),
      onNudge: (dir, type) => this.nudgeSelected(dir)
    });

    this.bindHeaderButtons();
    this.bindKeyboardShortcuts();
    this.bindStageBackgroundClick();
  }

  bindHeaderButtons() {
    // Undo / Redo
    this.undoBtn = document.getElementById("builderUndoBtn");
    this.redoBtn = document.getElementById("builderRedoBtn");
    if (this.undoBtn) {
      this.undoBtn.addEventListener("click", () => this.undo());
    }
    if (this.redoBtn) {
      this.redoBtn.addEventListener("click", () => this.redo());
    }

    // Add Card
    const addCardBtn = document.getElementById("builderAddCardBtn");
    if (addCardBtn) {
      addCardBtn.addEventListener("click", () => this.addCard());
    }

    // Add Location
    const addPillBtn = document.getElementById("builderAddPillBtn");
    if (addPillBtn) {
      addPillBtn.addEventListener("click", () => {
        const text = prompt("Enter location text:", "📍 Goa, India");
        if (text) {
          this.addSticker({ type: "location_pill", text, x: 380, y: 1150, rotation: 0 });
        }
      });
    }

    // Add Caption
    const addCaptionBtn = document.getElementById("builderAddCaptionBtn");
    if (addCaptionBtn) {
      addCaptionBtn.addEventListener("click", () => {
        const text = prompt("Enter caption text:", "golden hour feelings ✨");
        if (text) {
          this.addSticker({ type: "caption", text, x: 340, y: 1220, rotation: 0, color: [255, 255, 255] });
        }
      });
    }

    // Reset Slide
    const resetBtn = document.getElementById("builderResetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("Reset this slide to default arrangement?")) {
          if (this.initialSnapshot) {
            this.slideData = JSON.parse(JSON.stringify(this.initialSnapshot));
            this.history.reset(this.slideData);
            this.render();
          }
        }
      });
    }

    // Save & Re-render
    const saveBtn = document.getElementById("builderSaveBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => this.saveSlide());
    }

    // Close Modal
    const closeBtn = document.getElementById("builderCloseBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.close());
    }
  }

  bindKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      if (!this.modalEl || !this.modalEl.classList.contains("active")) return;

      // Don't intercept when user is typing in an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        this.undo();
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        this.redo();
        return;
      }

      // Delete / Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        if (this.selectedItem) {
          e.preventDefault();
          this.deleteSelected();
        }
        return;
      }

      // Escape: deselect
      if (e.key === "Escape") {
        this.deselect();
        return;
      }

      // Arrow keys nudge: 2px (or 10px with Shift)
      const step = e.shiftKey ? 10 : 2;
      if (e.key === "ArrowUp") { e.preventDefault(); this.nudgeSelected("up", step); }
      if (e.key === "ArrowDown") { e.preventDefault(); this.nudgeSelected("down", step); }
      if (e.key === "ArrowLeft") { e.preventDefault(); this.nudgeSelected("left", step); }
      if (e.key === "ArrowRight") { e.preventDefault(); this.nudgeSelected("right", step); }
    });
  }

  bindStageBackgroundClick() {
    this.stageEl.addEventListener("pointerdown", (e) => {
      // If clicked strictly on stage background
      if (e.target === this.stageEl) {
        this.deselect();
      }
    });
  }

  open(jobId, slideIndex, slideMeta, mediaFiles = []) {
    this.jobId = jobId;
    this.slideIndex = slideIndex;
    this.mediaFiles = mediaFiles;

    // Deep clone slide data
    this.slideData = {
      slots: JSON.parse(JSON.stringify(slideMeta.slots || [])),
      stickers: JSON.parse(JSON.stringify(slideMeta.stickers || [])),
      bg_color: slideMeta.bg_color || [50, 52, 55],
      is_full_bleed: !!slideMeta.is_full_bleed
    };

    // Ensure slots have media references
    this.slideData.slots.forEach(s => {
      s.job_id = jobId;
    });

    this.initialSnapshot = JSON.parse(JSON.stringify(this.slideData));
    this.history.reset(this.slideData);
    this.selectedItem = this.slideData.slots.length > 0 ? { type: "card", index: 0 } : null;
    this.panModeSlotIdx = null;

    // Update subtitle
    const subTitle = document.getElementById("builderSlideSubtitle");
    if (subTitle) subTitle.textContent = `Interactive Canva-grade customization for Slide ${slideIndex}`;

    // Show modal
    this.modalEl.classList.add("active");
    this.render();

    // Load stickers
    this.stickerCtrl.loadStickerTray("", "all");
  }

  close() {
    this.modalEl.classList.remove("active");
    this.deselect();
  }

  render() {
    // Retain guidelines
    this.magneticGuides.hideAll();
    this.floatingToolbar.destroy();
    this.gizmo.detach();

    // Clear stage content except guidelines
    Array.from(this.stageEl.children).forEach(child => {
      if (!child.classList.contains("snap-guide")) {
        child.remove();
      }
    });

    // 1. Render Cards
    this.slideData.slots.forEach((slot, idx) => {
      const isSel = (this.selectedItem && this.selectedItem.type === "card" && this.selectedItem.index === idx);
      const cardEl = this.cardCtrl.renderCard(slot, idx, isSel, this.panModeSlotIdx);
      this.stageEl.appendChild(cardEl);

      if (isSel) {
        this.gizmo.attach(cardEl, { isCard: true });
        this.floatingToolbar.render(cardEl, true);
      }
    });

    // 2. Render Stickers
    (this.slideData.stickers || []).forEach((st, idx) => {
      const isSel = (this.selectedItem && this.selectedItem.type === "sticker" && this.selectedItem.index === idx);
      const stEl = this.stickerCtrl.renderSticker(st, idx, isSel);
      this.stageEl.appendChild(stEl);

      if (isSel) {
        this.gizmo.attach(stEl, { isCard: false });
        this.floatingToolbar.render(stEl, false);
      }
    });

    // 3. Sync Inspector
    const currentSlot = (this.selectedItem?.type === "card") ? this.slideData.slots[this.selectedItem.index] : null;
    this.inspector.updateSelection(this.selectedItem, this.slideData, this.panModeSlotIdx !== null);
    this.inspector.loadMediaSwapper(this.mediaFiles, currentSlot);
  }

  selectItem(selection) {
    if (!selection) {
      this.deselect();
      return;
    }

    const isSame = this.selectedItem &&
      this.selectedItem.type === selection.type &&
      this.selectedItem.index === selection.index;

    this.selectedItem = selection;
    this.panModeSlotIdx = null;

    if (isSame) {
      this.inspector.updateSelection(this.selectedItem, this.slideData, false);
      return;
    }

    this.updateSelectionUI(selection);
  }

  updateSelectionUI(selection) {
    this.stageEl.querySelectorAll(".builder-card.selected, .builder-sticker.selected, .builder-pill.selected, .builder-caption.selected").forEach(el => {
      el.classList.remove("selected");
    });

    this.magneticGuides.hideAll();

    let targetEl = null;
    let isCard = false;

    if (selection.type === "card") {
      targetEl = this.stageEl.querySelector(`.builder-card[data-slot-index="${selection.index}"]`);
      isCard = true;
    } else if (selection.type === "sticker") {
      targetEl = this.stageEl.querySelector(`.builder-sticker[data-sticker-index="${selection.index}"], .builder-pill[data-sticker-index="${selection.index}"], .builder-caption[data-sticker-index="${selection.index}"]`);
      isCard = false;
    }

    if (targetEl) {
      targetEl.classList.add("selected");
      this.gizmo.attach(targetEl, { isCard });
      this.floatingToolbar.render(targetEl, isCard);
    } else {
      this.gizmo.detach();
      this.floatingToolbar.destroy();
    }

    const currentSlot = (selection.type === "card") ? this.slideData.slots[selection.index] : null;
    this.inspector.updateSelection(selection, this.slideData, false);
    this.inspector.loadMediaSwapper(this.mediaFiles, currentSlot);
  }

  deselect() {
    this.selectedItem = null;
    this.panModeSlotIdx = null;
    this.gizmo.detach();
    this.floatingToolbar.destroy();
    this.magneticGuides.hideAll();
    this.stageEl.querySelectorAll(".builder-card.selected, .builder-sticker.selected, .builder-pill.selected, .builder-caption.selected").forEach(el => {
      el.classList.remove("selected");
    });
    this.inspector.updateSelection(null, this.slideData, false);
  }

  commitHistory() {
    this.history.push(this.slideData);
  }

  undo() {
    const prev = this.history.undo();
    if (prev) {
      this.slideData = prev;
      this.render();
    }
  }

  redo() {
    const next = this.history.redo();
    if (next) {
      this.slideData = next;
      this.render();
    }
  }

  updateHistoryButtons(info) {
    if (this.undoBtn) this.undoBtn.disabled = !info.canUndo;
    if (this.redoBtn) this.redoBtn.disabled = !info.canRedo;
  }

  handleGizmoTransform(transform) {
    if (!this.selectedItem) return;

    if (this.selectedItem.type === "card") {
      const slot = this.slideData.slots[this.selectedItem.index];
      if (!slot) return;

      if (transform.type === "resize") {
        slot.box[0] = to1080X(transform.left);
        slot.box[1] = to1080Y(transform.top);
        slot.box[2] = to1080W(transform.width);
        slot.box[3] = to1080H(transform.height);
        this.inspector.updateLiveCoords(slot.box[0], slot.box[1]);
        this.inspector.updateLiveDimensions(slot.box[2], slot.box[3]);
      }
    } else if (this.selectedItem.type === "sticker") {
      const st = this.slideData.stickers[this.selectedItem.index];
      if (!st) return;

      if (transform.type === "resize") {
        st.x = to1080X(transform.left);
        st.y = to1080Y(transform.top);
        st.w = to1080W(transform.width);
        st.h = to1080H(transform.height);
        this.inspector.updateLiveCoords(st.x, st.y);
        this.inspector.updateLiveDimensions(st.w, st.h);
        if (this.inspector.stickerSizeVal) this.inspector.stickerSizeVal.textContent = `${st.w}px`;
      } else if (transform.type === "rotate") {
        st.rotation = transform.rotation;
        if (this.inspector.stickerRotVal) this.inspector.stickerRotVal.textContent = `${st.rotation}°`;
      }
    }
  }

  duplicateSelected() {
    if (!this.selectedItem) return;

    if (this.selectedItem.type === "card") {
      const orig = this.slideData.slots[this.selectedItem.index];
      const cloned = JSON.parse(JSON.stringify(orig));
      cloned.box[0] = Math.min(800, cloned.box[0] + 40);
      cloned.box[1] = Math.min(1000, cloned.box[1] + 40);
      this.slideData.slots.push(cloned);
      this.selectedItem = { type: "card", index: this.slideData.slots.length - 1 };
    } else if (this.selectedItem.type === "sticker") {
      const orig = this.slideData.stickers[this.selectedItem.index];
      const cloned = JSON.parse(JSON.stringify(orig));
      cloned.x = Math.min(800, (cloned.x || 100) + 40);
      cloned.y = Math.min(1000, (cloned.y || 100) + 40);
      this.slideData.stickers.push(cloned);
      this.selectedItem = { type: "sticker", index: this.slideData.stickers.length - 1 };
    }

    this.commitHistory();
    this.render();
  }

  centerSelected() {
    if (!this.selectedItem) return;

    if (this.selectedItem.type === "card") {
      const slot = this.slideData.slots[this.selectedItem.index];
      slot.box[0] = Math.round(540 - slot.box[2] / 2);
      slot.box[1] = Math.round(675 - slot.box[3] / 2);
    } else if (this.selectedItem.type === "sticker") {
      const st = this.slideData.stickers[this.selectedItem.index];
      const sw = st.w || 180;
      const sh = st.h || 180;
      st.x = Math.round(540 - sw / 2);
      st.y = Math.round(675 - sh / 2);
    }

    this.commitHistory();
    this.render();
  }

  bringForward() {
    if (!this.selectedItem) return;
    const { type, index } = this.selectedItem;

    if (type === "card" && index < this.slideData.slots.length - 1) {
      const temp = this.slideData.slots[index];
      this.slideData.slots[index] = this.slideData.slots[index + 1];
      this.slideData.slots[index + 1] = temp;
      this.selectedItem.index = index + 1;
    } else if (type === "sticker" && index < this.slideData.stickers.length - 1) {
      const temp = this.slideData.stickers[index];
      this.slideData.stickers[index] = this.slideData.stickers[index + 1];
      this.slideData.stickers[index + 1] = temp;
      this.selectedItem.index = index + 1;
    }

    this.commitHistory();
    this.render();
  }

  sendBackward() {
    if (!this.selectedItem) return;
    const { type, index } = this.selectedItem;

    if (type === "card" && index > 0) {
      const temp = this.slideData.slots[index];
      this.slideData.slots[index] = this.slideData.slots[index - 1];
      this.slideData.slots[index - 1] = temp;
      this.selectedItem.index = index - 1;
    } else if (type === "sticker" && index > 0) {
      const temp = this.slideData.stickers[index];
      this.slideData.stickers[index] = this.slideData.stickers[index - 1];
      this.slideData.stickers[index - 1] = temp;
      this.selectedItem.index = index - 1;
    }

    this.commitHistory();
    this.render();
  }

  deleteSelected() {
    if (!this.selectedItem) return;
    const { type, index } = this.selectedItem;

    if (type === "card") {
      this.slideData.slots.splice(index, 1);
    } else if (type === "sticker") {
      this.slideData.stickers.splice(index, 1);
    }

    this.selectedItem = null;
    this.commitHistory();
    this.render();
  }

  nudgeSelected(dir, step = 5) {
    if (!this.selectedItem) return;
    const { type, index } = this.selectedItem;

    if (type === "card") {
      const slot = this.slideData.slots[index];
      if (dir === "up") slot.box[1] -= step;
      if (dir === "down") slot.box[1] += step;
      if (dir === "left") slot.box[0] -= step;
      if (dir === "right") slot.box[0] += step;
    } else if (type === "sticker") {
      const st = this.slideData.stickers[index];
      if (dir === "up") st.y -= step;
      if (dir === "down") st.y += step;
      if (dir === "left") st.x -= step;
      if (dir === "right") st.x += step;
    }

    this.commitHistory();
    this.render();
  }

  togglePanMode(active) {
    if (this.selectedItem && this.selectedItem.type === "card") {
      this.panModeSlotIdx = active ? this.selectedItem.index : null;
      this.render();
    }
  }

  resetCrop(slotIdx) {
    if (slotIdx === undefined && this.selectedItem?.type === "card") {
      slotIdx = this.selectedItem.index;
    }
    if (slotIdx !== undefined && this.slideData.slots[slotIdx]) {
      this.slideData.slots[slotIdx].zoom = 1.0;
      this.slideData.slots[slotIdx].pan_x = 0;
      this.slideData.slots[slotIdx].pan_y = 0;
      this.commitHistory();
      this.render();
    }
  }

  updateActiveCard(update) {
    if (!this.selectedItem || this.selectedItem.type !== "card") return;
    const slot = this.slideData.slots[this.selectedItem.index];
    if (!slot) return;

    slot[update.field] = update.value;

    const cardEl = this.stageEl.querySelector(`.builder-card[data-slot-index="${this.selectedItem.index}"]`);
    if (cardEl) {
      if (update.field === "zoom" || update.field === "pan_x" || update.field === "pan_y") {
        const mediaEl = cardEl.querySelector(".builder-card-media-wrap img, .builder-card-media-wrap video");
        if (mediaEl) {
          const z = slot.zoom !== undefined ? slot.zoom : 1.0;
          const px = slot.pan_x !== undefined ? slot.pan_x : 0;
          const py = slot.pan_y !== undefined ? slot.pan_y : 0;
          mediaEl.style.transform = `scale(${z}) translate(${px}%, ${py}%)`;
        }
      } else if (update.field === "corner_radius") {
        cardEl.style.borderRadius = `${update.value}px`;
      } else if (update.field === "shadow") {
        cardEl.style.boxShadow = update.value ? "" : "none";
      } else if (update.field === "card_style") {
        if (update.value === "torn_paper") {
          cardEl.classList.add("style-torn");
        } else {
          cardEl.classList.remove("style-torn");
        }
      }
    }

    this.commitHistory();
  }

  updateActiveSticker(update) {
    if (!this.selectedItem || this.selectedItem.type !== "sticker") return;
    const st = this.slideData.stickers[this.selectedItem.index];
    if (!st) return;

    const stEl = this.stageEl.querySelector(`[data-sticker-index="${this.selectedItem.index}"]`);

    if (update.field === "size") {
      st.w = update.value;
      st.h = update.value;
      if (stEl) {
        stEl.style.width = `${toDisplayW(st.w)}px`;
        stEl.style.height = `${toDisplayH(st.h)}px`;
      }
    } else if (update.field === "rotation") {
      st.rotation = update.value;
      if (stEl) {
        stEl.style.transform = `rotate(${st.rotation}deg)`;
      }
    }

    this.commitHistory();
  }

  swapMedia(mediaName) {
    if (!this.selectedItem || this.selectedItem.type !== "card") return;
    const slot = this.slideData.slots[this.selectedItem.index];
    if (!slot) return;

    slot.media_name = mediaName;
    slot.thumb_url = `/api/thumbnail/${encodeURIComponent(mediaName)}`;
    this.commitHistory();
    this.render();
  }

  addCard() {
    const firstMedia = this.mediaFiles[0]?.name || "";
    const newCard = {
      box: [120, 200, 840, 950],
      media_name: firstMedia,
      thumb_url: firstMedia ? `/api/thumbnail/${encodeURIComponent(firstMedia)}` : "",
      corner_radius: 14,
      shadow: true,
      card_style: "rounded",
      zoom: 1.0,
      pan_x: 0,
      pan_y: 0
    };
    this.slideData.slots.push(newCard);
    this.selectedItem = { type: "card", index: this.slideData.slots.length - 1 };
    this.commitHistory();
    this.render();
  }

  addSticker(stData) {
    if (!this.slideData.stickers) this.slideData.stickers = [];
    this.slideData.stickers.push(stData);
    this.selectedItem = { type: "sticker", index: this.slideData.stickers.length - 1 };
    this.commitHistory();
    this.render();
  }

  async saveSlide() {
    const saveBtn = document.getElementById("builderSaveBtn");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = "⏳ Rendering...";
    }

    try {
      const res = await saveCustomSlide({
        job_id: this.jobId,
        slide_index: this.slideIndex,
        slots: this.slideData.slots,
        stickers: this.slideData.stickers,
        bg_color: this.slideData.bg_color,
        is_full_bleed: this.slideData.is_full_bleed
      });

      if (res.success) {
        if (this.options.showToast) {
          this.options.showToast("Slide customized & re-rendered successfully!", "success");
        }
        if (this.options.onSlideSaved) {
          this.options.onSlideSaved(this.slideIndex, res.slide);
        }
        this.close();
      }
    } catch (err) {
      alert("Error saving customized slide: " + err.message);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = "💾 Save & Re-render";
      }
    }
  }
}
