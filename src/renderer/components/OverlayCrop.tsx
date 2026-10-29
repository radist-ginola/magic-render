import type { JSX, ReactNode } from 'react';
import type { OverlayConfig } from '../../shared/domain/overlayTypes';
import { maskClipPath } from '../../shared/domain/overlayMask';

/** Crop source percentages before scaling it to the layer frame. */
export function OverlayCrop({ crop, mask, width = 1920, height = 1080, children }: { crop?: OverlayConfig['crop']; mask?: OverlayConfig['mask']; width?: number; height?: number; children: ReactNode }): JSX.Element {
  const clipPath=maskClipPath(mask,width,height);
  if (!crop || Object.values(crop).every((value) => value === 0)) return clipPath ? <div className="mrp-overlay-crop" style={{clipPath}}>{children}</div> : <>{children}</>;
  const visibleWidth = 100 - crop.left - crop.right;
  const visibleHeight = 100 - crop.top - crop.bottom;
  return <div className="mrp-overlay-crop" style={{clipPath}}><div className="mrp-overlay-crop__source" style={{ width: `${10000 / visibleWidth}%`, height: `${10000 / visibleHeight}%`, left: `${-100 * crop.left / visibleWidth}%`, top: `${-100 * crop.top / visibleHeight}%` }}>{children}</div></div>;
}
