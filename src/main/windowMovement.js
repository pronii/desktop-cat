function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampToWorkArea(bounds, workArea, targetX, targetY) {
  return {
    x: clamp(targetX, workArea.x, workArea.x + workArea.width - bounds.width),
    y: clamp(targetY, workArea.y, workArea.y + workArea.height - bounds.height)
  };
}

function centerInWorkArea(bounds, workArea) {
  return {
    x: Math.round(workArea.x + (workArea.width - bounds.width) / 2),
    y: Math.round(workArea.y + (workArea.height - bounds.height) / 2)
  };
}

module.exports = {
  clamp,
  clampToWorkArea,
  centerInWorkArea
};
