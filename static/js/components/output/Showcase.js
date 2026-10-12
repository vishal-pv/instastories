// ==========================================================================
// Cloned Carousel Showcase & Output Results View
// ==========================================================================

export class Showcase {
  constructor(options = {}) {
    this.options = options; // { onOpenBuilder }
    this.emptyState = document.getElementById("emptyState");
    this.resultsContainer = document.getElementById("resultsContainer");
    this.downloadZipBtn = document.getElementById("downloadZipBtn");

    // Tabs
    this.tabSlides = document.getElementById("tabSlides");
    this.tabReel = document.getElementById("tabReel");
    this.slidesView = document.getElementById("slidesView");
    this.reelView = document.getElementById("reelView");

    // Slide elements
    this.slideTabs = document.getElementById("slideTabs");
    this.activeSlideImg = document.getElementById("activeSlideImg");
    this.activeSlideVid = document.getElementById("activeSlideVid");
    this.activeSlideTitle = document.getElementById("activeSlideTitle");
    this.btnDownloadJpg = document.getElementById("btnDownloadJpg");
    this.btnDownloadMp4 = document.getElementById("btnDownloadMp4");
    this.btnOpenBuilder = document.getElementById("btnOpenBuilder");

    // Reel elements
    this.reelVideoPlayer = document.getElementById("reelVideoPlayer");
    this.btnDownloadReel = document.getElementById("btnDownloadReel");

    this.currentJob = null;
    this.activeSlideIndex = 0;

    this.bindEvents();
  }

  bindEvents() {
    if (this.tabSlides && this.tabReel) {
      this.tabSlides.addEventListener("click", () => {
        this.tabSlides.classList.add("active");
        this.tabReel.classList.remove("active");
        if (this.slidesView) this.slidesView.style.display = "block";
        if (this.reelView) this.reelView.style.display = "none";
        if (this.reelVideoPlayer) this.reelVideoPlayer.pause();
      });

      this.tabReel.addEventListener("click", () => {
        this.tabReel.classList.add("active");
        this.tabSlides.classList.remove("active");
        if (this.slidesView) this.slidesView.style.display = "none";
        if (this.reelView) this.reelView.style.display = "flex";
      });
    }

    if (this.btnOpenBuilder) {
      this.btnOpenBuilder.addEventListener("click", () => {
        if (!this.currentJob || !this.currentJob.result?.slides) return;
        const slide = this.currentJob.result.slides[this.activeSlideIndex];
        if (this.options.onOpenBuilder) {
          this.options.onOpenBuilder(this.currentJob.id, slide.index, slide);
        }
      });
    }

    if (this.downloadZipBtn) {
      this.downloadZipBtn.addEventListener("click", () => {
        if (!this.currentJob) return;
        window.location.href = `/api/download_zip/${this.currentJob.id}`;
      });
    }
  }

  renderJob(job) {
    if (!job || !job.result || !job.result.slides || job.result.slides.length === 0) {
      if (this.emptyState) this.emptyState.style.display = "block";
      if (this.resultsContainer) this.resultsContainer.style.display = "none";
      if (this.downloadZipBtn) this.downloadZipBtn.style.display = "none";
      return;
    }

    this.currentJob = job;
    if (this.emptyState) this.emptyState.style.display = "none";
    if (this.resultsContainer) this.resultsContainer.style.display = "block";
    if (this.downloadZipBtn) this.downloadZipBtn.style.display = "inline-flex";

    // Setup slide tabs
    if (this.slideTabs) {
      this.slideTabs.innerHTML = "";
      job.result.slides.forEach((slide, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `slide-tab-btn ${idx === this.activeSlideIndex ? "active" : ""}`;
        btn.textContent = slide.title || `Slide ${slide.index}`;
        btn.addEventListener("click", () => this.showSlide(idx));
        this.slideTabs.appendChild(btn);
      });
    }

    // Reel video setup
    if (job.result.reel && this.reelVideoPlayer) {
      const reelUrl = `/api/output/${job.id}/${job.result.reel}`;
      this.reelVideoPlayer.src = reelUrl;
      if (this.btnDownloadReel) {
        this.btnDownloadReel.href = `/api/download/${job.id}/${job.result.reel}`;
      }
    }

    this.showSlide(this.activeSlideIndex);
  }

  showSlide(index) {
    if (!this.currentJob || !this.currentJob.result?.slides) return;
    this.activeSlideIndex = index;
    const slide = this.currentJob.result.slides[index];
    if (!slide) return;

    // Update tab active styles
    if (this.slideTabs) {
      Array.from(this.slideTabs.children).forEach((btn, idx) => {
        btn.classList.toggle("active", idx === index);
      });
    }

    if (this.activeSlideTitle) {
      this.activeSlideTitle.textContent = slide.title || `Slide ${slide.index}`;
    }

    const cacheBuster = `?t=${Date.now()}`;
    const jpgUrl = `/api/output/${this.currentJob.id}/${slide.jpg}${cacheBuster}`;
    const mp4Url = slide.mp4 ? `/api/output/${this.currentJob.id}/${slide.mp4}${cacheBuster}` : null;

    if (mp4Url && mp4Url.endsWith(".mp4") && this.activeSlideVid) {
      this.activeSlideVid.src = mp4Url;
      this.activeSlideVid.style.display = "block";
      if (this.activeSlideImg) this.activeSlideImg.style.display = "none";
    } else if (this.activeSlideImg) {
      this.activeSlideImg.src = jpgUrl;
      this.activeSlideImg.style.display = "block";
      if (this.activeSlideVid) this.activeSlideVid.style.display = "none";
    }

    if (this.btnDownloadJpg) {
      this.btnDownloadJpg.href = `/api/download/${this.currentJob.id}/${slide.jpg}`;
    }
    if (this.btnDownloadMp4 && slide.mp4) {
      this.btnDownloadMp4.href = `/api/download/${this.currentJob.id}/${slide.mp4}`;
      this.btnDownloadMp4.style.display = "inline-flex";
    } else if (this.btnDownloadMp4) {
      this.btnDownloadMp4.style.display = "none";
    }
  }

  updateSlideResult(slideIndex, updatedSlide) {
    if (!this.currentJob || !this.currentJob.result?.slides) return;
    const idx = this.currentJob.result.slides.findIndex(s => s.index === slideIndex);
    if (idx !== -1) {
      this.currentJob.result.slides[idx] = {
        ...this.currentJob.result.slides[idx],
        ...updatedSlide
      };
      this.showSlide(idx);
    }
  }
}
