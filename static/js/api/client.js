// ==========================================================================
// Unified API Client for InstaClone Studio
// ==========================================================================

export async function fetchMedia() {
  const res = await fetch("/api/media");
  if (!res.ok) throw new Error("Failed to load media assets");
  return await res.json();
}

export async function uploadMedia(files) {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append("files", files[i]);
  }
  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error("Media upload failed");
  return await res.json();
}

export async function deleteMedia(filename) {
  const res = await fetch("/api/delete_media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete file");
  }
  return await res.json();
}

export async function startClone(url) {
  const res = await fetch("/api/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Cloning request failed");
  }
  return await res.json();
}

export async function pollJobStatus(jobId) {
  const res = await fetch(`/api/status/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch job status");
  return await res.json();
}

export async function fetchLatestJob() {
  const res = await fetch("/api/latest_job");
  if (!res.ok) return { job: null };
  return await res.json();
}

export async function fetchStickers() {
  const res = await fetch("/api/stickers");
  if (!res.ok) return { stickers: [] };
  return await res.json();
}

export async function searchStickers(query = "", category = "all") {
  const params = new URLSearchParams();
  if (query) params.append("q", query);
  if (category) params.append("category", category);
  const res = await fetch(`/api/stickers/search?${params.toString()}`);
  if (!res.ok) return { results: [] };
  return await res.json();
}

export async function uploadSticker(file) {
  const formData = new FormData();
  formData.append("sticker", file);
  const res = await fetch("/api/stickers/upload", {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to upload sticker");
  }
  return await res.json();
}

export async function saveCustomSlide(payload) {
  const res = await fetch("/api/custom_slide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to re-render custom slide");
  }
  return await res.json();
}
