// ==========================================================================
// Geometry, Scale Transformation & Magnetic Alignment Utilities
// ==========================================================================

export const CANVAS_1080_W = 1080;
export const CANVAS_1350_H = 1350;

export const STAGE_DISPLAY_W = 400;
export const STAGE_DISPLAY_H = 500;

export const SCALE_X = STAGE_DISPLAY_W / CANVAS_1080_W; // 400 / 1080 = 0.37037
export const SCALE_Y = STAGE_DISPLAY_H / CANVAS_1350_H; // 500 / 1350 = 0.37037

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Convert 1080x1350 coords to display pixels
export function toDisplayX(x1080) { return Math.round(x1080 * SCALE_X); }
export function toDisplayY(y1080) { return Math.round(y1080 * SCALE_Y); }
export function toDisplayW(w1080) { return Math.max(20, Math.round(w1080 * SCALE_X)); }
export function toDisplayH(h1080) { return Math.max(20, Math.round(h1080 * SCALE_Y)); }

// Convert display pixels to 1080x1350 coords
export function to1080X(dx) { return Math.round(dx / SCALE_X); }
export function to1080Y(dy) { return Math.round(dy / SCALE_Y); }
export function to1080W(dw) { return Math.max(30, Math.round(dw / SCALE_X)); }
export function to1080H(dh) { return Math.max(30, Math.round(dh / SCALE_Y)); }

/**
 * Checks for magnetic center alignment (X=200, Y=250 display).
 * Returns snapped coordinates and snapping guide flags.
 */
export function checkMagneticSnap(dx, dy, dw, dh, threshold = 6) {
  const centerX = dx + dw / 2;
  const centerY = dy + dh / 2;

  const targetCenterX = STAGE_DISPLAY_W / 2; // 200px
  const targetCenterY = STAGE_DISPLAY_H / 2; // 250px

  let snappedDx = dx;
  let snappedDy = dy;
  let snapX = false;
  let snapY = false;

  if (Math.abs(centerX - targetCenterX) <= threshold) {
    snappedDx = targetCenterX - dw / 2;
    snapX = true;
  }

  if (Math.abs(centerY - targetCenterY) <= threshold) {
    snappedDy = targetCenterY - dh / 2;
    snapY = true;
  }

  return {
    dx: snappedDx,
    dy: snappedDy,
    snapGuideX: snapX,
    snapGuideY: snapY
  };
}
