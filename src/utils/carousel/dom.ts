/**
 * DOM manipulation utilities for carousel elements
 */

import { ElementStyles } from '../../types/carousel';

export const extractTextStyles = (doc: Document, el: HTMLElement): ElementStyles => {
  const cs = doc.defaultView?.getComputedStyle(el);
  if (!cs) return { fontSize: '16px', fontWeight: '400', textAlign: 'left', color: '#FFFFFF' };
  
  const rgbToHex = (rgb: string): string => {
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return rgb;
    const [r, g, b] = m.map(v => parseInt(v, 10));
    const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  };
  
  const color = cs.color || '#FFFFFF';
  return {
    fontSize: cs.fontSize || '16px',
    fontWeight: cs.fontWeight || '400',
    textAlign: (cs.textAlign as any) || 'left',
    color: color.startsWith('rgb') ? rgbToHex(color) : color,
  };
};

export const readAndStoreComputedTextStyles = (
  doc: Document,
  slideIndex: number,
  key: 'title' | 'subtitle',
  setOriginalStylesFn: React.Dispatch<React.SetStateAction<Record<string, ElementStyles>>>
) => {
  const id = `slide-${slideIndex}-${key}`;
  const el = doc.getElementById(id);
  if (!el) return;
  const styles = extractTextStyles(doc, el);
  setOriginalStylesFn(prev => ({ ...prev, [id]: styles }));
};

export const cleanupAltArtifacts = (host: HTMLElement) => {
  host.querySelectorAll('[alt]').forEach((node) => {
    const el = node as HTMLElement;
    if (el.textContent?.trim() === el.getAttribute('alt')?.trim()) {
      el.textContent = '';
    }
  });
};

export const installAltCleanupObserver = (doc: Document) => {
  const key = '__altCleanupInstalled';
  if ((doc as any)[key]) return;
  (doc as any)[key] = true;
  
  const observer = new MutationObserver(() => {
    doc.querySelectorAll('[data-editable][alt]').forEach(node => {
      const el = node as HTMLElement;
      if (el.textContent?.trim() === el.getAttribute('alt')?.trim()) {
        el.textContent = '';
      }
    });
  });
  
  observer.observe(doc.body, { childList: true, subtree: true });
};

export const getBgElements = (doc: Document) =>
  Array.from(doc.querySelectorAll('[data-editable="background"]')).filter(
    (e) => {
      const el = e as HTMLElement;
      return (
        el.style.backgroundImage && el.style.backgroundImage !== 'none'
      );
    }
  ) as HTMLElement[];

export const rectInViewport = (el: HTMLElement) => el.getBoundingClientRect();

export const layoutReady = (doc: Document) => new Promise<void>(r => {
  if (doc.readyState === 'complete') { r(); return; }
  doc.addEventListener('DOMContentLoaded', () => r(), { once: true });
});
