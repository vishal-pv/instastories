// ==========================================================================
// Media File Drag & Drop and Upload Component
// ==========================================================================

import { uploadMedia } from "../../api/client.js";

export class DropZone {
  constructor(dropZoneEl, fileInputEl, browseBtnEl, options = {}) {
    this.dropZoneEl = dropZoneEl;
    this.fileInputEl = fileInputEl;
    this.browseBtnEl = browseBtnEl;
    this.options = options; // { onUploadSuccess, showToast }

    this.bindEvents();
  }

  bindEvents() {
    if (!this.dropZoneEl || !this.fileInputEl) return;

    // Dragover & dragleave styling
    this.dropZoneEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZoneEl.classList.add("dragover");
    });

    this.dropZoneEl.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZoneEl.classList.remove("dragover");
    });

    this.dropZoneEl.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropZoneEl.classList.remove("dragover");
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        this.handleFiles(files);
      }
    });

    // Browse button triggers file input safely
    if (this.browseBtnEl) {
      this.browseBtnEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.fileInputEl.click();
      });
    }

    this.dropZoneEl.addEventListener("click", (e) => {
      if (e.target !== this.browseBtnEl) {
        this.fileInputEl.click();
      }
    });

    this.fileInputEl.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.handleFiles(e.target.files);
        this.fileInputEl.value = ""; // reset for subsequent uploads
      }
    });
  }

  async handleFiles(fileList) {
    if (this.options.showToast) {
      this.options.showToast(`Uploading ${fileList.length} media file(s)...`, "info", 2000);
    }

    try {
      const res = await uploadMedia(fileList);
      if (res.success) {
        if (this.options.showToast) {
          this.options.showToast(`Uploaded ${res.count} file(s) successfully!`, "success");
        }
        if (this.options.onUploadSuccess) {
          this.options.onUploadSuccess(res.uploaded);
        }
      }
    } catch (err) {
      if (this.options.showToast) {
        this.options.showToast(`Upload failed: ${err.message}`, "error");
      }
    }
  }
}
