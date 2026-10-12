// ==========================================================================
// InstaClone Studio — Legacy Entrypoint Forwarder
// All frontend controllers are modularized into static/js/
// ==========================================================================

import("./js/main.js").catch(err => {
  console.error("Failed to load modular application entrypoint:", err);
});
