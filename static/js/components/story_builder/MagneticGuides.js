// ==========================================================================
// Magnetic Alignment Guides Renderer
// ==========================================================================

export class MagneticGuides {
  constructor(stageEl) {
    this.stageEl = stageEl;
    this.guideX = null;
    this.guideY = null;
    this.init();
  }

  init() {
    this.guideX = document.createElement("div");
    this.guideX.className = "snap-guide snap-guide-x";
    this.guideX.style.left = "200px"; // Center X (400px / 2)

    this.guideY = document.createElement("div");
    this.guideY.className = "snap-guide snap-guide-y";
    this.guideY.style.top = "250px"; // Center Y (500px / 2)

    this.stageEl.appendChild(this.guideX);
    this.stageEl.appendChild(this.guideY);
  }

  update(showX, showY) {
    if (this.guideX) {
      if (showX) {
        this.guideX.classList.add("active");
      } else {
        this.guideX.classList.remove("active");
      }
    }

    if (this.guideY) {
      if (showY) {
        this.guideY.classList.add("active");
      } else {
        this.guideY.classList.remove("active");
      }
    }
  }

  hideAll() {
    this.update(false, false);
  }
}
