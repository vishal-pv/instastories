// ==========================================================================
// InstaClone Studio Frontend Controller
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const postUrlInput = document.getElementById("postUrlInput");
  const pasteBtn = document.getElementById("pasteBtn");
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const mediaGrid = document.getElementById("mediaGrid");
  const mediaCountBadge = document.getElementById("mediaCountBadge");
  const cloneBtn = document.getElementById("cloneBtn");
  const presetChips = document.querySelectorAll(".chip");

  // Output Elements
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");
  const progressMessage = document.getElementById("progressMessage");
  const stepItems = [
    document.getElementById("step1"),
    document.getElementById("step2"),
    document.getElementById("step3"),
    document.getElementById("step4"),
    document.getElementById("step5")
  ];
  const emptyState = document.getElementById("emptyState");
  const resultsContainer = document.getElementById("resultsContainer");
  const downloadZipBtn = document.getElementById("downloadZipBtn");
  
  // Tabs & Views
  const tabSlides = document.getElementById("tabSlides");
  const tabReel = document.getElementById("tabReel");
  const slidesView = document.getElementById("slidesView");
  const reelView = document.getElementById("reelView");
  const slideTabs = document.getElementById("slideTabs");
  const activeSlideImg = document.getElementById("activeSlideImg");
  const activeSlideVid = document.getElementById("activeSlideVid");
  const activeSlideTitle = document.getElementById("activeSlideTitle");
  const btnDownloadJpg = document.getElementById("btnDownloadJpg");
  const btnDownloadMp4 = document.getElementById("btnDownloadMp4");
  const reelVideoPlayer = document.getElementById("reelVideoPlayer");
  const btnDownloadReel = document.getElementById("btnDownloadReel");

  const browseBtn = document.getElementById("browseBtn");
  const deleteModal = document.getElementById("deleteModal");
  const deleteModalText = document.getElementById("deleteModalText");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  const toastContainer = document.getElementById("toastContainer");

  let currentJobId = null;
  let pollInterval = null;
  let jobData = null;
  let activeSlideIndex = 0;
  let filePendingDeletion = null;

  // --------------------------------------------------------------------------
  // Notification Toast Helper
  // --------------------------------------------------------------------------
  function showToast(message, type = "info", duration = 3500) {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "⚠️";
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.25s ease";
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  // --------------------------------------------------------------------------
  // Delete Confirmation Modal Handling
  // --------------------------------------------------------------------------
  function openDeleteModal(filename) {
    filePendingDeletion = filename;
    deleteModalText.innerHTML = `Are you sure you want to remove <strong>${filename}</strong> from your input media?`;
    deleteModal.classList.add("active");
  }

  function closeDeleteModal() {
    filePendingDeletion = null;
    deleteModal.classList.remove("active");
  }

  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener("click", closeDeleteModal);
  if (deleteModal) {
    deleteModal.addEventListener("click", (e) => {
      if (e.target === deleteModal) closeDeleteModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && deleteModal && deleteModal.classList.contains("active")) {
      closeDeleteModal();
    }
  });

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
      if (!filePendingDeletion) return;
      const targetFile = filePendingDeletion;
      confirmDeleteBtn.disabled = true;
      confirmDeleteBtn.textContent = "Deleting...";

      try {
        const res = await fetch("/api/delete_media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: targetFile })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast(`Removed "${targetFile}"`, "success");
          await loadMediaTray();
        } else {
          showToast(data.error || "Failed to delete file", "error");
        }
      } catch (err) {
        console.error("Delete failed:", err);
        showToast("Network error while deleting file", "error");
      } finally {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = "Delete File";
        closeDeleteModal();
      }
    });
  }

  // --------------------------------------------------------------------------
  // 1. Initial Load & Media Management
  // --------------------------------------------------------------------------
  async function loadMediaTray() {
    try {
      const res = await fetch("/api/media");
      const data = await res.json();
      mediaCountBadge.textContent = `${data.count} Files`;
      mediaGrid.innerHTML = "";

      if (!data.files || data.files.length === 0) {
        mediaGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-faint); font-size: 12px; padding: 16px;">No media files yet. Drag & drop or browse above.</div>`;
        return;
      }

      data.files.forEach(file => {
        const item = document.createElement("div");
        item.className = "media-item";

        const badgeType = file.type === "image" ? "IMG" : "VID 🎬";
        const badgeBg = file.type === "image" ? "" : "background: rgba(14, 165, 233, 0.85);";

        item.innerHTML = `
          <img src="${file.thumb_url}" alt="${file.name}" loading="lazy">
          <span class="media-badge-type" style="${badgeBg}">${badgeType}</span>
          <button type="button" class="media-delete-btn" title="Delete ${file.name}">✕</button>
        `;

        const delBtn = item.querySelector(".media-delete-btn");
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          openDeleteModal(file.name);
        });

        mediaGrid.appendChild(item);
      });
    } catch (err) {
      console.error("Error loading media:", err);
    }
  }

  // --------------------------------------------------------------------------
  // 2. Upload Handling with Real-time Progress Bar
  // --------------------------------------------------------------------------
  function uploadFiles(files) {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    dropZone.classList.add("dragover");
    const dropText = document.getElementById("dropText");
    if (dropText) dropText.textContent = `Uploading ${files.length} file(s)...`;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && dropText) {
        const pct = Math.round((e.loaded / e.total) * 100);
        dropText.textContent = `Uploading ${files.length} file(s) (${pct}%)...`;
      }
    };

    xhr.onload = async () => {
      dropZone.classList.remove("dragover");
      if (dropText) dropText.textContent = "Drag & drop photos or videos here";
      if (xhr.status === 200) {
        try {
          const resData = JSON.parse(xhr.responseText);
          showToast(`Uploaded ${resData.uploaded?.length || files.length} file(s) successfully!`, "success");
        } catch {
          showToast("Upload completed!", "success");
        }
        await loadMediaTray();
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          showToast(errData.error || "Upload failed. File may exceed server size limit.", "error");
        } catch {
          showToast("Upload failed. File may exceed server size limit.", "error");
        }
      }
    };

    xhr.onerror = () => {
      dropZone.classList.remove("dragover");
      if (dropText) dropText.textContent = "Drag & drop photos or videos here";
      showToast("Network error during file upload.", "error");
    };

    xhr.send(formData);
  }

  // Browse files button click
  if (browseBtn) {
    browseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      fileInput.click();
    });
  }

  // DropZone general click (when user clicks inside drop area but outside buttons)
  dropZone.addEventListener("click", (e) => {
    if (!e.target.closest("button")) {
      fileInput.click();
    }
  });

  // When files are chosen from the file picker dialog
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length > 0) {
      const selectedFiles = Array.from(fileInput.files);
      fileInput.value = "";
      uploadFiles(selectedFiles);
    }
  });

  // Drag and drop event listeners
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(Array.from(e.dataTransfer.files));
    }
  });

  // --------------------------------------------------------------------------
  // 3. Preset Chips & Paste
  // --------------------------------------------------------------------------
  presetChips.forEach(chip => {
    chip.addEventListener("click", () => {
      postUrlInput.value = chip.dataset.url;
      postUrlInput.focus();
    });
  });

  pasteBtn.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.includes("instagram.com")) {
        postUrlInput.value = text.trim();
      } else {
        postUrlInput.focus();
        postUrlInput.select();
      }
    } catch (e) {
      postUrlInput.focus();
      postUrlInput.select();
    }
  });

  // --------------------------------------------------------------------------
  // 4. Autonomous Cloning Pipeline Trigger & Polling
  // --------------------------------------------------------------------------
  cloneBtn.addEventListener("click", async () => {
    const url = postUrlInput.value.trim();
    if (!url) {
      alert("Please enter a valid Instagram post URL.");
      postUrlInput.focus();
      return;
    }

    cloneBtn.disabled = true;
    cloneBtn.innerHTML = `<span>⏳ Engine Running...</span>`;
    progressContainer.style.display = "block";
    progressBar.style.width = "5%";
    progressMessage.textContent = "Starting autonomous pipeline...";
    updateStepper(1);

    try {
      const res = await fetch("/api/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to trigger pipeline");
      }

      currentJobId = data.job_id;
      startPolling(currentJobId);
    } catch (err) {
      console.error(err);
      alert("Error starting pipeline: " + err.message);
      cloneBtn.disabled = false;
      cloneBtn.innerHTML = `<span class="btn-icon">🚀</span><span>Clone & Generate Post</span>`;
      progressContainer.style.display = "none";
    }
  });

  function startPolling(jobId) {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${jobId}`);
        const data = await res.json();

        progressBar.style.width = `${data.percent || 10}%`;
        progressMessage.textContent = data.message || "Working...";

        // Update stepper based on percent
        if (data.percent < 25) {
          updateStepper(1);
        } else if (data.percent < 45) {
          updateStepper(2);
        } else if (data.percent < 65) {
          updateStepper(3);
        } else if (data.percent < 85) {
          updateStepper(4);
        } else {
          updateStepper(5);
        }

        if (data.status === "completed") {
          clearInterval(pollInterval);
          cloneBtn.disabled = false;
          cloneBtn.innerHTML = `<span class="btn-icon">🚀</span><span>Clone & Generate Post</span>`;
          renderResults(data);
        } else if (data.status === "error") {
          clearInterval(pollInterval);
          cloneBtn.disabled = false;
          cloneBtn.innerHTML = `<span class="btn-icon">🚀</span><span>Clone & Generate Post</span>`;
          progressMessage.textContent = `❌ Error: ${data.message}`;
          alert(`Pipeline error: ${data.message}`);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1500);
  }

  function updateStepper(activeStepNum) {
    stepItems.forEach((step, idx) => {
      const num = idx + 1;
      step.classList.remove("active", "done");
      if (num < activeStepNum) {
        step.classList.add("done");
      } else if (num === activeStepNum) {
        step.classList.add("active");
      }
    });
  }

  // --------------------------------------------------------------------------
  // 5. Results Presentation & Showcase
  // --------------------------------------------------------------------------
  function renderResults(job) {
    jobData = job;
    emptyState.style.display = "none";
    resultsContainer.style.display = "block";

    // Configure 1-Click ZIP Download
    downloadZipBtn.style.display = "inline-flex";
    downloadZipBtn.onclick = () => {
      window.location.href = `/api/download_zip/${job.id}`;
    };

    const slides = job.result?.slides || [];
    if (slides.length === 0) return;

    // Render Slide Selector Tabs
    slideTabs.innerHTML = "";
    slides.forEach((s, idx) => {
      const tab = document.createElement("button");
      tab.className = `slide-tab-btn ${idx === 0 ? "active" : ""}`;
      tab.textContent = `Slide ${idx + 1}`;
      tab.addEventListener("click", () => {
        document.querySelectorAll(".slide-tab-btn").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        showSlide(idx);
      });
      slideTabs.appendChild(tab);
    });

    // Configure Reel Video
    if (job.result?.reel) {
      const reelUrl = `/api/output/${job.id}/${job.result.reel}`;
      const reelDownloadUrl = `/api/download/${job.id}/${job.result.reel}`;
      reelVideoPlayer.src = reelUrl;
      btnDownloadReel.href = reelDownloadUrl;
      btnDownloadReel.download = job.result.reel;
    }

    // Default to first slide
    showSlide(0);
  }

  function showSlide(index) {
    if (!jobData || !jobData.result?.slides) return;
    const slides = jobData.result.slides;
    const s = slides[index];
    if (!s) return;

    activeSlideIndex = index;
    activeSlideTitle.textContent = `Slide ${index + 1}: ${s.title}`;

    const jpgUrl = `/api/output/${jobData.id}/${s.jpg}`;
    const mp4Url = `/api/output/${jobData.id}/${s.mp4}`;
    const jpgDownload = `/api/download/${jobData.id}/${s.jpg}`;
    const mp4Download = `/api/download/${jobData.id}/${s.mp4}`;

    // Set preview image
    activeSlideImg.src = jpgUrl;
    activeSlideImg.style.display = "block";
    activeSlideVid.style.display = "none";
    activeSlideVid.pause();

    // Set download links (forced attachment download)
    btnDownloadJpg.href = jpgDownload;
    btnDownloadJpg.download = s.jpg;

    btnDownloadMp4.href = mp4Download;
    btnDownloadMp4.download = s.mp4;

  }

  // --------------------------------------------------------------------------
  // 6. View Switcher (Individual Slides vs Reel)
  // --------------------------------------------------------------------------
  tabSlides.addEventListener("click", () => {
    tabSlides.classList.add("active");
    tabReel.classList.remove("active");
    slidesView.style.display = "flex";
    reelView.style.display = "none";
    reelVideoPlayer.pause();
  });

  tabReel.addEventListener("click", () => {
    tabReel.classList.add("active");
    tabSlides.classList.remove("active");
    slidesView.style.display = "none";
    reelView.style.display = "flex";
  });

  // --------------------------------------------------------------------------
  // 7. Interactive Story & Layout Builder Controller
  // --------------------------------------------------------------------------
  const btnOpenBuilder = document.getElementById("btnOpenBuilder");
  const storyBuilderModal = document.getElementById("storyBuilderModal");
  const builderCloseBtn = document.getElementById("builderCloseBtn");
  const builderSlideSubtitle = document.getElementById("builderSlideSubtitle");
  const builderStage = document.getElementById("builderStage");
  const builderAddCardBtn = document.getElementById("builderAddCardBtn");
  const builderAddStickerBtn = document.getElementById("builderAddStickerBtn");
  const builderAddPillBtn = document.getElementById("builderAddPillBtn");
  const builderAddCaptionBtn = document.getElementById("builderAddCaptionBtn");
  const builderResetBtn = document.getElementById("builderResetBtn");
  const builderSaveBtn = document.getElementById("builderSaveBtn");

  const cardInspectorEmpty = document.getElementById("cardInspectorEmpty");
  const cardInspectorContent = document.getElementById("cardInspectorContent");
  const valX = document.getElementById("valX");
  const valY = document.getElementById("valY");
  const valW = document.getElementById("valW");
  const valH = document.getElementById("valH");
  const radiusVal = document.getElementById("radiusVal");
  const radiusInput = document.getElementById("radiusInput");
  const shadowToggle = document.getElementById("shadowToggle");
  const deleteCardBtn = document.getElementById("deleteCardBtn");
  const builderMediaTray = document.getElementById("builderMediaTray");
  const nudgeBtns = document.querySelectorAll(".btn-nudge");

  // In-Card Photo Alignment & Zoom controls
  const zoomInput = document.getElementById("zoomInput");
  const zoomVal = document.getElementById("zoomVal");
  const panXInput = document.getElementById("panXInput");
  const panXVal = document.getElementById("panXVal");
  const panYInput = document.getElementById("panYInput");
  const panYVal = document.getElementById("panYVal");
  const btnResetCrop = document.getElementById("btnResetCrop");
  const btnTogglePanMode = document.getElementById("btnTogglePanMode");
  const panModeHint = document.getElementById("panModeHint");
  const cardStyleBtns = document.querySelectorAll(".btn-card-style");

  // Sticker controls
  const builderStickersTray = document.getElementById("builderStickersTray");
  const btnCustomEmoji = document.getElementById("btnCustomEmoji");
  const quickEmojis = document.querySelectorAll(".quick-emoji");
  const stickerInspector = document.getElementById("stickerInspector");
  const selectedStickerTitle = document.getElementById("selectedStickerTitle");
  const deleteStickerBtn = document.getElementById("deleteStickerBtn");
  const stickerSizeInput = document.getElementById("stickerSizeInput");
  const stickerSizeVal = document.getElementById("stickerSizeVal");
  const stickerRotInput = document.getElementById("stickerRotInput");
  const stickerRotVal = document.getElementById("stickerRotVal");
  const nudgeStickerBtns = document.querySelectorAll(".btn-nudge-st");

  // Sticker search, categories & upload
  const stickerSearchInput = document.getElementById("stickerSearchInput");
  const stickerCategoryBtns = document.querySelectorAll(".st-cat-btn");
  const btnUploadSticker = document.getElementById("btnUploadSticker");
  const stickerFileInput = document.getElementById("stickerFileInput");
  let currentStickerCategory = "all";
  let stickerSearchDebounce = null;

  const SCALE = 2.7; // 1080 / 400 = 2.7 (1350 / 500 = 2.7)

  let builderState = {
    slideIndex: 1,
    slots: [],
    stickers: [],
    selectedSlotIdx: null,
    selectedStickerIdx: null,
    isPanningPhoto: false,
    bg_color: [50, 52, 55],
    is_full_bleed: false
  };

  if (btnOpenBuilder) {
    btnOpenBuilder.addEventListener("click", () => {
      openStoryBuilder();
    });
  }

  if (builderCloseBtn) {
    builderCloseBtn.addEventListener("click", () => {
      exitPanMode();
      storyBuilderModal.classList.remove("active");
    });
  }

  function openStoryBuilder() {
    if (!jobData || !jobData.result?.slides) {
      showToast("No active job to edit", "error");
      return;
    }

    const currentSlide = jobData.result.slides[activeSlideIndex];
    if (!currentSlide) return;

    builderState.slideIndex = activeSlideIndex + 1;
    builderState.bg_color = currentSlide.bg_color || [50, 52, 55];
    builderState.is_full_bleed = !!currentSlide.is_full_bleed;
    builderState.stickers = currentSlide.stickers ? JSON.parse(JSON.stringify(currentSlide.stickers)) : [];
    builderState.isPanningPhoto = false;

    // Clone slots with safe defaults
    if (currentSlide.slots && currentSlide.slots.length > 0) {
      builderState.slots = JSON.parse(JSON.stringify(currentSlide.slots)).map(s => ({
        ...s,
        zoom: s.zoom !== undefined ? s.zoom : 1.0,
        pan_x: s.pan_x !== undefined ? s.pan_x : 0.0,
        pan_y: s.pan_y !== undefined ? s.pan_y : 0.0,
        card_style: s.card_style || "rounded"
      }));
    } else {
      builderState.slots = [
        { box: [36, 49, 1008, 541], media_name: "", corner_radius: 14, border_width: 3, shadow: true, zoom: 1.0, pan_x: 0, pan_y: 0, card_style: "rounded" },
        { box: [31, 640, 470, 665], media_name: "", corner_radius: 14, border_width: 3, shadow: true, zoom: 1.0, pan_x: 0, pan_y: 0, card_style: "rounded" },
        { box: [535, 640, 509, 665], media_name: "", corner_radius: 14, border_width: 3, shadow: true, zoom: 1.0, pan_x: 0, pan_y: 0, card_style: "rounded" }
      ];
    }

    builderSlideSubtitle.textContent = `Interactive drag, resize, in-card crop & stickers for Slide ${builderState.slideIndex}`;
    storyBuilderModal.classList.add("active");

    renderBuilderStage();
    loadBuilderMediaTray();
    loadBuilderStickersTray();
    selectSlot(0);
  }

  function renderBuilderStage() {
    builderStage.innerHTML = "";
    
    // Set background color
    const [r, g, b] = builderState.bg_color;
    builderStage.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

    // Stage click deselects
    builderStage.addEventListener("click", (e) => {
      if (e.target === builderStage) {
        selectSlot(null);
        selectSticker(null);
      }
    });

    // 1. Render Slots (Cards)
    builderState.slots.forEach((slot, sIdx) => {
      const [bx, by, bw, bh] = slot.box;
      const cardEl = document.createElement("div");
      const isSelected = builderState.selectedSlotIdx === sIdx;
      const isPanActive = isSelected && builderState.isPanningPhoto;

      cardEl.className = `builder-card ${isSelected ? "selected" : ""} ${isPanActive ? "pan-active" : ""} ${slot.card_style === "torn_paper" ? "style-torn" : ""}`;
      cardEl.dataset.slotIdx = sIdx;

      const sx = Math.round(bx / SCALE);
      const sy = Math.round(by / SCALE);
      const sw = Math.round(bw / SCALE);
      const sh = Math.round(bh / SCALE);

      cardEl.style.left = `${sx}px`;
      cardEl.style.top = `${sy}px`;
      cardEl.style.width = `${sw}px`;
      cardEl.style.height = `${sh}px`;
      cardEl.style.borderRadius = `${Math.round((slot.corner_radius || 14) / SCALE)}px`;

      if (slot.shadow !== false) {
        cardEl.style.boxShadow = "0 6px 18px rgba(0,0,0,0.45)";
      } else {
        cardEl.style.boxShadow = "none";
      }

      // Media element inside wrapper for GPU-accelerated smooth zoom & pan
      const zoom = slot.zoom || 1.0;
      const panX = slot.pan_x || 0.0;
      const panY = slot.pan_y || 0.0;
      const transformStyle = `scale(${zoom}) translate(${panX}%, ${panY}%)`;

      const isCardSelected = builderState.selectedSlotIdx === sIdx;
      const isCardPanActive = isCardSelected && builderState.isPanningPhoto;

      const toolbarHtml = `
        <div class="card-floating-toolbar">
          <button type="button" class="cft-btn ${!isCardPanActive ? 'active' : ''}" data-action="move" title="Drag to move card position on canvas">⤧ Move Card</button>
          <button type="button" class="cft-btn ${isCardPanActive ? 'active' : ''}" data-action="pan" title="Drag to pan photo inside card">🖐️ Pan Photo</button>
          <button type="button" class="cft-btn" data-action="reset" title="Reset image zoom & center">🎯 Reset</button>
        </div>
      `;

      if (slot.media_name) {
        const thumbUrl = `/api/thumbnail/${encodeURIComponent(slot.media_name)}`;
        cardEl.innerHTML = `
          ${toolbarHtml}
          <div class="builder-card-media-wrap">
            <img src="${thumbUrl}" alt="Card Media" style="transform: ${transformStyle};">
          </div>
          <div class="builder-handle" title="Drag to Resize"></div>
        `;
      } else {
        cardEl.innerHTML = `
          ${toolbarHtml}
          <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#888;font-size:12px;">Slot ${sIdx + 1}</div>
          <div class="builder-handle" title="Drag to Resize"></div>
        `;
      }

      // Wire Floating Toolbar Buttons
      const cftBtns = cardEl.querySelectorAll(".cft-btn");
      cftBtns.forEach(btn => {
        btn.addEventListener("pointerdown", (e) => e.stopPropagation());
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          if (action === "move") {
            togglePanMode(false);
          } else if (action === "pan") {
            togglePanMode(true);
          } else if (action === "reset") {
            builderState.slots[sIdx].zoom = 1.0;
            builderState.slots[sIdx].pan_x = 0;
            builderState.slots[sIdx].pan_y = 0;
            updatePhotoCropUI();
            const img = cardEl.querySelector(".builder-card-media-wrap img");
            if (img) img.style.transform = "scale(1) translate(0%, 0%)";
            showToast("Photo reset to center (1.0x)", "info");
          }
        });
      });

      // Mouse Wheel to Zoom directly on card
      cardEl.addEventListener("wheel", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectSlot(sIdx);
        const currentZoom = builderState.slots[sIdx].zoom || 1.0;
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        const newZoom = Math.max(1.0, Math.min(2.5, Math.round((currentZoom + delta) * 100) / 100));
        builderState.slots[sIdx].zoom = newZoom;
        updatePhotoCropUI();
        const img = cardEl.querySelector(".builder-card-media-wrap img");
        if (img) {
          const px = builderState.slots[sIdx].pan_x || 0;
          const py = builderState.slots[sIdx].pan_y || 0;
          img.style.transform = `scale(${newZoom}) translate(${px}%, ${py}%)`;
        }
      }, { passive: false });

      // Card Drag & Resize or In-Card Pan
      setupCardInteractions(cardEl, sIdx);

      cardEl.addEventListener("click", (e) => {
        e.stopPropagation();
        selectSlot(sIdx);
      });

      // Double-click toggles Photo Pan Mode directly
      cardEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        selectSlot(sIdx);
        togglePanMode(!builderState.isPanningPhoto);
      });

      builderStage.appendChild(cardEl);
    });

    // 2. Render Stickers (Image stickers, Emojis, Location pills, Captions)
    builderState.stickers.forEach((st, stIdx) => {
      const isSelected = builderState.selectedStickerIdx === stIdx;
      const stEl = document.createElement("div");

      if (st.type === "image_sticker") {
        stEl.className = `builder-sticker ${isSelected ? "selected" : ""}`;
        const stW = Math.round((st.w || 200) / SCALE);
        const stH = Math.round((st.h || 200) / SCALE);
        const stX = Math.round(st.x / SCALE);
        const stY = Math.round(st.y / SCALE);
        const rot = st.rotation || 0;

        stEl.style.left = `${stX}px`;
        stEl.style.top = `${stY}px`;
        stEl.style.width = `${stW}px`;
        stEl.style.height = `${stH}px`;
        stEl.style.transform = `rotate(${rot}deg)`;

        const stickerUrl = `/api/sticker/${encodeURIComponent(st.sticker_name)}`;
        stEl.innerHTML = `
          <img src="${stickerUrl}" alt="${st.sticker_name}">
          <div class="builder-handle" title="Drag to Resize"></div>
        `;

        setupStickerInteractions(stEl, stIdx);
      } else if (st.type === "emoji") {
        stEl.className = `builder-sticker ${isSelected ? "selected" : ""}`;
        const stW = Math.round((st.w || 160) / SCALE);
        const stH = Math.round((st.h || 160) / SCALE);
        const stX = Math.round(st.x / SCALE);
        const stY = Math.round(st.y / SCALE);
        const rot = st.rotation || 0;

        stEl.style.left = `${stX}px`;
        stEl.style.top = `${stY}px`;
        stEl.style.width = `${stW}px`;
        stEl.style.height = `${stH}px`;
        stEl.style.transform = `rotate(${rot}deg)`;

        stEl.innerHTML = `
          <div class="emoji-content">${st.emoji || "🐚"}</div>
          <div class="builder-handle" title="Drag to Resize"></div>
        `;

        setupStickerInteractions(stEl, stIdx);
      } else if (st.type === "location_pill") {
        stEl.className = `builder-pill ${isSelected ? "selected" : ""}`;
        stEl.textContent = st.text || "📍 Location";
        const stX = Math.round(st.x / SCALE);
        const stY = Math.round(st.y / SCALE);
        stEl.style.left = `${stX}px`;
        stEl.style.top = `${stY}px`;

        setupSimpleDrag(stEl, stIdx);
      } else {
        stEl.className = `builder-caption ${isSelected ? "selected" : ""}`;
        stEl.textContent = st.text || "Caption";
        const stX = Math.round(st.x / SCALE);
        const stY = Math.round(st.y / SCALE);
        stEl.style.left = `${stX}px`;
        stEl.style.top = `${stY}px`;

        setupSimpleDrag(stEl, stIdx);
      }

      stEl.addEventListener("click", (e) => {
        e.stopPropagation();
        selectSticker(stIdx);
      });

      builderStage.appendChild(stEl);
    });
  }

  // --------------------------------------------------------------------------
  // Card Drag, Resize & In-Card Photo Pan
  // --------------------------------------------------------------------------
  function setupCardInteractions(cardEl, slotIdx) {
    let isInteracting = false;
    let startX, startY;
    let origLeft, origTop;
    let origPanX, origPanY;

    cardEl.addEventListener("pointerdown", (e) => {
      if (e.target.classList.contains("builder-handle") || e.target.closest(".card-floating-toolbar")) return;

      const isCurrentSlot = builderState.selectedSlotIdx === slotIdx;
      const isPanMode = (isCurrentSlot && builderState.isPanningPhoto) || e.altKey || e.shiftKey;

      isInteracting = true;
      startX = e.clientX;
      startY = e.clientY;
      cardEl.setPointerCapture(e.pointerId);
      e.stopPropagation();

      if (isPanMode) {
        // Panning photo inside card
        cardEl.style.cursor = "grabbing";
        origPanX = builderState.slots[slotIdx].pan_x || 0;
        origPanY = builderState.slots[slotIdx].pan_y || 0;
      } else {
        // Dragging card position on canvas
        cardEl.style.cursor = "grabbing";
        selectSlot(slotIdx);
        origLeft = parseFloat(cardEl.style.left) || 0;
        origTop = parseFloat(cardEl.style.top) || 0;
      }
    });

    cardEl.addEventListener("pointermove", (e) => {
      if (!isInteracting) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const isCurrentSlot = builderState.selectedSlotIdx === slotIdx;
      const isPanMode = (isCurrentSlot && builderState.isPanningPhoto) || e.altKey || e.shiftKey;

      if (isPanMode) {
        // In-Card Photo Pan: Drag image smoothly inside frame
        const panSensitivity = 0.35;
        const newPanX = Math.max(-50, Math.min(50, origPanX + dx * panSensitivity));
        const newPanY = Math.max(-50, Math.min(50, origPanY + dy * panSensitivity));

        builderState.slots[slotIdx].pan_x = Math.round(newPanX * 10) / 10;
        builderState.slots[slotIdx].pan_y = Math.round(newPanY * 10) / 10;

        const img = cardEl.querySelector(".builder-card-media-wrap img");
        if (img) {
          const zoom = builderState.slots[slotIdx].zoom || 1.0;
          img.style.transform = `scale(${zoom}) translate(${newPanX}%, ${newPanY}%)`;
        }
        updatePhotoCropUI();
      } else {
        // Canvas Card Drag
        const newLeft = Math.max(0, Math.min(400 - cardEl.offsetWidth, origLeft + dx));
        const newTop = Math.max(0, Math.min(500 - cardEl.offsetHeight, origTop + dy));

        cardEl.style.left = `${newLeft}px`;
        cardEl.style.top = `${newTop}px`;

        builderState.slots[slotIdx].box[0] = Math.round(newLeft * SCALE);
        builderState.slots[slotIdx].box[1] = Math.round(newTop * SCALE);
        updateInspectorValues();
      }
    });

    cardEl.addEventListener("pointerup", (e) => {
      if (isInteracting) {
        isInteracting = false;
        try { cardEl.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    });

    // Resize handle setup
    const handle = cardEl.querySelector(".builder-handle");
    if (handle) {
      setupCardResize(handle, cardEl, slotIdx);
    }
  }

  function setupCardResize(handle, cardEl, slotIdx) {
    let isResizing = false;
    let startX, startY, origW, origH;

    handle.addEventListener("pointerdown", (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      origW = cardEl.offsetWidth;
      origH = cardEl.offsetHeight;
      handle.setPointerCapture(e.pointerId);
      selectSlot(slotIdx);
      e.stopPropagation();
    });

    handle.addEventListener("pointermove", (e) => {
      if (!isResizing) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newW = Math.max(30, Math.min(400 - cardEl.offsetLeft, origW + dx));
      const newH = Math.max(30, Math.min(500 - cardEl.offsetTop, origH + dy));

      cardEl.style.width = `${newW}px`;
      cardEl.style.height = `${newH}px`;

      builderState.slots[slotIdx].box[2] = Math.round(newW * SCALE);
      builderState.slots[slotIdx].box[3] = Math.round(newH * SCALE);
      updateInspectorValues();
    });

    handle.addEventListener("pointerup", (e) => {
      if (isResizing) {
        isResizing = false;
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    });
  }

  // --------------------------------------------------------------------------
  // Sticker Drag & Resize
  // --------------------------------------------------------------------------
  function setupStickerInteractions(stEl, stIdx) {
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    stEl.addEventListener("pointerdown", (e) => {
      if (e.target.classList.contains("builder-handle")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseFloat(stEl.style.left) || 0;
      origTop = parseFloat(stEl.style.top) || 0;
      stEl.setPointerCapture(e.pointerId);
      selectSticker(stIdx);
      e.stopPropagation();
    });

    stEl.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newLeft = Math.max(-20, Math.min(400 - 10, origLeft + dx));
      const newTop = Math.max(-20, Math.min(500 - 10, origTop + dy));

      stEl.style.left = `${newLeft}px`;
      stEl.style.top = `${newTop}px`;

      builderState.stickers[stIdx].x = Math.round(newLeft * SCALE);
      builderState.stickers[stIdx].y = Math.round(newTop * SCALE);
    });

    stEl.addEventListener("pointerup", (e) => {
      if (isDragging) {
        isDragging = false;
        try { stEl.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    });

    // Resize handle on sticker
    const handle = stEl.querySelector(".builder-handle");
    if (handle) {
      let isResizing = false;
      let startRX, startRY, origW, origH;

      handle.addEventListener("pointerdown", (e) => {
        isResizing = true;
        startRX = e.clientX;
        startRY = e.clientY;
        origW = stEl.offsetWidth;
        origH = stEl.offsetHeight;
        handle.setPointerCapture(e.pointerId);
        selectSticker(stIdx);
        e.stopPropagation();
      });

      handle.addEventListener("pointermove", (e) => {
        if (!isResizing) return;
        const delta = Math.max(e.clientX - startRX, e.clientY - startRY);
        const newSize = Math.max(20, Math.min(220, origW + delta));

        stEl.style.width = `${newSize}px`;
        stEl.style.height = `${newSize}px`;

        builderState.stickers[stIdx].w = Math.round(newSize * SCALE);
        builderState.stickers[stIdx].h = Math.round(newSize * SCALE);
        if (stickerSizeInput) {
          stickerSizeInput.value = builderState.stickers[stIdx].w;
          stickerSizeVal.textContent = `${builderState.stickers[stIdx].w}px`;
        }
      });

      handle.addEventListener("pointerup", (e) => {
        if (isResizing) {
          isResizing = false;
          try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      });
    }
  }

  function setupSimpleDrag(el, stIdx) {
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    el.addEventListener("pointerdown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseFloat(el.style.left) || 0;
      origTop = parseFloat(el.style.top) || 0;
      el.setPointerCapture(e.pointerId);
      selectSticker(stIdx);
      e.stopPropagation();
    });

    el.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newLeft = Math.max(0, Math.min(400 - el.offsetWidth, origLeft + dx));
      const newTop = Math.max(0, Math.min(500 - el.offsetHeight, origTop + dy));

      el.style.left = `${newLeft}px`;
      el.style.top = `${newTop}px`;

      builderState.stickers[stIdx].x = Math.round(newLeft * SCALE);
      builderState.stickers[stIdx].y = Math.round(newTop * SCALE);
    });

    el.addEventListener("pointerup", (e) => {
      if (isDragging) {
        isDragging = false;
        try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    });
  }

  // --------------------------------------------------------------------------
  // Selection Handling: Slots vs Stickers
  // --------------------------------------------------------------------------
  function selectSlot(idx) {
    builderState.selectedSlotIdx = idx;
    builderState.selectedStickerIdx = null;

    document.querySelectorAll(".builder-card").forEach((c, i) => {
      if (i === idx) c.classList.add("selected");
      else {
        c.classList.remove("selected");
        c.classList.remove("pan-active");
      }
    });
    document.querySelectorAll(".builder-sticker, .builder-pill, .builder-caption").forEach(s => s.classList.remove("selected"));

    if (stickerInspector) stickerInspector.style.display = "none";

    if (idx !== null && builderState.slots[idx]) {
      cardInspectorEmpty.style.display = "none";
      cardInspectorContent.style.display = "block";
      updateInspectorValues();
    } else {
      cardInspectorEmpty.style.display = "block";
      cardInspectorContent.style.display = "none";
      exitPanMode();
    }
  }

  function selectSticker(idx) {
    builderState.selectedStickerIdx = idx;
    builderState.selectedSlotIdx = null;
    exitPanMode();

    document.querySelectorAll(".builder-card").forEach(c => c.classList.remove("selected", "pan-active"));
    document.querySelectorAll(".builder-sticker, .builder-pill, .builder-caption").forEach((s, i) => {
      if (i === idx) s.classList.add("selected");
      else s.classList.remove("selected");
    });

    cardInspectorEmpty.style.display = "block";
    cardInspectorContent.style.display = "none";

    if (idx !== null && builderState.stickers[idx]) {
      const st = builderState.stickers[idx];
      if (stickerInspector) {
        stickerInspector.style.display = "block";
        selectedStickerTitle.textContent = st.title || (st.type === "emoji" ? `Emoji (${st.emoji})` : "Sticker");
        const w = st.w || 180;
        stickerSizeInput.value = w;
        stickerSizeVal.textContent = `${w}px`;
        const rot = st.rotation || 0;
        stickerRotInput.value = rot;
        stickerRotVal.textContent = `${rot}°`;
      }
    } else {
      if (stickerInspector) stickerInspector.style.display = "none";
    }
  }

  function togglePanMode(forceState = null) {
    if (builderState.selectedSlotIdx === null) return;
    const newState = forceState !== null ? forceState : !builderState.isPanningPhoto;
    builderState.isPanningPhoto = newState;

    const selectedCard = builderStage.querySelector(`.builder-card[data-slot-idx="${builderState.selectedSlotIdx}"]`);
    if (btnTogglePanMode) {
      if (newState) {
        btnTogglePanMode.classList.add("active");
        btnTogglePanMode.innerHTML = `<span>🖐️ Panning Active (Click to Exit)</span>`;
        if (panModeHint) panModeHint.style.display = "block";
        if (selectedCard) selectedCard.classList.add("pan-active");
        showToast("Hold & drag mouse directly on photo to pan frame", "info", 3000);
      } else {
        btnTogglePanMode.classList.remove("active");
        btnTogglePanMode.innerHTML = `<span>🖐️ Direct Mouse Pan inside Card</span>`;
        if (panModeHint) panModeHint.style.display = "none";
        if (selectedCard) selectedCard.classList.remove("pan-active");
      }
    }
  }

  function exitPanMode() {
    if (builderState.isPanningPhoto) {
      togglePanMode(false);
    }
  }

  function updateInspectorValues() {
    const idx = builderState.selectedSlotIdx;
    if (idx === null || !builderState.slots[idx]) return;
    const slot = builderState.slots[idx];
    const [x, y, w, h] = slot.box;
    valX.textContent = x;
    valY.textContent = y;
    valW.textContent = w;
    valH.textContent = h;

    const r = slot.corner_radius || 14;
    radiusInput.value = r;
    radiusVal.textContent = `${r}px`;
    shadowToggle.checked = slot.shadow !== false;

    // Card style buttons
    cardStyleBtns.forEach(btn => {
      if (btn.dataset.style === (slot.card_style || "rounded")) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    updatePhotoCropUI();
  }

  function updatePhotoCropUI() {
    const idx = builderState.selectedSlotIdx;
    if (idx === null || !builderState.slots[idx]) return;
    const slot = builderState.slots[idx];

    const zoom = slot.zoom !== undefined ? slot.zoom : 1.0;
    const panX = slot.pan_x !== undefined ? slot.pan_x : 0;
    const panY = slot.pan_y !== undefined ? slot.pan_y : 0;

    if (zoomInput) {
      zoomInput.value = zoom;
      zoomVal.textContent = `${zoom.toFixed(2)}x`;
    }
    if (panXInput) {
      panXInput.value = panX;
      panXVal.textContent = `${panX > 0 ? "+" : ""}${panX}%`;
    }
    if (panYInput) {
      panYInput.value = panY;
      panYVal.textContent = `${panY > 0 ? "+" : ""}${panY}%`;
    }
  }

  // --------------------------------------------------------------------------
  // Event Listeners for Inspectors & Controls
  // --------------------------------------------------------------------------

  // Zoom slider
  if (zoomInput) {
    zoomInput.addEventListener("input", () => {
      const idx = builderState.selectedSlotIdx;
      if (idx === null || !builderState.slots[idx]) return;
      const z = parseFloat(zoomInput.value);
      builderState.slots[idx].zoom = z;
      zoomVal.textContent = `${z.toFixed(2)}x`;

      const cardEl = builderStage.querySelector(`.builder-card[data-slot-idx="${idx}"] img`);
      if (cardEl) {
        const panX = builderState.slots[idx].pan_x || 0;
        const panY = builderState.slots[idx].pan_y || 0;
        cardEl.style.transform = `scale(${z}) translate(${panX}%, ${panY}%)`;
      }
    });
  }

  // Pan X slider
  if (panXInput) {
    panXInput.addEventListener("input", () => {
      const idx = builderState.selectedSlotIdx;
      if (idx === null || !builderState.slots[idx]) return;
      const px = parseInt(panXInput.value, 10);
      builderState.slots[idx].pan_x = px;
      panXVal.textContent = `${px > 0 ? "+" : ""}${px}%`;

      const cardEl = builderStage.querySelector(`.builder-card[data-slot-idx="${idx}"] img`);
      if (cardEl) {
        const z = builderState.slots[idx].zoom || 1.0;
        const py = builderState.slots[idx].pan_y || 0;
        cardEl.style.transform = `scale(${z}) translate(${px}%, ${py}%)`;
      }
    });
  }

  // Pan Y slider
  if (panYInput) {
    panYInput.addEventListener("input", () => {
      const idx = builderState.selectedSlotIdx;
      if (idx === null || !builderState.slots[idx]) return;
      const py = parseInt(panYInput.value, 10);
      builderState.slots[idx].pan_y = py;
      panYVal.textContent = `${py > 0 ? "+" : ""}${py}%`;

      const cardEl = builderStage.querySelector(`.builder-card[data-slot-idx="${idx}"] img`);
      if (cardEl) {
        const z = builderState.slots[idx].zoom || 1.0;
        const px = builderState.slots[idx].pan_x || 0;
        cardEl.style.transform = `scale(${z}) translate(${px}%, ${py}%)`;
      }
    });
  }

  // Reset Photo Alignment
  if (btnResetCrop) {
    btnResetCrop.addEventListener("click", () => {
      const idx = builderState.selectedSlotIdx;
      if (idx === null || !builderState.slots[idx]) return;
      builderState.slots[idx].zoom = 1.0;
      builderState.slots[idx].pan_x = 0;
      builderState.slots[idx].pan_y = 0;
      updatePhotoCropUI();

      const cardEl = builderStage.querySelector(`.builder-card[data-slot-idx="${idx}"] img`);
      if (cardEl) {
        cardEl.style.transform = "scale(1) translate(0%, 0%)";
      }
      showToast("Photo reset to center (1.0x)", "info");
    });
  }

  // Pan Mode button
  if (btnTogglePanMode) {
    btnTogglePanMode.addEventListener("click", () => {
      togglePanMode();
    });
  }

  // Card Border Style buttons (Clean Rounded vs Torn Paper Scrapbook)
  cardStyleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = builderState.selectedSlotIdx;
      if (idx === null || !builderState.slots[idx]) return;
      const style = btn.dataset.style;
      builderState.slots[idx].card_style = style;
      cardStyleBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const cardEl = builderStage.querySelector(`.builder-card[data-slot-idx="${idx}"]`);
      if (cardEl) {
        if (style === "torn_paper") cardEl.classList.add("style-torn");
        else cardEl.classList.remove("style-torn");
      }
    });
  });

  // Card Nudge buttons
  nudgeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = builderState.selectedSlotIdx;
      if (idx === null || !builderState.slots[idx]) return;
      const dir = btn.dataset.dir;
      const delta = 20; // 20px in 1080x1350 scale
      if (dir === "up") builderState.slots[idx].box[1] = Math.max(0, builderState.slots[idx].box[1] - delta);
      if (dir === "down") builderState.slots[idx].box[1] = Math.min(1350 - builderState.slots[idx].box[3], builderState.slots[idx].box[1] + delta);
      if (dir === "left") builderState.slots[idx].box[0] = Math.max(0, builderState.slots[idx].box[0] - delta);
      if (dir === "right") builderState.slots[idx].box[0] = Math.min(1080 - builderState.slots[idx].box[2], builderState.slots[idx].box[0] + delta);

      renderBuilderStage();
      selectSlot(idx);
    });
  });

  // Corner radius slider
  if (radiusInput) {
    radiusInput.addEventListener("input", () => {
      const idx = builderState.selectedSlotIdx;
      if (idx === null || !builderState.slots[idx]) return;
      const r = parseInt(radiusInput.value, 10);
      builderState.slots[idx].corner_radius = r;
      radiusVal.textContent = `${r}px`;

      const cardEl = builderStage.querySelector(`.builder-card[data-slot-idx="${idx}"]`);
      if (cardEl) {
        cardEl.style.borderRadius = `${Math.round(r / SCALE)}px`;
      }
    });
  }

  // Shadow toggle
  if (shadowToggle) {
    shadowToggle.addEventListener("change", () => {
      const idx = builderState.selectedSlotIdx;
      if (idx === null || !builderState.slots[idx]) return;
      builderState.slots[idx].shadow = shadowToggle.checked;
      renderBuilderStage();
      selectSlot(idx);
    });
  }

  // Delete Card button
  if (deleteCardBtn) {
    deleteCardBtn.addEventListener("click", () => {
      const idx = builderState.selectedSlotIdx;
      if (idx === null || !builderState.slots[idx]) return;
      builderState.slots.splice(idx, 1);
      renderBuilderStage();
      selectSlot(builderState.slots.length > 0 ? 0 : null);
    });
  }

  // Add Card button
  if (builderAddCardBtn) {
    builderAddCardBtn.addEventListener("click", () => {
      builderState.slots.push({
        box: [100, 200, 880, 800],
        media_name: "",
        corner_radius: 14,
        border_width: 3,
        shadow: true,
        zoom: 1.0,
        pan_x: 0,
        pan_y: 0,
        card_style: "rounded"
      });
      renderBuilderStage();
      selectSlot(builderState.slots.length - 1);
    });
  }

  // Sticker Inspector size slider
  if (stickerSizeInput) {
    stickerSizeInput.addEventListener("input", () => {
      const sIdx = builderState.selectedStickerIdx;
      if (sIdx === null || !builderState.stickers[sIdx]) return;
      const sz = parseInt(stickerSizeInput.value, 10);
      builderState.stickers[sIdx].w = sz;
      builderState.stickers[sIdx].h = sz;
      stickerSizeVal.textContent = `${sz}px`;

      const stEl = builderStage.querySelector(`.builder-sticker[data-st-idx="${sIdx}"]`);
      if (stEl) {
        const scaledSz = Math.round(sz / SCALE);
        stEl.style.width = `${scaledSz}px`;
        stEl.style.height = `${scaledSz}px`;
      }
    });
  }

  // Sticker Rotation slider
  if (stickerRotInput) {
    stickerRotInput.addEventListener("input", () => {
      const sIdx = builderState.selectedStickerIdx;
      if (sIdx === null || !builderState.stickers[sIdx]) return;
      const rot = parseInt(stickerRotInput.value, 10);
      builderState.stickers[sIdx].rotation = rot;
      stickerRotVal.textContent = `${rot}°`;

      const stEl = builderStage.querySelector(`.builder-sticker[data-st-idx="${sIdx}"]`);
      if (stEl) {
        stEl.style.transform = `rotate(${rot}deg)`;
      }
    });
  }

  // Sticker Nudge buttons
  nudgeStickerBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const sIdx = builderState.selectedStickerIdx;
      if (sIdx === null || !builderState.stickers[sIdx]) return;
      const dir = btn.dataset.dir;
      const delta = 25;
      if (dir === "up") builderState.stickers[sIdx].y = Math.max(0, builderState.stickers[sIdx].y - delta);
      if (dir === "down") builderState.stickers[sIdx].y = Math.min(1350, builderState.stickers[sIdx].y + delta);
      if (dir === "left") builderState.stickers[sIdx].x = Math.max(0, builderState.stickers[sIdx].x - delta);
      if (dir === "right") builderState.stickers[sIdx].x = Math.min(1080, builderState.stickers[sIdx].x + delta);

      renderBuilderStage();
      selectSticker(sIdx);
    });
  });

  // Delete Sticker button
  if (deleteStickerBtn) {
    deleteStickerBtn.addEventListener("click", () => {
      const sIdx = builderState.selectedStickerIdx;
      if (sIdx === null || !builderState.stickers[sIdx]) return;
      builderState.stickers.splice(sIdx, 1);
      renderBuilderStage();
      selectSticker(null);
      showToast("Sticker removed", "info");
    });
  }

  // Add Location Pill button
  if (builderAddPillBtn) {
    builderAddPillBtn.addEventListener("click", () => {
      const text = prompt("Enter location tag (e.g., '📍 Goa, India'):", "📍 Goa, India");
      if (text) {
        builderState.stickers.push({
          type: "location_pill",
          text: text.trim(),
          x: 350,
          y: 600
        });
        renderBuilderStage();
        selectSticker(builderState.stickers.length - 1);
      }
    });
  }

  // Add Caption Text button
  if (builderAddCaptionBtn) {
    builderAddCaptionBtn.addEventListener("click", () => {
      const text = prompt("Enter text caption:", "Golden Hour");
      if (text) {
        builderState.stickers.push({
          type: "caption",
          text: text.trim(),
          x: 300,
          y: 200,
          font_size: 38,
          color: [255, 255, 255]
        });
        renderBuilderStage();
        selectSticker(builderState.stickers.length - 1);
      }
    });
  }

  // Reset button
  if (builderResetBtn) {
    builderResetBtn.addEventListener("click", () => {
      openStoryBuilder();
      showToast("Reset to engine layout", "info");
    });
  }

  // Quick Emoji Click Listener
  quickEmojis.forEach(em => {
    em.addEventListener("click", () => {
      const emojiChar = em.dataset.emoji || "🐚";
      builderState.stickers.push({
        type: "emoji",
        emoji: emojiChar,
        title: `Emoji ${emojiChar}`,
        x: 420,
        y: 500,
        w: 160,
        h: 160,
        rotation: 0
      });
      renderBuilderStage();
      selectSticker(builderState.stickers.length - 1);
      showToast(`Added ${emojiChar} to canvas!`, "success");
    });
  });

  // Custom Emoji Prompt
  if (btnCustomEmoji) {
    btnCustomEmoji.addEventListener("click", () => {
      const custom = prompt("Enter any emoji (e.g. 🐚, 🌊, 🌴, 🌺, ☀️, 🥥, 📸, ✨):", "🌊");
      if (custom && custom.trim()) {
        builderState.stickers.push({
          type: "emoji",
          emoji: custom.trim(),
          title: `Emoji ${custom.trim()}`,
          x: 420,
          y: 500,
          w: 160,
          h: 160,
          rotation: 0
        });
        renderBuilderStage();
        selectSticker(builderState.stickers.length - 1);
      }
    });
  }

  // Add Sticker button in header
  if (builderAddStickerBtn) {
    builderAddStickerBtn.addEventListener("click", () => {
      if (builderStickersTray) {
        builderStickersTray.scrollIntoView({ behavior: "smooth" });
        showToast("Select any cutout sticker from the library below", "info");
      }
    });
  }

  // Load Sticker Library from /api/stickers or /api/stickers/search
  async function loadBuilderStickersTray(query = "", category = "all") {
    if (!builderStickersTray) return;
    try {
      const url = query || (category && category !== "all") 
        ? `/api/stickers/search?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`
        : "/api/stickers";
        
      const res = await fetch(url);
      const data = await res.json();
      builderStickersTray.innerHTML = "";

      const list = data.results || data.stickers || [];
      if (list.length === 0) {
        builderStickersTray.innerHTML = `<div style="grid-column: 1/-1; font-size: 11px; color: var(--text-faint); padding: 8px 0;">No matching stickers found.</div>`;
        return;
      }

      list.forEach(st => {
        const thumb = document.createElement("div");
        thumb.className = "builder-sticker-thumb";
        thumb.title = `Click to add ${st.title}`;
        thumb.innerHTML = `<img src="${st.url}" alt="${st.title}">`;

        thumb.addEventListener("click", () => {
          // Add sticker onto canvas center
          builderState.stickers.push({
            type: "image_sticker",
            sticker_name: st.name,
            title: st.title,
            x: 380,
            y: 480,
            w: 200,
            h: 200,
            rotation: 0
          });
          renderBuilderStage();
          selectSticker(builderState.stickers.length - 1);
          showToast(`Added ${st.title} sticker to slide!`, "success");
        });

        builderStickersTray.appendChild(thumb);
      });
    } catch (err) {
      console.error("Error loading stickers tray:", err);
    }
  }

  // Sticker Search Input listener (debounced)
  if (stickerSearchInput) {
    stickerSearchInput.addEventListener("input", () => {
      clearTimeout(stickerSearchDebounce);
      stickerSearchDebounce = setTimeout(() => {
        loadBuilderStickersTray(stickerSearchInput.value.trim(), currentStickerCategory);
      }, 250);
    });
  }

  // Sticker Category buttons
  stickerCategoryBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      stickerCategoryBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentStickerCategory = btn.dataset.cat || "all";
      loadBuilderStickersTray(stickerSearchInput ? stickerSearchInput.value.trim() : "", currentStickerCategory);
    });
  });

  // Upload Custom Sticker (PNG)
  if (btnUploadSticker && stickerFileInput) {
    btnUploadSticker.addEventListener("click", () => {
      stickerFileInput.click();
    });

    stickerFileInput.addEventListener("change", async () => {
      const file = stickerFileInput.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("sticker", file);

      try {
        showToast("Uploading custom sticker...", "info");
        const res = await fetch("/api/stickers/upload", {
          method: "POST",
          body: formData
        });
        const data = await res.json();
        if (data.success && data.sticker) {
          showToast(`Uploaded ${data.sticker.title}!`, "success");
          if (stickerSearchInput) stickerSearchInput.value = "";
          currentStickerCategory = "all";
          stickerCategoryBtns.forEach(b => b.classList.toggle("active", b.dataset.cat === "all"));
          await loadBuilderStickersTray();
          
          // Automatically add to canvas
          builderState.stickers.push({
            type: "image_sticker",
            sticker_name: data.sticker.name,
            title: data.sticker.title,
            x: 360,
            y: 450,
            w: 220,
            h: 220,
            rotation: 0
          });
          renderBuilderStage();
          selectSticker(builderState.stickers.length - 1);
        } else {
          showToast(data.error || "Upload failed", "error");
        }
      } catch (err) {
        showToast(`Upload error: ${err.message}`, "error");
      } finally {
        stickerFileInput.value = "";
      }
    });
  }

  // Load Media Tray for Swapping
  async function loadBuilderMediaTray() {
    try {
      const res = await fetch("/api/media");
      const data = await res.json();
      builderMediaTray.innerHTML = "";

      if (!data.files || data.files.length === 0) {
        builderMediaTray.innerHTML = `<div style="grid-column: 1/-1; font-size: 11px; color: var(--text-faint);">No input media available.</div>`;
        return;
      }

      data.files.forEach(file => {
        const thumb = document.createElement("div");
        thumb.className = "builder-media-thumb";
        thumb.innerHTML = `<img src="${file.thumb_url}" alt="${file.name}" title="${file.name}">`;

        thumb.addEventListener("click", () => {
          const idx = builderState.selectedSlotIdx;
          if (idx === null || !builderState.slots[idx]) {
            showToast("Select a card on the canvas first!", "info");
            return;
          }

          builderState.slots[idx].media_name = file.name;
          showToast(`Assigned "${file.name}" to Slot ${idx + 1}`, "success");
          renderBuilderStage();
          selectSlot(idx);
        });

        builderMediaTray.appendChild(thumb);
      });
    } catch (err) {
      console.error(err);
    }
  }

  // Save & Re-render button
  if (builderSaveBtn) {
    builderSaveBtn.addEventListener("click", async () => {
      if (!jobData) return;
      exitPanMode();
      builderSaveBtn.disabled = true;
      builderSaveBtn.innerHTML = `<span>⏳ Re-rendering...</span>`;
      showToast(`Rendering custom 1080x1350 Slide ${builderState.slideIndex}...`, "info", 6000);

      try {
        const payload = {
          job_id: jobData.id,
          slide_index: builderState.slideIndex,
          slots: builderState.slots,
          stickers: builderState.stickers,
          bg_color: builderState.bg_color,
          is_full_bleed: builderState.is_full_bleed
        };

        const res = await fetch("/api/custom_slide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Custom render failed");
        }

        // Cache-buster update for active slide image and video
        const cacheBuster = `?t=${Date.now()}`;
        const activeIdx = builderState.slideIndex - 1;
        if (jobData.result?.slides && jobData.result.slides[activeIdx]) {
          jobData.result.slides[activeIdx].slots = builderState.slots;
          jobData.result.slides[activeIdx].stickers = builderState.stickers;
        }

        showSlide(activeIdx);
        if (activeSlideImg) activeSlideImg.src = `/api/output/${jobData.id}/${data.slide.jpg}${cacheBuster}`;
        if (reelVideoPlayer) reelVideoPlayer.src = `/api/output/${jobData.id}/full_carousel_reel.mp4${cacheBuster}`;

        showToast(`Slide ${builderState.slideIndex} & Reel re-rendered successfully!`, "success");
        storyBuilderModal.classList.remove("active");
      } catch (err) {
        console.error(err);
        showToast(`Error: ${err.message}`, "error");
      } finally {
        builderSaveBtn.disabled = false;
        builderSaveBtn.innerHTML = `<span>💾 Save & Re-render</span>`;
      }
    });
  }

  async function checkLatestJob() {
    try {
      const res = await fetch("/api/latest_job");
      const data = await res.json();
      if (data.job) {
        if (data.job.url) postUrlInput.value = data.job.url;
        renderResults(data.job);
      }
    } catch (e) {
      console.log("No previous job cached:", e);
    }
  }

  // Initial load
  loadMediaTray();
  checkLatestJob();
});

