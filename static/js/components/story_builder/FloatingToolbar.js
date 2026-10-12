// ==========================================================================
// Contextual Floating Action Toolbar (Canva-Style Pill)
// ==========================================================================

export class FloatingToolbar {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.element = null;
  }

  render(parentElement, isCard = false) {
    this.destroy();

    const pill = document.createElement("div");
    pill.className = "canva-floating-pill";

    // 1. Duplicate
    const dupBtn = document.createElement("button");
    dupBtn.type = "button";
    dupBtn.className = "cfp-btn";
    dupBtn.title = "Duplicate Element";
    dupBtn.innerHTML = "<span>📋</span><span>Copy</span>";
    dupBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    dupBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.callbacks.onDuplicate) this.callbacks.onDuplicate();
    });
    pill.appendChild(dupBtn);

    // 2. Center Snap
    const centerBtn = document.createElement("button");
    centerBtn.type = "button";
    centerBtn.className = "cfp-btn";
    centerBtn.title = "Snap to Center (540x675)";
    centerBtn.innerHTML = "<span>🎯</span><span>Center</span>";
    centerBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    centerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.callbacks.onCenter) this.callbacks.onCenter();
    });
    pill.appendChild(centerBtn);

    // 3. Bring Forward
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "cfp-btn";
    upBtn.title = "Bring Forward";
    upBtn.innerHTML = "<span>⬆️</span>";
    upBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.callbacks.onLayerUp) this.callbacks.onLayerUp();
    });
    pill.appendChild(upBtn);

    // 4. Send Backward
    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "cfp-btn";
    downBtn.title = "Send Backward";
    downBtn.innerHTML = "<span>⬇️</span>";
    downBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.callbacks.onLayerDown) this.callbacks.onLayerDown();
    });
    pill.appendChild(downBtn);

    // 5. Delete
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "cfp-btn cfp-btn-danger";
    delBtn.title = "Delete Element";
    delBtn.innerHTML = "<span>🗑️</span>";
    delBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.callbacks.onDelete) this.callbacks.onDelete();
    });
    pill.appendChild(delBtn);

    parentElement.appendChild(pill);
    this.element = pill;
    return pill;
  }

  destroy() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}
