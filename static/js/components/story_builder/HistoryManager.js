// ==========================================================================
// Undo / Redo History Stack Manager
// ==========================================================================

export class HistoryManager {
  constructor(onChangeCallback = null) {
    this.history = [];
    this.currentIndex = -1;
    this.maxHistory = 35;
    this.onChangeCallback = onChangeCallback;
  }

  reset(initialState) {
    this.history = [JSON.parse(JSON.stringify(initialState))];
    this.currentIndex = 0;
    this.notify();
  }

  push(state) {
    // If we performed an action while somewhere back in the stack, cut off redo future
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    const cloned = JSON.parse(JSON.stringify(state));
    this.history.push(cloned);

    // Limit stack memory
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }

    this.notify();
  }

  canUndo() {
    return this.currentIndex > 0;
  }

  canRedo() {
    return this.currentIndex < this.history.length - 1;
  }

  undo() {
    if (!this.canUndo()) return null;
    this.currentIndex--;
    this.notify();
    return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
  }

  redo() {
    if (!this.canRedo()) return null;
    this.currentIndex++;
    this.notify();
    return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
  }

  notify() {
    if (typeof this.onChangeCallback === "function") {
      this.onChangeCallback({
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        index: this.currentIndex,
        total: this.history.length
      });
    }
  }
}
