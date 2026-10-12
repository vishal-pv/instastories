// ==========================================================================
// Canva-Grade 8-Point Transform Gizmo with Rotation Pin
// ==========================================================================

export class TransformGizmo {
  constructor(stageEl, onTransform, onTransformEnd) {
    this.stageEl = stageEl;
    this.onTransform = onTransform;
    this.onTransformEnd = onTransformEnd;
    this.container = null;
    this.target = null;
  }

  attach(targetEl, options = {}) {
    this.detach();
    if (!targetEl) return;

    this.target = targetEl;
    this.isCard = options.isCard || false;

    const gizmo = document.createElement("div");
    gizmo.className = "gizmo-box";

    const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    handles.forEach(pos => {
      const h = document.createElement("div");
      h.className = `gizmo-handle handle-${pos}`;
      h.dataset.pos = pos;
      h.addEventListener("pointerdown", (e) => this.startResize(e, pos));
      gizmo.appendChild(h);
    });

    // Top rotation stem & handle
    const stem = document.createElement("div");
    stem.className = "gizmo-rot-stem";
    gizmo.appendChild(stem);

    const rotHandle = document.createElement("div");
    rotHandle.className = "gizmo-rot-handle";
    rotHandle.title = "Drag to Rotate";
    rotHandle.innerHTML = "↺";
    rotHandle.addEventListener("pointerdown", (e) => this.startRotate(e));
    gizmo.appendChild(rotHandle);

    targetEl.appendChild(gizmo);
    this.container = gizmo;
  }

  detach() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.target = null;
  }

  startResize(e, pos) {
    e.stopPropagation();
    e.preventDefault();
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    this.stageEl.classList.add("is-dragging");

    const startX = e.clientX;
    const startY = e.clientY;
    const origLeft = parseFloat(this.target.style.left) || 0;
    const origTop = parseFloat(this.target.style.top) || 0;
    const origW = parseFloat(this.target.style.width) || this.target.offsetWidth;
    const origH = parseFloat(this.target.style.height) || this.target.offsetHeight;

    let newLeft = origLeft;
    let newTop = origTop;
    let newW = origW;
    let newH = origH;
    let rafId = null;

    const onPointerMove = (moveEv) => {
      moveEv.preventDefault();
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;

      newLeft = origLeft;
      newTop = origTop;
      newW = origW;
      newH = origH;

      if (pos.includes("e")) newW = Math.max(25, origW + dx);
      if (pos.includes("s")) newH = Math.max(25, origH + dy);

      if (pos.includes("w")) {
        const potentialW = origW - dx;
        if (potentialW >= 25) {
          newW = potentialW;
          newLeft = origLeft + dx;
        }
      }

      if (pos.includes("n")) {
        const potentialH = origH - dy;
        if (potentialH >= 25) {
          newH = potentialH;
          newTop = origTop + dy;
        }
      }

      // If sticker, keep aspect ratio on corner drags
      if (!this.isCard && (pos === "se" || pos === "nw" || pos === "ne" || pos === "sw")) {
        const ratio = origW / (origH || 1);
        if (pos.includes("e") || pos.includes("w")) {
          newH = Math.max(25, newW / ratio);
        }
      }

      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          this.target.style.left = `${newLeft}px`;
          this.target.style.top = `${newTop}px`;
          this.target.style.width = `${newW}px`;
          this.target.style.height = `${newH}px`;

          if (this.onTransform) {
            this.onTransform({
              type: "resize",
              pos,
              left: newLeft,
              top: newTop,
              width: newW,
              height: newH
            });
          }
          rafId = null;
        });
      }
    };

    const onPointerUp = () => {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      this.stageEl.classList.remove("is-dragging");
      if (this.onTransformEnd) this.onTransformEnd({ type: "resize" });
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  startRotate(e) {
    e.stopPropagation();
    e.preventDefault();
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    this.stageEl.classList.add("is-dragging");

    const rect = this.target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let currentAngle = 0;
    let rafId = null;

    const onPointerMove = (moveEv) => {
      moveEv.preventDefault();
      const angleRad = Math.atan2(moveEv.clientY - centerY, moveEv.clientX - centerX);
      let angleDeg = Math.round((angleRad * (180 / Math.PI)) + 90);

      // Normalize angle between -180 and 180
      if (angleDeg > 180) angleDeg -= 360;
      if (angleDeg < -180) angleDeg += 360;

      // Smart magnetic snap at 0, 90, -90, 180 within 3 degrees
      if (Math.abs(angleDeg) <= 3) angleDeg = 0;
      if (Math.abs(angleDeg - 90) <= 3) angleDeg = 90;
      if (Math.abs(angleDeg + 90) <= 3) angleDeg = -90;

      currentAngle = angleDeg;

      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          this.target.style.transform = `rotate(${currentAngle}deg)`;
          if (this.onTransform) {
            this.onTransform({
              type: "rotate",
              rotation: currentAngle
            });
          }
          rafId = null;
        });
      }
    };

    const onPointerUp = () => {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      this.stageEl.classList.remove("is-dragging");
      if (this.onTransformEnd) this.onTransformEnd({ type: "rotate" });
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }
}
