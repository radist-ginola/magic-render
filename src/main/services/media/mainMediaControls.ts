import type { MainMediaControls } from '../../../shared/domain/mediaTypes';
export function createDefaultMainMediaControls(): MainMediaControls {
  return { autoMute: false, fadeInSec: 0, fadeOutSec: 0, resize: { width: 1920, height: 1080 }, position: { x: 0, y: 0 }, rotation: 0 };
}
export function validateMainMediaControls(controls: MainMediaControls): void {
  if (!Number.isFinite(controls.fadeInSec) || controls.fadeInSec < 0) throw new Error('Fade-In harus bernilai 0 atau lebih.');
  if (!Number.isFinite(controls.fadeOutSec) || controls.fadeOutSec < 0) throw new Error('Fade-Out harus bernilai 0 atau lebih.');
  if (!Number.isFinite(controls.rotation) || controls.rotation < -360 || controls.rotation > 360) throw new Error('Rotasi harus berada pada -360 sampai 360 derajat.');
  if (controls.resize && (!Number.isInteger(controls.resize.width) || !Number.isInteger(controls.resize.height) || controls.resize.width < 1 || controls.resize.height < 1)) throw new Error('Resize tidak valid.');
  if (!Number.isFinite(controls.position.x) || !Number.isFinite(controls.position.y)) throw new Error('Position X/Y tidak valid.');
}
