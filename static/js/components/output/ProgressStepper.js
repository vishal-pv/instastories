// ==========================================================================
// Autonomous Pipeline Progress Stepper Component
// ==========================================================================

export class ProgressStepper {
  constructor(containerEl, barEl, msgEl, stepItems = []) {
    this.containerEl = containerEl;
    this.barEl = barEl;
    this.msgEl = msgEl;
    this.stepItems = stepItems;
  }

  show() {
    if (this.containerEl) this.containerEl.style.display = "block";
  }

  hide() {
    if (this.containerEl) this.containerEl.style.display = "none";
  }

  update(percent, message) {
    if (this.barEl) {
      this.barEl.style.width = `${percent}%`;
    }
    if (this.msgEl) {
      this.msgEl.textContent = message || "Processing...";
    }

    // Determine active step from percent
    let activeStepNum = 1;
    if (percent > 20) activeStepNum = 2;
    if (percent > 45) activeStepNum = 3;
    if (percent > 70) activeStepNum = 4;
    if (percent >= 90) activeStepNum = 5;

    this.stepItems.forEach((item, idx) => {
      if (!item) return;
      const stepIdx = idx + 1;
      item.classList.remove("active", "done");
      if (stepIdx < activeStepNum) {
        item.classList.add("done");
      } else if (stepIdx === activeStepNum) {
        item.classList.add("active");
      }
    });
  }
}
