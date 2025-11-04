/**
 * Math utilities for carousel calculations
 */

export const clamp = (v: number, min: number, max: number): number => 
  Math.max(min, Math.min(max, v));

export const computeCoverBleed = (
  natW: number, 
  natH: number, 
  contW: number, 
  contH: number, 
  bleedPx = 2
) => {
  const scale = Math.max(contW / natW, contH / natH);
  const displayW = Math.ceil(natW * scale) + bleedPx;
  const displayH = Math.ceil(natH * scale) + bleedPx;
  return { displayW, displayH };
};
