// ==========================================================================
// Central Reactive State Store & Pub/Sub Event Bus
// ==========================================================================

class AppStore {
  constructor() {
    this.state = {
      currentJobId: null,
      jobData: null,
      activeSlideIndex: 0,
      mediaFiles: [],
      builderSlide: null,
      selectedItem: null, // { type: 'card' | 'sticker', index: number }
      panModeActive: false
    };
    this.listeners = new Map();
  }

  getState() {
    return this.state;
  }

  setState(updates) {
    const prev = { ...this.state };
    this.state = { ...this.state, ...updates };
    this.emit("stateChanged", { prev, current: this.state, updates });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in event handler for "${event}":`, err);
        }
      });
    }
  }
}

export const store = new AppStore();
