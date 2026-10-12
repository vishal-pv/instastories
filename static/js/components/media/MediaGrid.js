// ==========================================================================
// Media Grid & File Deletion Manager
// ==========================================================================

import { fetchMedia, deleteMedia } from "../../api/client.js";

export class MediaGrid {
  constructor(gridEl, badgeEl, modalEl, options = {}) {
    this.gridEl = gridEl;
    this.badgeEl = badgeEl;
    this.modalEl = modalEl;
    this.options = options; // { showToast, onMediaListChanged }

    this.pendingDeleteFile = null;
    this.bindModalEvents();
  }

  bindModalEvents() {
    this.cancelBtn = document.getElementById("cancelDeleteBtn");
    this.confirmBtn = document.getElementById("confirmDeleteBtn");
    this.modalText = document.getElementById("deleteModalText");

    if (this.cancelBtn) {
      this.cancelBtn.addEventListener("click", () => this.closeDeleteModal());
    }

    if (this.modalEl) {
      this.modalEl.addEventListener("click", (e) => {
        if (e.target === this.modalEl) this.closeDeleteModal();
      });
    }

    if (this.confirmBtn) {
      this.confirmBtn.addEventListener("click", async () => {
        if (!this.pendingDeleteFile) return;
        const fileToDelete = this.pendingDeleteFile;
        this.closeDeleteModal();

        try {
          const res = await deleteMedia(fileToDelete);
          if (res.success) {
            if (this.options.showToast) {
              this.options.showToast(`Deleted ${fileToDelete}`, "info");
            }
            this.refresh();
          }
        } catch (err) {
          if (this.options.showToast) {
            this.options.showToast(`Failed to delete: ${err.message}`, "error");
          }
        }
      });
    }
  }

  openDeleteModal(filename) {
    this.pendingDeleteFile = filename;
    if (this.modalText) {
      this.modalText.innerHTML = `Are you sure you want to remove <strong>${filename}</strong> from your media inputs?`;
    }
    if (this.modalEl) {
      this.modalEl.classList.add("active");
    }
  }

  closeDeleteModal() {
    this.pendingDeleteFile = null;
    if (this.modalEl) {
      this.modalEl.classList.remove("active");
    }
  }

  async refresh() {
    if (!this.gridEl) return [];
    try {
      const data = await fetchMedia();
      const files = data.files || [];

      if (this.badgeEl) {
        this.badgeEl.textContent = `${files.length} Files`;
      }

      this.gridEl.innerHTML = "";
      files.forEach(f => {
        const item = document.createElement("div");
        item.className = "media-item";

        if (f.type === "video") {
          item.innerHTML = `
            <div class="media-video-placeholder">
              <span>🎬</span>
              <span>${f.name}</span>
            </div>
            <span class="media-badge-type">VIDEO</span>
            <button class="media-delete-btn" title="Delete ${f.name}">✕</button>
          `;
        } else {
          item.innerHTML = `
            <img src="${f.thumb_url}" alt="${f.name}" loading="lazy">
            <span class="media-badge-type">${f.type}</span>
            <button class="media-delete-btn" title="Delete ${f.name}">✕</button>
          `;
        }

        const delBtn = item.querySelector(".media-delete-btn");
        if (delBtn) {
          delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.openDeleteModal(f.name);
          });
        }

        this.gridEl.appendChild(item);
      });

      if (this.options.onMediaListChanged) {
        this.options.onMediaListChanged(files);
      }
      return files;
    } catch (err) {
      console.error("Failed to load media grid:", err);
      return [];
    }
  }
}
