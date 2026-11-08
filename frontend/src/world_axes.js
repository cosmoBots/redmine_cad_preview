import { Vector3 } from 'three';

// World directions expressed in camera coordinates: independent of the model,
// its origin, dimensions and camera target (including Z-up CAD formats).
export function worldAxes(camera) {
  camera.updateMatrixWorld();
  const rotation = camera.getWorldQuaternion(camera.quaternion.clone()).invert();
  return [
    { label: 'X', color: '#c62828', direction: new Vector3(1, 0, 0) },
    { label: 'Y', color: '#2e7d32', direction: new Vector3(0, 1, 0) },
    { label: 'Z', color: '#1565c0', direction: new Vector3(0, 0, 1) }
  ].map(axis => ({ ...axis, direction: axis.direction.applyQuaternion(rotation) }))
    .sort((a, b) => a.direction.z - b.direction.z);
}

// Composite after cropping/resizing the model, not before finding opaque
// bounds: the widget must not keep a viewport-sized transparent margin.
export function drawWorldAxes(context, camera, width, height, pixelRatio = 1) {
  const size = Math.min(88 * pixelRatio, width, height);
  if (size < 24) return;
  const radius = size * 0.29;
  const x = width - size / 2;
  const y = height - size / 2;
  context.save();
  context.lineWidth = Math.max(1, size / 44);
  context.lineCap = 'round';
  context.font = `bold ${size * 0.15}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const axis of worldAxes(camera)) {
    const dx = axis.direction.x * radius;
    const dy = -axis.direction.y * radius;
    context.strokeStyle = axis.color;
    context.fillStyle = axis.color;
    context.beginPath(); context.moveTo(x, y); context.lineTo(x + dx, y + dy); context.stroke();
    // The circular tip remains legible when an axis points towards the camera.
    context.beginPath(); context.arc(x + dx, y + dy, size * 0.035, 0, 2 * Math.PI); context.fill();
    const tx = x + axis.direction.x * size * 0.38;
    const ty = y - axis.direction.y * size * 0.38;
    context.strokeStyle = '#ffffff';
    context.lineWidth = Math.max(2, size / 22);
    context.strokeText(axis.label, tx, ty);
    context.fillText(axis.label, tx, ty);
    context.lineWidth = Math.max(1, size / 44);
  }
  context.restore();
}
