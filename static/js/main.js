// ==========================================================================
// InstaClone Studio Master Application Bootstrap
// ==========================================================================

import { store } from "./state/store.js";
import { startClone, pollJobStatus, fetchLatestJob } from "./api/client.js";
import { DropZone } from "./components/media/DropZone.js";
import { MediaGrid } from "./components/media/MediaGrid.js";
import { ProgressStepper } from "./components/output/ProgressStepper.js";
import { Showcase } from "./components/output/Showcase.js";
import { Stage } from "./components/story_builder/Stage.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Toast Notification Helper
  const toastContainer = document.getElementById("toastContainer");
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

  // 2. URL Input & Presets
  const postUrlInput = document.getElementById("postUrlInput");
  const pasteBtn = document.getElementById("pasteBtn");
  const presetChips = document.querySelectorAll(".chip");

  if (pasteBtn && postUrlInput) {
    pasteBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          postUrlInput.value = text.trim();
          showToast("Pasted URL from clipboard", "info");
        }
      } catch (err) {
        showToast("Clipboard access denied. Please paste manually.", "error");
      }
    });
  }

  presetChips.forEach(chip => {
    chip.addEventListener("click", () => {
      const url = chip.dataset.url;
      if (url && postUrlInput) {
        postUrlInput.value = url;
        showToast(`Loaded preset: ${chip.textContent.trim()}`, "info");
      }
    });
  });

  // 3. Components Initialization
  const dropZoneEl = document.getElementById("dropZone");
  const fileInputEl = document.getElementById("fileInput");
  const browseBtnEl = document.getElementById("browseBtn");
  const mediaGridEl = document.getElementById("mediaGrid");
  const mediaBadgeEl = document.getElementById("mediaCountBadge");
  const deleteModalEl = document.getElementById("deleteModal");

  let currentMediaList = [];

  const mediaGrid = new MediaGrid(mediaGridEl, mediaBadgeEl, deleteModalEl, {
    showToast,
    onMediaListChanged: (files) => {
      currentMediaList = files;
      store.setState({ mediaFiles: files });
    }
  });

  const dropZone = new DropZone(dropZoneEl, fileInputEl, browseBtnEl, {
    showToast,
    onUploadSuccess: () => mediaGrid.refresh()
  });

  const progressStepper = new ProgressStepper(
    document.getElementById("progressContainer"),
    document.getElementById("progressBar"),
    document.getElementById("progressMessage"),
    [
      document.getElementById("step1"),
      document.getElementById("step2"),
      document.getElementById("step3"),
      document.getElementById("step4"),
      document.getElementById("step5")
    ]
  );

  const stageEl = document.getElementById("builderStage");
  const builderModalEl = document.getElementById("storyBuilderModal");

  const storyBuilderStage = new Stage(stageEl, builderModalEl, {
    showToast,
    onSlideSaved: (slideIndex, updatedSlide) => {
      showcase.updateSlideResult(slideIndex, updatedSlide);
    }
  });

  const showcase = new Showcase({
    onOpenBuilder: (jobId, slideIndex, slideMeta) => {
      storyBuilderStage.open(jobId, slideIndex, slideMeta, currentMediaList);
    }
  });

  // 4. Autonomous Cloning Runner
  const cloneBtn = document.getElementById("cloneBtn");
  let pollInterval = null;

  async function handleClone() {
    const url = postUrlInput ? postUrlInput.value.trim() : "";
    if (!url) {
      showToast("Please enter an Instagram post URL", "error");
      return;
    }

    if (cloneBtn) {
      cloneBtn.disabled = true;
      cloneBtn.innerHTML = "<span>⏳</span><span>Cloning in Progress...</span>";
    }

    progressStepper.show();
    progressStepper.update(5, "Contacting Instagram API & initializing...");

    try {
      const res = await startClone(url);
      if (res.success && res.job_id) {
        startPolling(res.job_id);
      }
    } catch (err) {
      showToast(`Clone error: ${err.message}`, "error");
      progressStepper.hide();
      if (cloneBtn) {
        cloneBtn.disabled = false;
        cloneBtn.innerHTML = "<span>🚀</span><span>Clone & Generate Post</span>";
      }
    }
  }

  function startPolling(jobId) {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      try {
        const job = await pollJobStatus(jobId);
        progressStepper.update(job.percent, job.message);

        if (job.status === "completed") {
          clearInterval(pollInterval);
          progressStepper.hide();
          showToast("Instagram carousel cloning completed!", "success");
          if (cloneBtn) {
            cloneBtn.disabled = false;
            cloneBtn.innerHTML = "<span>🚀</span><span>Clone & Generate Post</span>";
          }
          showcase.renderJob(job);
        } else if (job.status === "error") {
          clearInterval(pollInterval);
          progressStepper.hide();
          showToast(`Pipeline failed: ${job.message}`, "error");
          if (cloneBtn) {
            cloneBtn.disabled = false;
            cloneBtn.innerHTML = "<span>🚀</span><span>Clone & Generate Post</span>";
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1500);
  }

  if (cloneBtn) {
    cloneBtn.addEventListener("click", handleClone);
  }

  // 5. Initial Data Load
  await mediaGrid.refresh();

  try {
    const latest = await fetchLatestJob();
    if (latest && latest.job) {
      showcase.renderJob(latest.job);
    }
  } catch (err) {
    console.error("Error checking latest job:", err);
  }
});
