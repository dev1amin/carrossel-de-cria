// CarouselViewer.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  X, ZoomIn, ZoomOut, Download, ChevronDown, ChevronRight, Layers as LayersIcon,
  Image as ImageIcon, Type, Upload, Search, Play
} from 'lucide-react';
import type { CarouselData, ElementType, ElementStyles } from '../types';
import { searchImages } from '../services';

/** ========= LOG ========= */
const LOG = true;
const log = (...a: any[]) => { if (LOG) console.log('[CV]', ...a); };
const logc = (...a: any[]) => { if (LOG) console.log('[CV-CLICK]', ...a); };
const logd = (...a: any[]) => { if (LOG) console.log('[CV-DRAG]', ...a); };
const logb = (...a: any[]) => { if (LOG) console.log('[CV-BIND]', ...a); };

/** ========= Utils ========= */
const isVideoUrl = (url: string): boolean => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
const isImgurUrl = (url: string): boolean => url.includes('i.imgur.com');

interface CarouselViewerProps {
  slides: string[];
  carouselData: CarouselData;
  onClose: () => void;
}

/** ========= Math ========= */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const computeCoverBleed = (natW: number, natH: number, contW: number, contH: number, bleedPx = 2) => {
  const scale = Math.max(contW / natW, contH / natH);
  const displayW = Math.ceil(natW * scale) + bleedPx;
  const displayH = Math.ceil(natH * scale) + bleedPx;
  return { displayW, displayH };
};

/** ========= Drag State ========= */
type ImgDragState = {
  active: boolean;
  kind: 'img' | 'bg' | 'vid';
  mode?: 'objpos';
  slideIndex: number;
  doc: Document;
  wrapper: HTMLElement;
  targetEl: HTMLImageElement | HTMLElement;
  contW: number;
  contH: number;
  natW: number;
  natH: number;
  dispW: number;
  dispH: number;
  minLeft: number;
  minTop: number;
  left: number;
  top: number;
  startX: number;
  startY: number;
};
const imgDragState = { current: null as ImgDragState | null };

/** ========= Video Crop (placeholder) ========= */
type VideoCropState = {
  active: boolean;
  slideIndex: number;
  wrapper: HTMLElement;
  video: HTMLVideoElement;
  vW: number;
  vH: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
};
const videoCropState = { current: null as VideoCropState | null };

/** ========= DOM Helpers ========= */
const extractTextStyles = (doc: Document, el: HTMLElement): ElementStyles => {
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

const readAndStoreComputedTextStyles = (
  doc: Document,
  slideIndex: number,
  key: 'title' | 'subtitle',
  setOriginalStylesFn: React.Dispatch<React.SetStateAction<Record<string, ElementStyles>>>
) => {
  const id = `slide-${slideIndex}-${key}`;
  const el = doc.getElementById(id) as HTMLElement | null;
  if (!el) return;
  const computed = extractTextStyles(doc, el);
  setOriginalStylesFn(prev => ({ ...prev, [`${slideIndex}-${key}`]: computed }));
};

/** >>>>>> LIMPA alt lixo (deep) <<<<<< */
const cleanupAltArtifacts = (host: HTMLElement) => {
  const walker = host.ownerDocument!.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const toRemove: Node[] = [];
  const BAD = /(alt\s*=\s*(?:\"\"|''|&quot;&quot;)?\s*>?)/i;
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    const t = (n.textContent || '').trim();
    if (!t) continue;
    if (BAD.test(t)) toRemove.push(n);
  }
  toRemove.forEach(n => n.parentNode?.removeChild(n));
};

/** >>>>>> Observador global p/ matar "alt" assim que surge <<<<<< */
const installAltCleanupObserver = (doc: Document) => {
  const BAD = /(alt\s*=\s*(?:\"\"|''|&quot;&quot;)?\s*>?)/i;
  const scrub = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.textContent || '').trim();
      if (t && BAD.test(t)) n.parentNode?.removeChild(n);
    }
    if (n.nodeType === Node.ELEMENT_NODE) {
      (n as Element).childNodes.forEach(scrub);
    }
  };
  try { scrub(doc.body); } catch {}
  const mo = new MutationObserver((muts) => {
    for (const mut of muts) {
      if (mut.type === 'childList') mut.addedNodes.forEach(scrub);
      else if (mut.type === 'characterData') scrub(mut.target as Node);
    }
  });
  mo.observe(doc.body, { subtree: true, childList: true, characterData: true });
  (doc as any).__cvAltObserver = mo;
};

/** >>>>>> BG helpers <<<<<< */
const getBgElements = (doc: Document) =>
  Array.from(doc.querySelectorAll<HTMLElement>('body,div,section,header,main,figure,article'))
    .filter(el => {
      const cs = doc.defaultView?.getComputedStyle(el);
      return !!cs && cs.backgroundImage && cs.backgroundImage.includes('url(');
    });

const findLargestVisual = (doc: Document): { type: 'img' | 'bg' | 'vid', el: HTMLElement } | null => {
  let best: { type: 'img' | 'bg' | 'vid', el: HTMLElement, area: number } | undefined;

  const consider = (type: 'img'|'bg'|'vid', el: HTMLElement, area: number, candIsBody = false) => {
    const isBetterThanCurrent = () => {
      if (!best) return true;
      if (area > best.area) return true;
      if (best.el.tagName === 'BODY' && !candIsBody) return true;
      return false;
    };
    if (isBetterThanCurrent()) best = { type, el, area };
  };

  Array.from(doc.querySelectorAll('video')).forEach(v => {
    const r = (v as HTMLVideoElement).getBoundingClientRect();
    const area = r.width * r.height;
    if (area > 9000) consider('vid', v as HTMLElement, area);
  });

  Array.from(doc.querySelectorAll('img')).forEach(img => {
    const im = img as HTMLImageElement;
    if (isImgurUrl(im.src) && !im.getAttribute('data-protected')) im.setAttribute('data-protected', 'true');
    if (im.getAttribute('data-protected') !== 'true') {
      const r = im.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > 9000) consider('img', im, area);
    }
  });

  const bgs = getBgElements(doc);
  bgs.forEach(el => {
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > 9000) {
      const isBody = el.tagName === 'BODY';
      consider('bg', el, area, isBody);
    }
  });

  return best ? { type: best.type, el: best.el } : null;
};

/** ========= Força estilo do vídeo ========= */
const forceVideoStyle = (v: HTMLVideoElement) => {
  v.removeAttribute('controls');
  v.controls = false;
  (v as any).disablePictureInPicture = true;
  v.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback');
  v.setAttribute('playsinline', 'true');
  v.setAttribute('webkit-playsinline', 'true');
  v.muted = true;
  v.loop = true;
  v.autoplay = false;
  v.preload = 'metadata';
  try { v.pause(); } catch {}
  v.style.setProperty('object-fit', 'cover', 'important');
  v.style.setProperty('width', '100%', 'important');
  v.style.setProperty('height', '100%', 'important');
  v.style.setProperty('position', 'absolute', 'important');
  (v.style as any).inset = '0';
  v.style.setProperty('display', 'block', 'important');

  const p = v.parentElement as HTMLElement | null;
  if (p) {
    if (!p.style.position) p.style.position = 'relative';
    p.style.setProperty('overflow', 'hidden', 'important');
    p.style.setProperty('background-color', 'black', 'important');
  }
};

/** ========= Overlays ========= */
const playOverlayMap: WeakMap<HTMLVideoElement, {btn: HTMLElement, abort: AbortController}> = new WeakMap();

const removeAllPlayOverlays = (doc: Document) => {
  doc.querySelectorAll('.cv-play-overlay').forEach(n => n.remove());
};

const killPlayOverlays = (root: ParentNode | null) => {
  if (!root) return;
  root.querySelectorAll?.('.cv-play-overlay')?.forEach(n => n.remove());
  const vids = (root as ParentNode).querySelectorAll?.('video') || [];
  vids.forEach((v: any) => {
    const entry = playOverlayMap.get(v as HTMLVideoElement);
    if (entry) { try { entry.abort.abort(); } catch {} playOverlayMap.delete(v as HTMLVideoElement); }
  });
};

const safeUserPlay = (video: HTMLVideoElement) => {
  try {
    video.muted = true;
    video.setAttribute('muted', '');
    (video as any).defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline','true');
    video.setAttribute('webkit-playsinline','true');
    const p = video.play();
    if (p?.catch) p.catch(() => { try { video.play(); } catch {} });
    return p;
  } catch {}
};

const attachPlayOverlay = (doc: Document, host: HTMLElement, video: HTMLVideoElement) => {
  const existing = playOverlayMap.get(video);
  if (existing?.btn?.isConnected) {
    existing.btn.style.display = video.paused ? 'flex' : 'none';
    return;
  }

  host.querySelectorAll(':scope > .cv-play-overlay').forEach(n => n.remove());

  const btn = doc.createElement('div');
  btn.className = 'cv-play-overlay';
  Object.assign(btn.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.45)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
    pointerEvents: 'auto',
    cursor: 'pointer',
    zIndex: '9999',
  } as CSSStyleDeclaration);

  const tri = doc.createElement('div');
  Object.assign(tri.style, {
    width: '0', height: '0',
    borderLeft: '18px solid white',
    borderTop: '12px solid transparent',
    borderBottom: '12px solid transparent',
    marginLeft: '4px',
  } as CSSStyleDeclaration);
  btn.appendChild(tri);

  const abort = new AbortController();
  const { signal } = abort;

  const refresh = () => { btn.style.display = video.paused ? 'flex' : 'none'; };
  video.addEventListener('play',  refresh, { passive: true, signal });
  video.addEventListener('pause', refresh, { passive: true, signal });

  const toggle = () => { if (video.paused) void safeUserPlay(video); else { try { video.pause(); } catch {} } };
  video.addEventListener('click', (e)=>{ e.stopPropagation(); toggle(); }, { signal });
  btn.addEventListener('click',   (e)=>{ e.stopPropagation(); toggle(); }, { signal });

  host.style.position = host.style.position || 'relative';
  host.appendChild(btn);
  refresh();

  playOverlayMap.set(video, { btn, abort });
};

/** ===== Overlay root ===== */
const ensureOverlayRoot = (doc: Document) => {
  const key = '__cvOverlayRoot';
  if ((doc as any)[key]) return (doc as any)[key] as HTMLElement;
  const root = doc.createElement('div');
  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.pointerEvents = 'none';
  root.style.zIndex = '2147483647';
  doc.body.appendChild(root);
  (doc as any)[key] = root;
  return root;
};
const rectInViewport = (el: HTMLElement) => el.getBoundingClientRect();

/** ========= ensureImgCropWrapper ========= */
const ensureImgCropWrapper = (doc: Document, img: HTMLImageElement): { wrapper: HTMLElement, contW:number, contH:number } => {
  const rectNow = img.getBoundingClientRect();
  let initialW = rectNow.width || (img as any).offsetWidth || img.naturalWidth || 0;
  let initialH = rectNow.height || (img as any).offsetHeight || img.naturalHeight || 0;

  const cs = doc.defaultView?.getComputedStyle(img);
  const originalDisplay = cs?.display || 'inline-block';
  const originalRadius  = cs?.borderRadius || '';

  let wrapper = img.parentElement;
  if (!wrapper || !wrapper.classList.contains('img-crop-wrapper')) {
    const w = doc.createElement('div');
    w.className = 'img-crop-wrapper';
    w.style.display  = originalDisplay;
    w.style.position = 'relative';
    w.style.setProperty('overflow', 'hidden', 'important');
    if (img.parentNode) img.parentNode.replaceChild(w, img);
    w.appendChild(img);
    wrapper = w;
  } else {
    (wrapper as HTMLElement).style.position = (wrapper as HTMLElement).style.position || 'relative';
    (wrapper as HTMLElement).style.setProperty('overflow', 'hidden', 'important');
  }
  if (originalRadius) (wrapper as HTMLElement).style.borderRadius = originalRadius;

  if (!wrapper.style.width) {
    (wrapper as HTMLElement).style.width = `${initialW || 1080}px`;
  }

  const persistedH = parseFloat((wrapper as HTMLElement).getAttribute('data-cv-height') || 'NaN');
  if (Number.isFinite(persistedH)) {
    (wrapper as HTMLElement).style.setProperty('height', `${Math.max(120,persistedH)}px`, 'important');
  } else if (!wrapper.style.height) {
    (wrapper as HTMLElement).style.setProperty('height', `${initialH || 450}px`, 'important');
    (wrapper as HTMLElement).setAttribute('data-cv-height', String(initialH || 450));
  }

  img.style.setProperty('width', '100%', 'important');
  img.style.setProperty('height', '100%', 'important');
  img.style.setProperty('object-fit', 'cover', 'important');

  const wr = (wrapper as HTMLElement).getBoundingClientRect();
  const contW = wr.width || initialW;
  const contH = wr.height || initialH;

  log('wrap img (safe)', { w: contW, h: contH });
  return { wrapper: wrapper as HTMLElement, contW, contH };
};

/** ========= ResizeObserver host ========= */
const ensureHostResizeObserver = (host: HTMLElement) => {
  if ((host as any).__cvRO) return;
  const ro = new ResizeObserver(() => {
    host.querySelectorAll<HTMLElement>(':scope > img[data-editable], :scope > video[data-editable]').forEach((el) => {
      const isVid = el.tagName === 'VIDEO';
      (el as HTMLElement).style.setProperty('width', '100%', 'important');
      (el as HTMLElement).style.setProperty('height', '100%', 'important');
      (el as HTMLElement).style.setProperty('object-fit', 'cover', 'important');
      (el as HTMLElement).style.removeProperty('position');
      if (isVid) {
        (el as HTMLElement).style.setProperty('position','absolute','important');
        (el as any).style.inset = '0';
      }
    });
  });
  ro.observe(host);
  (host as any).__cvRO = ro;
};

/** ========= Exclusividade das pinças por documento ========= */
type PinchersHandle = { dispose: () => void };

declare global {
  interface Document {
    __cvActivePinchersHost?: HTMLElement | null;
  }
}

const disposePinchersInDoc = (doc: Document) => {
  const prev = (doc as any).__cvActivePinchersHost as (HTMLElement | null);
  if (prev && (prev as any).__cvPinchers) {
    try { (prev as any).__cvPinchers.dispose(); } catch {}
  }
  (doc as any).__cvActivePinchersHost = null;
};

/** ========= Pinças (overlay fixo) ========= */
const attachResizePinchers = (doc: Document, host: HTMLElement) => {
  if ((doc as any).__cvActivePinchersHost === host && (host as any).__cvPinchers) return;

  disposePinchersInDoc(doc);

  const persisted = parseFloat(host.getAttribute('data-cv-height') || 'NaN');
  const ensurePxHeight = () => {
    const r = host.getBoundingClientRect();
    const h = Number.isFinite(persisted) ? persisted : Math.max(120, Math.round(r.height || 450));
    host.style.position = host.style.position || 'relative';
    host.style.setProperty('overflow', 'hidden', 'important');
    host.style.setProperty('height', `${h}px`, 'important');
    host.setAttribute('data-cv-height', String(h));
    host.querySelectorAll<HTMLElement>(':scope > img[data-editable], :scope > video[data-editable]').forEach((el) => {
      const isVid = el.tagName === 'VIDEO';
      (el as HTMLElement).style.setProperty('width', '100%', 'important');
      (el as HTMLElement).style.setProperty('height', '100%', 'important');
      (el as HTMLElement).style.setProperty('object-fit', 'cover', 'important');
      (el as HTMLElement).style.removeProperty('position');
      if (isVid) {
        (el as HTMLElement).style.setProperty('position','absolute','important');
        (el as any).style.inset = '0';
      }
    });
  };
  ensurePxHeight();
  ensureHostResizeObserver(host);

  const overlay = ensureOverlayRoot(doc);
  const north = doc.createElement('div');
  const south = doc.createElement('div');
  [north, south].forEach((h) => {
    h.className = 'cv-resize-handle';
    h.style.position = 'fixed';
    h.style.left = '0';
    h.style.width = '0';
    h.style.height = '20px';
    h.style.cursor = 'ns-resize';
    h.style.userSelect = 'none';
    h.style.pointerEvents = 'auto';
    h.style.background = 'transparent';
    h.style.transform = 'translateZ(0)';
    h.style.zIndex = '2147483647';
  });

  const mkBar = () => {
    const bar = doc.createElement('div');
    bar.style.position = 'absolute';
    bar.style.left = '20%';
    bar.style.right = '20%';
    bar.style.height = '6px';
    bar.style.borderRadius = '9999px';
    bar.style.background = '#3B82F6';
    bar.style.opacity = '0.9';
    bar.style.boxShadow = '0 0 0 2px rgba(59,130,246,.25)';
    return bar;
  };
  const nBar = mkBar(); nBar.style.bottom = '2px';
  const sBar = mkBar(); sBar.style.top = '2px';
  north.appendChild(nBar); south.appendChild(sBar);

  overlay.appendChild(north);
  overlay.appendChild(south);

  let startY = 0;
  let startH = 0;
  const applyHeight = (next: number) => {
    next = Math.max(120, Math.min(4096, Math.round(next)));
    host.style.setProperty('height', `${next}px`, 'important');
    host.setAttribute('data-cv-height', String(next));
    host.querySelectorAll<HTMLElement>(':scope > img[data-editable], :scope > video[data-editable]').forEach((el) => {
      const isVid = el.tagName === 'VIDEO';
      (el as HTMLElement).style.setProperty('width', '100%', 'important');
      (el as HTMLElement).style.setProperty('height', '100%', 'important');
      (el as HTMLElement).style.setProperty('object-fit', 'cover', 'important');
      (el as HTMLElement).style.removeProperty('position');
      if (isVid) {
        (el as HTMLElement).style.setProperty('position','absolute','important');
        (el as any).style.inset = '0';
      }
    });
    update();
  };

  const onMoveNorth = (e: MouseEvent) => { const dy = e.clientY - startY; applyHeight(startH - dy); };
  const onMoveSouth = (e: MouseEvent) => { const dy = e.clientY - startY; applyHeight(startH + dy); };
  const onUp = () => {
    doc.removeEventListener('mousemove', onMoveNorth);
    doc.removeEventListener('mousemove', onMoveSouth);
    doc.removeEventListener('mouseup', onUp);
  };

  north.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const r = host.getBoundingClientRect();
    startY = e.clientY; startH = r.height;
    doc.addEventListener('mousemove', onMoveNorth);
    doc.addEventListener('mouseup', onUp);
  });
  south.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const r = host.getBoundingClientRect();
    startY = e.clientY; startH = r.height;
    doc.addEventListener('mousemove', onMoveSouth);
    doc.addEventListener('mouseup', onUp);
  });

  const HANDLE_H = 20;
  const update = () => {
    const r = rectInViewport(host);
    if (r.width === 0 || r.height === 0) {
      north.style.display = 'none'; south.style.display = 'none';
      return;
    }
    north.style.display = 'block'; south.style.display = 'block';
    north.style.top = `${Math.max(0, r.top - HANDLE_H)}px`;
    south.style.top = `${r.bottom}px`;
    north.style.left = `${r.left}px`;
    south.style.left = `${r.left}px`;
    (north.style as any).width = `${r.width}px`;
    (south.style as any).width = `${r.width}px`;
  };

  const ro = new ResizeObserver(update);
  ro.observe(host);
  const onScroll = () => update();
  doc.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', update);

  (host as any).__cvPinchers = {
    dispose: () => {
      try { ro.disconnect(); } catch {}
      try { doc.removeEventListener('scroll', onScroll, true); } catch {}
      try { window.removeEventListener('resize', update); } catch {}
      try { overlay.contains(north) && overlay.removeChild(north); } catch {}
      try { overlay.contains(south) && overlay.removeChild(south); } catch {}
      (host as any).__cvPinchers = null;
    }
  } as PinchersHandle;

  update();
  (doc as any).__cvActivePinchersHost = host;
};

/** ========= helper de normalização pós-troca ========= */
const normFill = (host: HTMLElement) => {
  host.querySelectorAll<HTMLElement>(':scope > img[data-editable], :scope > video[data-editable]').forEach((el) => {
    const isVid = el.tagName === 'VIDEO';
    (el as HTMLElement).style.setProperty('width', '100%', 'important');
    (el as HTMLElement).style.setProperty('height', '100%', 'important');
    (el as HTMLElement).style.setProperty('object-fit', 'cover', 'important');
    (el as HTMLElement).style.removeProperty('position');
    if (isVid) {
      (el as HTMLElement).style.setProperty('position', 'absolute', 'important');
      (el as any).style.inset = '0';
    }
  });
};

/** ========= APPLY BG / MEDIA ========= */
const applyBackgroundImageImmediate = (slideIndex: number, mediaUrl: string, iframeRefs: (HTMLIFrameElement | null)[]): HTMLElement | null => {
  const iframe = iframeRefs[slideIndex];
  if (!iframe || !iframe.contentWindow) return null;
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  if (!doc) return null;

  const makeVideo = (src: string): HTMLVideoElement => {
    const v = doc.createElement('video');
    v.src = src;
    v.setAttribute('data-editable', 'video');
    v.setAttribute('playsinline', 'true');
    v.setAttribute('webkit-playsinline', 'true');
    v.muted = true;
    v.loop = true;
    v.autoplay = false;
    v.preload = 'metadata';
    try { v.pause(); } catch {}
    forceVideoStyle(v);
    return v;
  };

  const makeImage = (src: string): HTMLImageElement => {
    const img = doc.createElement('img');
    img.src = src;
    img.setAttribute('data-editable', 'image');
    img.loading = 'eager';
    img.style.display = 'block';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.setAttribute('data-bg-image-url', src);
    return img;
  };

  const best = findLargestVisual(doc);
  const wantVideo = isVideoUrl(mediaUrl);

  if (best !== null) {
    if (best.type === 'img') {
      const img = best.el as HTMLImageElement;
      if (wantVideo) {
        const { wrapper } = ensureImgCropWrapper(doc, img);
        const video = makeVideo(mediaUrl);
        killPlayOverlays(wrapper);
        wrapper.replaceChild(video, img);
        forceVideoStyle(video);
        try { video.load(); } catch {}
        attachPlayOverlay(doc, wrapper, video);
        ensureHostResizeObserver(wrapper);
        normFill(wrapper);

        cleanupAltArtifacts(wrapper);
        queueMicrotask(() => { try { cleanupAltArtifacts(wrapper); } catch {} });
        return video;
      }
      img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.loading = 'eager';
      img.src = mediaUrl; img.setAttribute('data-bg-image-url', mediaUrl);
      const w = img.closest('.img-crop-wrapper') as HTMLElement | null;
      killPlayOverlays(w || img.parentElement);
      removeAllPlayOverlays(doc);
      cleanupAltArtifacts((w || img.parentElement || doc.body) as HTMLElement);
      queueMicrotask(() => { try { cleanupAltArtifacts((w || img.parentElement || doc.body) as HTMLElement); } catch {} });
      if (w) { ensureHostResizeObserver(w); normFill(w); }
      return img;
    }

    if (best.type === 'vid') {
      const video = best.el as HTMLVideoElement;
      if (wantVideo) {
        killPlayOverlays((video.parentElement as HTMLElement) || doc.body);
        video.src = mediaUrl;
        forceVideoStyle(video);
        try { video.load(); } catch {}
        attachPlayOverlay(doc, (video.parentElement as HTMLElement) || doc.body, video);
        if (video.parentElement) { ensureHostResizeObserver(video.parentElement as HTMLElement); normFill(video.parentElement as HTMLElement); }

        cleanupAltArtifacts((video.parentElement as HTMLElement) || doc.body);
        queueMicrotask(() => { try { cleanupAltArtifacts((video.parentElement as HTMLElement) || doc.body); } catch {} });
        return video;
      }
      const img = makeImage(mediaUrl);
      const parent = video.parentElement!;
      killPlayOverlays(parent);
      parent.replaceChild(img, video);
      removeAllPlayOverlays(doc);
      cleanupAltArtifacts(parent);
      queueMicrotask(() => { try { cleanupAltArtifacts(parent); } catch {} });
      try { ensureImgCropWrapper(doc, img); } catch {}
      const w2 = img.closest('.img-crop-wrapper') as HTMLElement | null;
      if (w2) { ensureHostResizeObserver(w2); normFill(w2); }
      return img;
    }

    if (best.type === 'bg') {
      const cont = best.el as HTMLElement;
      if (wantVideo) {
        cont.style.setProperty('background-image', 'none', 'important');
        let video = cont.querySelector(':scope > video[data-editable="video"]') as HTMLVideoElement | null;
        killPlayOverlays(cont);
        if (!video) {
          video = makeVideo(mediaUrl);
          video.style.position = 'absolute';
          (video.style as any).inset = '0';
          cont.style.position = cont.style.position || 'relative';
          cont.appendChild(video);
          forceVideoStyle(video);
          try { video.load(); } catch {}
          attachPlayOverlay(doc, cont, video);
          ensureHostResizeObserver(cont);
          normFill(cont);
          cleanupAltArtifacts(cont);
          queueMicrotask(() => { try { cleanupAltArtifacts(cont); } catch {} });
        } else {
          video.src = mediaUrl;
          forceVideoStyle(video);
          try { video.load(); } catch {}
          attachPlayOverlay(doc, cont, video);
          ensureHostResizeObserver(cont);
          normFill(cont);
          cleanupAltArtifacts(cont);
          queueMicrotask(() => { try { cleanupAltArtifacts(cont); } catch {} });
        }
        return video;
      } else {
        cont.style.setProperty('background-image', `url('${mediaUrl}')`, 'important');
        cont.style.setProperty('background-repeat', 'no-repeat', 'important');
        cont.style.setProperty('background-size', 'cover', 'important');
        cont.style.setProperty('background-position', '50% 50%', 'important');
        cont.querySelectorAll(':scope > video[data-editable="video"]').forEach(v => v.remove());
        killPlayOverlays(cont);
        removeAllPlayOverlays(doc);
        cleanupAltArtifacts(cont);
        queueMicrotask(() => { try { cleanupAltArtifacts(cont); } catch {} });
        ensureHostResizeObserver(cont);
        normFill(cont);
        return cont;
      }
    }
  }

  if (wantVideo) {
    let holder = doc.getElementById('__cvBodyBg') as HTMLElement | null;
    if (!holder) {
      holder = doc.createElement('div');
      holder.id = '__cvBodyBg';
      holder.setAttribute('data-editable', 'video');
      Object.assign(holder.style, {
        position: 'absolute',
        left: '0', top: '0', right: '0', bottom: '0',
        overflow: 'hidden',
        zIndex: '0'
      } as CSSStyleDeclaration);

      doc.documentElement.style.setProperty('height', '100%', 'important');
      doc.documentElement.style.setProperty('width', '100%', 'important');
      doc.documentElement.style.setProperty('background-color', 'black', 'important');
      doc.body.style.setProperty('height', '100%', 'important');
      doc.body.style.setProperty('width', '100%', 'important');
      doc.body.style.position = doc.body.style.position || 'relative';
      doc.body.style.setProperty('overflow', 'hidden', 'important');
      doc.body.style.setProperty('background-color', 'black', 'important');
      doc.body.appendChild(holder);
    }

    killPlayOverlays(holder);
    holder.innerHTML = '';

    const video = makeVideo(mediaUrl);
    video.setAttribute('data-editable', 'video');
    holder.appendChild(video);
    forceVideoStyle(video);
    try { video.load(); } catch {}
    attachPlayOverlay(doc, holder, video);
    ensureHostResizeObserver(holder);
    normFill(holder);
    cleanupAltArtifacts(holder);
    queueMicrotask(() => { try { cleanupAltArtifacts(holder!); } catch {} });
    return video;
  } else {
    doc.documentElement.style.setProperty('background-color', 'black', 'important');
    doc.body.style.setProperty('background-color', 'black', 'important');
    doc.body.style.setProperty('background-image', `url('${mediaUrl}')`, 'important');
    doc.body.style.setProperty('background-repeat', 'no-repeat', 'important');
    doc.body.style.setProperty('background-size', 'cover', 'important');
    doc.body.style.setProperty('background-position', '50% 50%', 'important');
    doc.body.querySelectorAll(':scope > video[data-editable="video"]').forEach(v => v.remove());
    killPlayOverlays(doc.body);
    removeAllPlayOverlays(doc);
    cleanupAltArtifacts(doc.body);
    queueMicrotask(() => { try { cleanupAltArtifacts(doc.body); } catch {} });
    return doc.body;
  }
};

/** ========= layoutReady ========= */
const layoutReady = (doc: Document) => new Promise<void>(r => {
  requestAnimationFrame(() => { void doc.body?.getBoundingClientRect(); r(); });
});

/** ========= Componente ========= */
const CarouselViewer: React.FC<CarouselViewerProps> = ({ slides, carouselData, onClose }) => {
  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  const [zoom, setZoom] = useState(0.35);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [focusedSlide, setFocusedSlide] = useState<number>(0);
  const [selectedElement, setSelectedElement] = useState<{ slideIndex: number; element: ElementType }>({ slideIndex: 0, element: null });
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set([0]));

  const [editedContent, setEditedContent] = useState<Record<string, any>>({});
  const [elementStyles, setElementStyles] = useState<Record<string, ElementStyles>>({});
  const [originalStyles, setOriginalStyles] = useState<Record<string, ElementStyles>>({});
  const [renderedSlides, setRenderedSlides] = useState<string[]>(slides);

  const [isLoadingProperties, setIsLoadingProperties] = useState(false);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<Record<number, string>>({});

  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const lastSearchId = useRef(0);

  /** helper global: limpa seleções entre todos os slides */
  const clearAllSelections = () => {
    iframeRefs.current.forEach((ifr) => {
      const d = ifr?.contentDocument || ifr?.contentWindow?.document;
      if (!d) return;
      d.querySelectorAll('[data-editable].selected').forEach((el) => {
        el.classList.remove('selected');
        (el as HTMLElement).style.zIndex = '';
      });
      d.querySelectorAll('.img-crop-wrapper[data-cv-selected="1"]').forEach((el) => {
        (el as HTMLElement).removeAttribute('data-cv-selected');
      });
      try { disposePinchersInDoc(d); } catch {}
    });
  };

  /** === REFLEXO DE EDIÇÕES NO IFRAME (texto + estilos) === */
  useEffect(() => {
    Object.entries(editedContent).forEach(([k, val]) => {
      const [slideStr, field] = k.split('-');
      const slideIndex = Number(slideStr);
      if (Number.isNaN(slideIndex)) return;
      if (field !== 'title' && field !== 'subtitle') return;

      const ifr = iframeRefs.current[slideIndex];
      const doc = ifr?.contentDocument || ifr?.contentWindow?.document;
      const el = doc?.getElementById(`slide-${slideIndex}-${field}`);
      if (el && typeof val === 'string') el.textContent = val;
    });

    Object.entries(elementStyles).forEach(([k, sty]) => {
      const [slideStr, field] = k.split('-');
      const slideIndex = Number(slideStr);
      if (Number.isNaN(slideIndex)) return;
      if (field !== 'title' && field !== 'subtitle') return;

      const ifr = iframeRefs.current[slideIndex];
      const doc = ifr?.contentDocument || ifr?.contentWindow?.document;
      const el = doc?.getElementById(`slide-${slideIndex}-${field}`) as HTMLElement | null;
      if (!el) return;

      if (sty.fontSize)  el.style.fontSize  = sty.fontSize;
      if (sty.fontWeight) el.style.fontWeight = String(sty.fontWeight);
      if (sty.textAlign) el.style.textAlign = sty.textAlign as any;
      if (sty.color)     el.style.color     = sty.color;
    });
  }, [editedContent, elementStyles]);

  /** IDs + estilos + FOUC guard */
  const ensureStyleTag = (html: string) => {
    if (!/<style[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1><style></style>`);
    }
    return html;
  };

  const stripAltGarbage = (html: string) =>
    html.replace(/>\s*alt\s*=\s*(?:""|''|&quot;&quot;)\s*>/gi, '>');

  const injectEditableIds = (html: string, slideIndex: number): string => {
    let result = ensureStyleTag(html);
    const conteudo = carouselData.conteudos[slideIndex];
    const titleText = conteudo?.title || '';
    const subtitleText = conteudo?.subtitle || '';

    const addEditableSpan = (text: string, id: string, attr: string) => {
      const lines = text.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        const escaped = line.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(>[^<]*)(${escaped})([^<]*<)`, 'gi');
        result = result.replace(re, (_match, b, t, a) => `${b}<span id="${id}" data-editable="${attr}" contenteditable="false">${t}</span>${a}`);
      });
    };

    if (titleText) addEditableSpan(titleText, `slide-${slideIndex}-title`, 'title');
    if (subtitleText) addEditableSpan(subtitleText, `slide-${slideIndex}-subtitle`, 'subtitle');

    result = result.replace(/<style>/i, `<style>
      [data-editable]{cursor:pointer!important;position:relative;display:inline-block!important}
      [data-editable].selected{outline:3px solid #3B82F6!important;outline-offset:2px;z-index:1000}
      [data-editable]:hover:not(.selected){outline:2px solid rgba(59,130,246,.5)!important;outline-offset:2px}
      [data-editable][contenteditable="true"]{outline:3px solid #10B981!important;outline-offset:2px;background:rgba(16,185,129,.1)!important}
      img[data-editable]{display:block!important}
      video[data-editable]{display:block!important}
      html, body { pointer-events: auto !important; }

      html, body { height:100% !important; width:100% !important; margin:0 !important; padding:0 !important; overflow:hidden !important; }
      img, video { max-width:none !important; }

      .text-box .video-container{
        position:relative !important;
        display:block !important;
        width:100% !important;
        height:450px;
        border-radius:24px !important;
        overflow:hidden !important;
        margin-top:0 !important;
        box-shadow:0 16px 48px rgba(0,0,0,.18) !important;
      }
      .text-box .video-container > video{
        position:absolute !important;
        inset:0 !important;
        width:100% !important;
        height:100% !important;
        object-fit:cover !important;
        display:block !important;
        border-radius:24px !important;
      }
      .text-box > video{
        width:100% !important;
        height:450px;
        object-fit:cover !important;
        display:block !important;
        border-radius:24px !important;
        margin-top:0 !important;
        box-shadow:0 16px 48px rgba(0,0,0,.18) !important;
      }
      .text-box img{ margin-top:0 !important; }

      .img-crop-wrapper[data-cv-selected="1"]{
        outline:3px solid #3B82F6!important;
        outline-offset:2px;
        z-index:1000;
      }
      .img-crop-wrapper { cursor: pointer !important; }
    `);

    result = result.replace(
      /<body([^>]*)>/i,
      (m, attrs) =>
        /id=/.test(attrs)
          ? m.replace(/>/, ` style="visibility:hidden">`)
          : `<body${attrs} id="slide-${slideIndex}-background" data-editable="background" style="visibility:hidden">`
    );

    return result;
  };

  useEffect(() => {
    setRenderedSlides(slides.map((s, i) => injectEditableIds(stripAltGarbage(s), i)));
  }, [slides]);

  useEffect(() => {
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = 0 * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
    setFocusedSlide(0);
    setSelectedElement({ slideIndex: 0, element: null });
  }, []); // mount only

  const postProcessTemplateVideos = (doc: Document) => {
    Array.from(doc.querySelectorAll<HTMLElement>('.text-box .video-container')).forEach((host) => {
      host.style.position = host.style.position || 'relative';
      host.style.overflow = 'hidden';
      (host.style as any).height = (host.style as any).height || '450px';
      const v = host.querySelector('video');
      if (v) {
        v.setAttribute('data-editable', 'video');
        forceVideoStyle(v as HTMLVideoElement);
        (v as HTMLVideoElement).style.position = 'absolute';
        (v as any).style.inset = '0';
        (v as HTMLVideoElement).style.width = '100%';
        (v as HTMLVideoElement).style.height = '100%';
        (v as HTMLVideoElement).style.objectFit = 'cover';
        try { (v as HTMLVideoElement).pause(); } catch {}
        try { (v as HTMLVideoElement).load(); } catch {}
        attachPlayOverlay(doc, host, v as HTMLVideoElement);
        ensureHostResizeObserver(host);
        normFill(host);
      }
    });

    Array.from(doc.querySelectorAll<HTMLVideoElement>('.text-box > video')).forEach((v) => {
      v.setAttribute('data-editable', 'video');
      forceVideoStyle(v);
      v.style.width = '100%';
      v.style.height = '450px';
      v.style.objectFit = 'cover';
      try { v.pause(); } catch {}
      try { v.load(); } catch {}
      const parent = v.parentElement!;
      attachPlayOverlay(doc, parent, v);
      ensureHostResizeObserver(parent);
      normFill(parent);
    });

    try { cleanupAltArtifacts(doc.body); } catch {}
  };

  /** ====== Wiring nos iframes + Drag ====== */
  useEffect(() => {
    const disposers: Array<() => void> = [];

    const startImgDrag = async (doc: Document, slideIndex: number, img: HTMLImageElement, ev: MouseEvent) => {
      ev.preventDefault(); ev.stopPropagation();

      const { wrapper } = ensureImgCropWrapper(doc, img);
      let wr = (wrapper as HTMLElement).getBoundingClientRect();
      if (wr.width === 0 || wr.height === 0) {
        await layoutReady(doc);
        wr = (wrapper as HTMLElement).getBoundingClientRect();
        if (wr.width === 0 || wr.height === 0) return;
      }
      const contW = wr.width, contH = wr.height;
      const natW = img.naturalWidth || contW, natH = img.naturalHeight || contH;

      img.style.setProperty('width', '100%', 'important');
      img.style.setProperty('height', '100%', 'important');
      img.style.setProperty('object-fit', 'cover', 'important');
      img.style.removeProperty('position');
      img.removeAttribute('data-cv-left');
      img.removeAttribute('data-cv-top');

      const { displayW, displayH } = computeCoverBleed(natW, natH, contW, contH, 0);
      const maxOffsetX = Math.max(0, displayW - contW);
      const maxOffsetY = Math.max(0, displayH - contH);

      const cs = doc.defaultView?.getComputedStyle(img);
      const toPerc = (v: string) => v?.trim().endsWith('%') ? parseFloat(v) : 50;
      const obj = (cs?.objectPosition || '50% 50%').split(/\s+/);
      const xPerc = toPerc(obj[0] || '50%');
      const yPerc = toPerc(obj[1] || '50%');
      const leftPx = -maxOffsetX * (xPerc / 100);
      const topPx  = -maxOffsetY * (yPerc / 100);

      imgDragState.current = {
        active:true, kind:'img', mode:'objpos', slideIndex, doc,
        wrapper, targetEl: img,
        contW, contH, natW, natH, dispW: displayW, dispH: displayH,
        minLeft: Math.min(0, contW - displayW),
        minTop:  Math.min(0, contH - displayH),
        left: leftPx, top: topPx, startX: ev.clientX, startY: ev.clientY
      };
      logd('start IMG (object-position only)', { slideIndex, contW, contH, displayW, displayH });
    };

    const startVideoDrag = async (doc: Document, slideIndex: number, video: HTMLVideoElement, ev: MouseEvent) => {
      ev.preventDefault(); ev.stopPropagation();

      const host = video.parentElement as HTMLElement | null;
      const cont = host && host.classList.contains('img-crop-wrapper') ? host : (host || video);
      let wr = cont.getBoundingClientRect();
      if (wr.width === 0 || wr.height === 0) { await layoutReady(doc); wr = cont.getBoundingClientRect(); if (wr.width === 0 || wr.height === 0) return; }

      const contW = wr.width, contH = wr.height;
      const natW = video.videoWidth || contW;
      const natH = video.videoHeight || contH;

      video.style.setProperty('object-fit','cover','important');
      video.style.setProperty('width','100%','important');
      video.style.setProperty('height','100%','important');
      video.style.setProperty('position','absolute','important');
      (video.style as any).inset = '0';

      const { displayW, displayH } = computeCoverBleed(natW, natH, contW, contH, 0);
      const maxOffsetX = Math.max(0, displayW - contW);
      const maxOffsetY = Math.max(0, displayH - contH);

      const cs = doc.defaultView?.getComputedStyle(video);
      const toPerc = (v: string) => v?.trim().endsWith('%') ? parseFloat(v) : 50;
      const obj = (cs?.objectPosition || '50% 50%').split(/\s+/);
      const xPerc = toPerc(obj[0] || '50%');
      const yPerc = toPerc(obj[1] || '50%');
      const leftPx = -maxOffsetX * (xPerc / 100);
      const topPx  = -maxOffsetY * (yPerc / 100);

      imgDragState.current = {
        active:true, kind:'vid', mode:'objpos',
        slideIndex, doc, wrapper: cont, targetEl: video as any,
        contW, contH, natW, natH, dispW: displayW, dispH: displayH,
        minLeft: Math.min(0, contW - displayW),
        minTop:  Math.min(0, contH - displayH),
        left: leftPx, top: topPx, startX: ev.clientX, startY: ev.clientY
      };
    };

    const startBgDrag = async (doc: Document, slideIndex: number, cont: HTMLElement, ev: MouseEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      const cs = doc.defaultView?.getComputedStyle(cont);
      const bg = (cs?.backgroundImage || '').match(/url\(["']?(.+?)["']?\)/i)?.[1];
      if (!bg) return;

      let r = cont.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { await layoutReady(doc); r = cont.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return; }

      const tmp = new Image(); tmp.crossOrigin = 'anonymous'; tmp.src = bg;
      const go = () => {
        const natW = tmp.naturalWidth || r.width, natH = tmp.naturalHeight || r.height;
        const { displayW, displayH } = computeCoverBleed(natW, natH, r.width, r.height, 2);
        const maxX = Math.max(0, displayW - r.width), maxY = Math.max(0, displayH - r.height);
        const toPerc = (v: string) => v.endsWith('%') ? parseFloat(v)/100 : 0.5;
        const posX = cs?.backgroundPositionX || '50%', posY = cs?.backgroundPositionY || '50%';
        const leftPx = -maxX * toPerc(posX), topPx = -maxY * toPerc(posY);

        imgDragState.current = {
          active:true, kind:'bg', mode:'objpos', slideIndex, doc,
          wrapper: cont, targetEl: cont, contW:r.width, contH:r.height,
          natW, natH, dispW:displayW, dispH:displayH,
          minLeft: Math.min(0, r.width - displayW), minTop: Math.min(0, r.height - displayH),
          left: leftPx, top: topPx, startX: ev.clientX, startY: ev.clientY
        };
        logd('start BG', { slideIndex, contW:r.width, contH:r.height, displayW, displayH });
      };
      if (tmp.complete && tmp.naturalWidth) go(); else tmp.onload = go;
    };

    const setupIframe = (ifr: HTMLIFrameElement, slideIndex: number) => {
      const doc = ifr.contentDocument || ifr.contentWindow?.document;
      if (!doc) return;

      const imgsLocal = Array.from(doc.querySelectorAll('img'));
      let imgIdxLocal = 0;
      imgsLocal.forEach((img) => {
        const im = img as HTMLImageElement;
        if (isImgurUrl(im.src) && !im.getAttribute('data-protected')) im.setAttribute('data-protected', 'true');
        if (im.getAttribute('data-protected') !== 'true') {
          im.setAttribute('data-editable', 'image');
          if (!im.id) im.id = `slide-${slideIndex}-img-${imgIdxLocal++}`;
        }
      });
      requestAnimationFrame(() => {
        Array.from(doc.querySelectorAll('img[data-editable="image"]')).forEach((im) => {
          const el = im as HTMLImageElement;
          try { ensureImgCropWrapper(doc, el); } catch {}
        });
      });

      const vids = Array.from(doc.querySelectorAll('video'));
      let vidIdx = 0;
      vids.forEach((v) => {
        (v as HTMLVideoElement).setAttribute('data-editable', 'video');
        if (!v.id) v.id = `slide-${slideIndex}-vid-${vidIdx++}`;
        (v as HTMLVideoElement).style.objectFit = 'cover';
        (v as HTMLVideoElement).style.width = '100%';
        (v as HTMLVideoElement).style.height = '100%';
        try { (v as HTMLVideoElement).pause(); } catch {}
        try { (v as HTMLVideoElement).load(); } catch {}
      });

      postProcessTemplateVideos(doc);
      try { installAltCleanupObserver(doc); } catch {}
      try { cleanupAltArtifacts(doc.body); } catch {}

      try { cleanupAltArtifacts(doc.body); } catch {}
      doc.body.style.visibility = 'visible';

      const onClickCapture = (ev: MouseEvent) => {
        const target = ev.target as HTMLElement | null;
        if (!target) return;

        clearAllSelections();

        const clickedVideo = target.closest('video') as HTMLVideoElement | null;
        if (clickedVideo) {
          clickedVideo.setAttribute('data-editable', 'video');
          clickedVideo.classList.add('selected');
          (clickedVideo as HTMLElement).style.zIndex = '1000';
          setSelectedElement({ slideIndex, element: 'background' });
          setFocusedSlide(slideIndex);
          if (!expandedLayers.has(slideIndex)) setExpandedLayers(s => new Set(s).add(slideIndex));
          const host = (clickedVideo.parentElement as HTMLElement | null);
          if (host) attachResizePinchers(doc, host);
          logc('select video', { slideIndex, id: clickedVideo.id });
          return;
        }

        ev.preventDefault();
        ev.stopPropagation();

        const wrapper = target.closest('.img-crop-wrapper') as HTMLElement | null;
        const clickedImg = (wrapper?.querySelector('img[data-editable="image"]') ??
                            target.closest('img')) as HTMLImageElement | null;

        if (clickedImg) {
          const { wrapper: w } = ensureImgCropWrapper(doc, clickedImg);
          w.setAttribute('data-cv-selected', '1');
          attachResizePinchers(doc, w);
          ensureHostResizeObserver(w);
          normFill(w);
          setSelectedElement({ slideIndex, element: 'background' });
          setFocusedSlide(slideIndex);
          selectedImageRefs.current[slideIndex] = clickedImg;
          if (!expandedLayers.has(slideIndex)) setExpandedLayers(s => new Set(s).add(slideIndex));
          logc('select image', { slideIndex, id: clickedImg.id });
          return;
        }

        const el = target.closest<HTMLElement>('[data-editable]');
        if (!el) return;
        (el as HTMLElement).style.pointerEvents = 'auto';

        const type = el.getAttribute('data-editable');
        if (type === 'title' || type === 'subtitle') {
          el.classList.add('selected');
          (el as HTMLElement).style.zIndex = '1000';
          setSelectedElement({ slideIndex, element: type as any });
          setFocusedSlide(slideIndex);
          if (!expandedLayers.has(slideIndex)) setExpandedLayers(s => new Set(s).add(slideIndex));
          try {
            readAndStoreComputedTextStyles(
              doc,
              slideIndex,
              type as 'title' | 'subtitle',
              setOriginalStyles
            );
          } catch {}
          logc('select text', { slideIndex, type, id: el.id });
        } else if (type === 'video' || type === 'background') {
          el.classList.add('selected');
          (el as HTMLElement).style.zIndex = '1000';
          setSelectedElement({ slideIndex, element: 'background' });
          setFocusedSlide(slideIndex);
          if (!expandedLayers.has(slideIndex)) setExpandedLayers(s => new Set(s).add(slideIndex));
          logc('select bg/video host', { slideIndex, id: el.id, type });
        }
      };

      const onDblClick = (ev: MouseEvent) => {
        const t = ev.target as HTMLElement | null;
        const el = t?.closest<HTMLElement>('[data-editable="title"],[data-editable="subtitle"]');
        if (!el) return;
        ev.preventDefault(); ev.stopPropagation();
        el.setAttribute('contenteditable', 'true');
        (el as HTMLElement).focus();
        const range = doc.createRange(); range.selectNodeContents(el);
        const sel = ifr.contentWindow?.getSelection(); if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      };
      const onBlur = (ev: FocusEvent) => {
        const el = ev.target as HTMLElement;
        if (el?.getAttribute('contenteditable') === 'true') {
          el.setAttribute('contenteditable', 'false');
          updateEditedValue(slideIndex, el.getAttribute('data-editable')!, (el.textContent || ''));
          el.classList.remove('selected');
          el.style.zIndex = '';
        }
      };

      const onMouseDownCapture = (ev: MouseEvent) => {
        if (videoCropState.current?.active) return;
        const t = ev.target as HTMLElement | null;
        if (!t) return;

        const vid = t.closest('video[data-editable="video"]') as HTMLVideoElement | null;
        if (vid) { void startVideoDrag(doc, slideIndex, vid, ev); return; }

        const img = t.closest('img[data-editable="image"]') as HTMLImageElement | null;
        if (img) { void startImgDrag(doc, slideIndex, img, ev); return; }

        const bgEl = t.closest<HTMLElement>('[data-editable="background"], body, div, section, header, main, figure, article');
        if (bgEl) {
          const cs = doc.defaultView?.getComputedStyle(bgEl);
          if (cs?.backgroundImage?.includes('url(')) { void startBgDrag(doc, slideIndex, bgEl, ev); }
        }
      };

      const onMove = (ev: MouseEvent) => {
        const st = imgDragState.current;
        if (!st || !st.active) return;
        if (st.doc !== doc) return;

        if (st.kind === 'img') {
          const dx = ev.clientX - st.startX;
          const dy = ev.clientY - st.startY;
          const nextLeft = clamp(st.left + dx, st.minLeft, 0);
          const nextTop  = clamp(st.top  + dy, st.minTop,  0);

          const maxOffsetX = Math.max(0, st.dispW - st.contW);
          const maxOffsetY = Math.max(0, st.dispH - st.contH);
          const xPerc = maxOffsetX ? (-nextLeft / maxOffsetX) * 100 : 50;
          const yPerc = maxOffsetY ? (-nextTop  / maxOffsetY) * 100 : 50;
          (st.targetEl as HTMLImageElement).style.objectPosition = `${xPerc}% ${yPerc}%`;
          return;
        }

        if (st.kind === 'vid') {
          const dx = ev.clientX - st.startX;
          const dy = ev.clientY - st.startY;
          const nextLeft = clamp(st.left + dx, st.minLeft, 0);
          const nextTop  = clamp(st.top  + dy, st.minTop,  0);
          const maxOffsetX = Math.max(0, st.dispW - st.contW);
          const maxOffsetY = Math.max(0, st.dispH - st.contH);
          const xPerc = maxOffsetX ? (-nextLeft / maxOffsetX) * 100 : 50;
          const yPerc = maxOffsetY ? (-nextTop  / maxOffsetY) * 100 : 50;
          (st.targetEl as HTMLVideoElement).style.objectPosition = `${xPerc}% ${yPerc}%`;
          return;
        }

        if (st.kind === 'bg') {
          const dx = ev.clientX - st.startX;
          const dy = ev.clientY - st.startY;
          const nextLeft = clamp(st.left + dx, st.minLeft, 0);
          const nextTop  = clamp(st.top  + dy, st.minTop,  0);
          const maxOffsetX = Math.max(0, st.dispW - st.contW);
          const maxOffsetY = Math.max(0, st.dispH - st.contH);
          const xPerc = maxOffsetX ? (-nextLeft / maxOffsetX) * 100 : 50;
          const yPerc = maxOffsetY ? (-nextTop  / maxOffsetY) * 100 : 50;
          (st.targetEl as HTMLElement).style.setProperty('background-position-x', `${xPerc}%`, 'important');
          (st.targetEl as HTMLElement).style.setProperty('background-position-y', `${yPerc}%`, 'important');
          return;
        }
      };

      const onUp = () => {
        if (imgDragState.current?.active && imgDragState.current.doc === doc) {
          if (imgDragState.current.kind === 'img' && imgDragState.current.mode === 'objpos') {
            const el = imgDragState.current.targetEl as HTMLImageElement;
            el.removeAttribute('data-cv-left');
            el.removeAttribute('data-cv-top');
          }
          logd('end IMG/BG', { slideIndex: imgDragState.current.slideIndex });
          imgDragState.current = null;
        }
      };

      const cleanupDrag = () => { if (imgDragState.current?.doc === doc) imgDragState.current = null; };

      doc.addEventListener('click', onClickCapture, true);
      doc.addEventListener('dblclick', onDblClick, true);
      doc.addEventListener('blur', onBlur, true);
      doc.addEventListener('mousedown', onMouseDownCapture, true);
      doc.addEventListener('mousemove', onMove);
      doc.addEventListener('mouseup', onUp);
      ifr.contentWindow?.addEventListener('blur', cleanupDrag);
      doc.addEventListener('mouseleave', cleanupDrag);

      disposers.push(() => {
        try { doc.removeEventListener('click', onClickCapture, true); } catch {}
        try { doc.removeEventListener('dblclick', onDblClick, true); } catch {}
        try { doc.removeEventListener('blur', onBlur, true); } catch {}
        try { doc.removeEventListener('mousedown', onMouseDownCapture, true); } catch {}
        try { doc.removeEventListener('mousemove', onMove); } catch {}
        try { doc.removeEventListener('mouseup', onUp); } catch {}
        try { ifr.contentWindow?.removeEventListener('blur', cleanupDrag); } catch {}
        try { doc.removeEventListener('mouseleave', cleanupDrag); } catch {}
      });

      logb('delegation wired', { slideIndex });
    };

    iframeRefs.current.forEach((ifr, idx) => { if (ifr) setTimeout(() => setupIframe(ifr, idx), 30); });
    return () => { disposers.forEach(d => d()); };
  }, [renderedSlides, expandedLayers, elementStyles]);

  /** ===== Layers ===== */
  const toggleLayer = (index: number) => {
    const s = new Set(expandedLayers);
    s.has(index) ? s.delete(index) : s.add(index);
    setExpandedLayers(s);
  };

  const handleSlideClick = (index: number) => {
    clearAllSelections();
    setFocusedSlide(index);
    setSelectedElement({ slideIndex: index, element: null });
    selectedImageRefs.current[index] = null;

    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = index * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
  };

  const handleElementClick = (slideIndex: number, element: ElementType) => {
    setIsLoadingProperties(true);

    clearAllSelections();

    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;

    if (doc && element) {
      const target = doc.getElementById(`slide-${slideIndex}-${element}`);
      if (target) {
        target.classList.add('selected');
        (target as HTMLElement).style.zIndex = '1000';
      } else if (element === 'background') {
        doc.body.classList.add('selected');
        (doc.body as HTMLElement).style.zIndex = '1000';
      }

      if (element === 'title' || element === 'subtitle') {
        try {
          readAndStoreComputedTextStyles(
            doc,
            slideIndex,
            element as 'title' | 'subtitle',
            setOriginalStyles
          );
        } catch {}
      }
    }

    setSelectedElement({ slideIndex, element });
    setFocusedSlide(slideIndex);
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setTimeout(() => setIsLoadingProperties(false), 80);
  };

  /** ===== State helpers ===== */
  const getElementKey = (slideIndex: number, element: ElementType) => `${slideIndex}-${element}`;
  const getEditedValue = (slideIndex: number, field: string, def: any) => {
    const k = `${slideIndex}-${field}`;
    return editedContent[k] !== undefined ? editedContent[k] : def;
  };
  const updateEditedValue = (slideIndex: number, field: string, value: any) => {
    const k = `${slideIndex}-${field}`;
    setEditedContent(prev => ({ ...prev, [k]: value }));
  };
  const getElementStyle = (slideIndex: number, element: ElementType): ElementStyles => {
    const k = getElementKey(slideIndex, element);
    if (elementStyles[k]) return elementStyles[k];
    if (originalStyles[k]) return originalStyles[k];
    return { fontSize: element === 'title' ? '24px' : '16px', fontWeight: element === 'title' ? '700' : '400', textAlign: 'left', color: '#FFFFFF' };
    };
  const updateElementStyle = (slideIndex: number, element: ElementType, prop: keyof ElementStyles, value: string) => {
    const k = getElementKey(slideIndex, element);
    setElementStyles(prev => ({ ...prev, [k]: { ...getElementStyle(slideIndex, element), [prop]: value } }));
  };

  /** ===== BG change / Upload / Busca ===== */
  const handleBackgroundImageChange = (slideIndex: number, imageUrl: string) => {
    const ifr = iframeRefs.current[slideIndex];
    const d = ifr?.contentDocument || ifr?.contentWindow?.document;
    if (!d) {
      updateEditedValue(slideIndex, 'background', imageUrl);
      return;
    }

    const selectedImg = selectedImageRefs.current[slideIndex];
    if (selectedImg) {
      try {
        if (isVideoUrl(imageUrl)) {
          const { wrapper } = ensureImgCropWrapper(d, selectedImg);
          const video = d.createElement('video');
          video.src = imageUrl;
          video.setAttribute('data-editable', 'video');
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;
          video.loop = true;
          video.autoplay = false;
          video.preload = 'metadata';
          try { video.pause(); } catch {}
          video.style.objectFit = 'cover';
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.position = 'absolute';
          (video.style as any).inset = '0';

          killPlayOverlays(wrapper);
          wrapper.replaceChild(video, selectedImg);
          forceVideoStyle(video);
          try { video.load(); } catch {}
          attachPlayOverlay(d, wrapper, video);
          ensureHostResizeObserver(wrapper);
          normFill(wrapper);

          cleanupAltArtifacts(wrapper);
          queueMicrotask(() => { try { cleanupAltArtifacts(wrapper); } catch {} });

          selectedImageRefs.current[slideIndex] = null;
          wrapper.removeAttribute('data-cv-selected');
          video.classList.add('selected');
        } else {
          selectedImg.removeAttribute('srcset');
          selectedImg.removeAttribute('sizes');
          selectedImg.loading = 'eager';
          selectedImg.src = imageUrl;
          selectedImg.setAttribute('data-bg-image-url', imageUrl);

          const { wrapper } = ensureImgCropWrapper(d, selectedImg);
          wrapper.setAttribute('data-cv-selected', '1');
          killPlayOverlays(wrapper);
          removeAllPlayOverlays(d);
          cleanupAltArtifacts(wrapper);
          queueMicrotask(() => { try { cleanupAltArtifacts(wrapper); } catch {} });
          ensureHostResizeObserver(wrapper);
          normFill(wrapper);
        }
      } catch {}
    } else {
      const updatedEl = applyBackgroundImageImmediate(slideIndex, imageUrl, iframeRefs.current);
      clearAllSelections();
      if (updatedEl) {
        if ((updatedEl as HTMLElement).tagName === 'IMG') {
          const { wrapper } = ensureImgCropWrapper(d!, updatedEl as HTMLImageElement);
          wrapper.setAttribute('data-cv-selected', '1');
          selectedImageRefs.current[slideIndex] = updatedEl as HTMLImageElement;
          killPlayOverlays(wrapper);
          removeAllPlayOverlays(d!);
          cleanupAltArtifacts(wrapper);
          queueMicrotask(() => { try { cleanupAltArtifacts(wrapper); } catch {} });
          ensureHostResizeObserver(wrapper);
          normFill(wrapper);
        } else {
          selectedImageRefs.current[slideIndex] = null;
          const isVideoNow = isVideoUrl(imageUrl);
          if (!isVideoNow) removeAllPlayOverlays(d!);
          if ((updatedEl as HTMLElement)) { ensureHostResizeObserver(updatedEl as HTMLElement); normFill(updatedEl as HTMLElement); }
        }
      }
    }

    try {
      const d2 = iframeRefs.current[slideIndex]?.contentDocument || iframeRefs.current[slideIndex]?.contentWindow?.document;
      if (d2 && !isVideoUrl(imageUrl)) killPlayOverlays(d2.body);
    } catch {}

    setSelectedElement({ slideIndex, element: 'background' });
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setFocusedSlide(slideIndex);
    updateEditedValue(slideIndex, 'background', imageUrl);

    setTimeout(() => {
      try {
        const ev = new Event('cv-rebind');
        d?.dispatchEvent(ev);
      } catch {}
    }, 50);
  };

  /** ===== Busca ===== */
  const handleSearchImages = async () => {
    if (!searchKeyword.trim()) return;
    setIsSearching(true);
    const id = ++lastSearchId.current;
    try {
      const imageUrls = await searchImages(searchKeyword);
      if (id === lastSearchId.current) setSearchResults(imageUrls);
    } catch (e) {
      console.error(e);
    } finally {
      if (id === lastSearchId.current) setIsSearching(false);
    }
  };

  /** ===== Upload ===== */
  const handleImageUpload = (slideIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setUploadedImages(prev => ({ ...prev, [slideIndex]: url }));
      handleBackgroundImageChange(slideIndex, url);
    };
    reader.readAsDataURL(file);
  };

  /** ===== Download ===== */
  const handleDownloadAll = () => {
    renderedSlides.forEach((slide, index) => {
      const blob = new Blob([slide], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `slide-${index + 1}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  /** ===== Render ===== */
  return (
    <div className="fixed top-14 left-16 right-0 bottom-0 bg-neutral-900 flex" style={{ zIndex: 99 }}>
      {/* Sidebar esquerda */}
      <div className="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col">
        <div className="h-14 border-b border-neutral-800 flex items-center px-4">
          <LayersIcon className="w-4 h-4 text-neutral-400 mr-2" />
          <h3 className="text-white font-medium text-sm">Layers</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {slides.map((_, index) => {
            const conteudo = carouselData.conteudos[index];
            const isExpanded = expandedLayers.has(index);
            const isFocused = focusedSlide === index;
            return (
              <div key={index} className={`border-b border-neutral-800 ${isFocused ? 'bg-neutral-900' : ''}`}>
                <button
                  onClick={() => { const s = new Set(expandedLayers); s.has(index) ? s.delete(index) : s.add(index); setExpandedLayers(s); handleSlideClick(index); }}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-900 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    {isExpanded ? <ChevronDown className="w-3 h-3 text-neutral-500" /> : <ChevronRight className="w-3 h-3 text-neutral-500" />}
                    <LayersIcon className="w-3 h-3 text-blue-400" />
                    <span className="text-white text-sm">Slide {index + 1}</span>
                  </div>
                </button>
                {isExpanded && conteudo && (
                  <div className="ml-3 border-l border-neutral-800">
                    <button
                      onClick={() => handleElementClick(index, 'background')}
                      className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                        selectedElement.slideIndex === index && selectedElement.element === 'background' ? 'bg-neutral-800' : ''
                      }`}
                    >
                      <ImageIcon className="w-4 h-4 text-neutral-500" />
                      <span className="text-neutral-300 text-xs">Background Image/Video</span>
                    </button>
                    <button
                      onClick={() => handleElementClick(index, 'title')}
                      className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                        selectedElement.slideIndex === index && selectedElement.element === 'title' ? 'bg-neutral-800' : ''
                      }`}
                    >
                      <Type className="w-4 h-4 text-neutral-500" />
                      <span className="text-neutral-300 text-xs">Title</span>
                    </button>
                    {conteudo.subtitle && (
                      <button
                        onClick={() => handleElementClick(index, 'subtitle')}
                        className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                          selectedElement.slideIndex === index && selectedElement.element === 'subtitle' ? 'bg-neutral-800' : ''
                        }`}
                      >
                        <Type className="w-4 h-4 text-neutral-500" />
                        <span className="text-neutral-300 text-xs">Subtitle</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Área principal */}
      <div className="flex-1 flex flex-col">
        {/* TopBar */}
        <div className="h-14 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-white font-semibold">Carousel Editor</h2>
            <div className="text-neutral-500 text-sm">{slides.length} slides</div>
          </div>
        <div className="flex items-center space-x-2">
            <button
              onClick={() => setZoom(p => Math.max(0.1, p - 0.1))}
              className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="bg-neutral-800 text-white px-3 py-1.5 rounded text-xs min-w-[70px] text-center">{Math.round(zoom * 100)}%</div>
            <button
              onClick={() => setZoom(p => Math.min(2, p + 0.1))}
              className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-neutral-800 mx-2" />
            <button
              onClick={handleDownloadAll}
              className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded transition-colors flex items-center space-x-2 text-sm"
              title="Download All Slides"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
            <button
              onClick={onClose}
              className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canvas principal */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative bg-neutral-800"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onWheel={(e) => {
            e.preventDefault();
            const container = containerRef.current!;
            const rect = container.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left - pan.x) / zoom;
            const mouseY = (e.clientY - rect.top  - pan.y) / zoom;

            if (e.ctrlKey) {
              const delta = e.deltaY > 0 ? -0.05 : 0.05;
              const newZoom = Math.min(Math.max(0.1, zoom + delta), 2);
              setZoom(newZoom);
              setPan({
                x: e.clientX - rect.left - mouseX * newZoom,
                y: e.clientY - rect.top  - mouseY * newZoom,
              });
            } else {
              setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
            }
          }}
          onMouseDown={(e) => {
            if (e.button === 0 && e.currentTarget === e.target) {
              setIsDragging(true);
              setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            }
          }}
          onMouseMove={(e) => {
            if (isDragging) {
              setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
            }
          }}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        >
          <div
            className="absolute"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.3s ease-out',
              left: '50%',
              top: '50%',
              marginLeft: `-${(slideWidth * slides.length + gap * (slides.length - 1)) / 2}px`,
              marginTop: `-${slideHeight / 2}px`,
              zIndex: 1,
            }}
          >
            <div className="flex items-start" style={{ gap: `${gap}px` }}>
              {renderedSlides.map((slide, i) => (
                <div
                  key={i}
                  className={`relative bg-white rounded-lg shadow-2xl overflow-hidden flex-shrink-0 transition-all ${focusedSlide === i ? 'ring-4 ring-blue-500' : ''}`}
                  style={{ width: `${slideWidth}px`, height: `${slideHeight}px` }}
                >
                  <iframe
                    ref={(el) => (iframeRefs.current[i] = el)}
                    srcDoc={slide}
                    className="w-full h-full border-0"
                    title={`Slide ${i + 1}`}
                    sandbox="allow-same-origin allow-scripts allow-autoplay"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* HUD de zoom */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-neutral-950/90 backdrop-blur-sm text-neutral-400 px-3 py-1.5 rounded text-xs z-[2]">
            Zoom: {Math.round(zoom * 100)}%
          </div>
        </div>
      </div>

      {/* Sidebar direita */}
      <div className="w-80 bg-neutral-950 border-l border-neutral-800 flex flex-col">
        <div className="h-14 border-b border-neutral-800 flex items-center px-4">
          <h3 className="text-white font-medium text-sm">Properties</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {selectedElement.element === null ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mb-4">
                <Type className="w-8 h-8 text-neutral-700" />
              </div>
              <h4 className="text-white font-medium mb-2">No Element Selected</h4>
              <p className="text-neutral-500 text-sm mb-1">Click on an element in the preview</p>
              <p className="text-neutral-500 text-sm">to edit its properties</p>
              <div className="mt-6 space-y-2 text-xs text-neutral-600">
                <p>• Single click to select</p>
                <p>• Double click text to edit inline</p>
                <p>• Press ESC to deselect</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {(selectedElement.element === 'title' || selectedElement.element === 'subtitle') && (
                <>
                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Text Content</label>
                    <textarea
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-blue-500 transition-colors"
                      rows={selectedElement.element === 'title' ? 4 : 3}
                      value={(() => {
                        const v = carouselData.conteudos[selectedElement.slideIndex]?.[selectedElement.element] || '';
                        return editedContent[`${selectedElement.slideIndex}-${selectedElement.element}`] ?? v;
                      })()}
                      onChange={(e) => updateEditedValue(selectedElement.slideIndex, selectedElement.element!, e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Font Size</label>
                    <input
                      type="text"
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={getElementStyle(selectedElement.slideIndex, selectedElement.element).fontSize}
                      onChange={(e) => updateElementStyle(selectedElement.slideIndex, selectedElement.element!, 'fontSize', e.target.value)}
                      placeholder="e.g. 24px, 1.5rem"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Font Weight</label>
                    <select
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={getElementStyle(selectedElement.slideIndex, selectedElement.element).fontWeight}
                      onChange={(e) => updateElementStyle(selectedElement.slideIndex, selectedElement.element!, 'fontWeight', e.target.value)}
                    >
                      <option value="300">Light (300)</option>
                      <option value="400">Regular (400)</option>
                      <option value="500">Medium (500)</option>
                      <option value="600">Semi Bold (600)</option>
                      <option value="700">Bold (700)</option>
                      <option value="800">Extra Bold (800)</option>
                      <option value="900">Black (900)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Text Align</label>
                    <select
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={getElementStyle(selectedElement.slideIndex, selectedElement.element).textAlign}
                      onChange={(e) => updateElementStyle(selectedElement.slideIndex, selectedElement.element!, 'textAlign', e.target.value)}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                      <option value="justify">Justify</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Color</label>
                    <div className="flex space-x-2">
                      <input
                        type="color"
                        className="w-12 h-10 bg-neutral-900 border border-neutral-800 rounded cursor-pointer"
                        value={getElementStyle(selectedElement.slideIndex, selectedElement.element).color}
                        onChange={(e) => updateElementStyle(selectedElement.slideIndex, selectedElement.element!, 'color', e.target.value)}
                      />
                      <input
                        type="text"
                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        value={getElementStyle(selectedElement.slideIndex, selectedElement.element).color}
                        onChange={(e) => updateElementStyle(selectedElement.slideIndex, selectedElement.element!, 'color', e.target.value)}
                        placeholder="#FFFFFF"
                      />
                    </div>
                  </div>
                </>
              )}

              {selectedElement.element === 'background' && (
                <>
                  {isLoadingProperties ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <label className="text-neutral-400 text-xs mb-2 block font-medium">Background Image/Video</label>
                      </div>

                      <div className="space-y-2">
                        {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo && (() => {
                          const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo;
                          const isVid = isVideoUrl(bgUrl);
                          const thumb = carouselData.conteudos[selectedElement.slideIndex]?.thumbnail_url;
                          const displayUrl = isVid && thumb ? thumb : bgUrl;
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', bgUrl);
                          return (
                            <div
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}
                            >
                              <div className="text-neutral-400 text-xs mb-1 flex items-center justify-between">
                                <span>{isVid ? 'Video 1' : 'Image 1'}</span>
                                {isVid && <Play className="w-3 h-3" />}
                              </div>
                              <div className="relative">
                                <img src={displayUrl} alt="Background 1" className="w-full h-24 object-cover rounded" />
                                {isVid && <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded"><Play className="w-8 h-8 text-white" fill="white" /></div>}
                              </div>
                            </div>
                          );
                        })()}

                        {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo2 && (() => {
                          const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo2!;
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                          const isVid = isVideoUrl(bgUrl);
                          return (
                            <div
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}
                            >
                              <div className="text-neutral-400 text-xs mb-1">{isVid ? 'Video 2' : 'Image 2'}</div>
                              <img src={bgUrl} alt="Background 2" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}

                        {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3 && (() => {
                          const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3!;
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                          const isVid = isVideoUrl(bgUrl);
                          return (
                            <div
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}
                            >
                              <div className="text-neutral-400 text-xs mb-1">{isVid ? 'Video 3' : 'Image 3'}</div>
                              <img src={bgUrl} alt="Background 3" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}

                        {uploadedImages[selectedElement.slideIndex] && (() => {
                          const bgUrl = uploadedImages[selectedElement.slideIndex];
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                          return (
                            <div
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}
                            >
                              <div className="text-neutral-400 text-xs mb-1">Image 4 (Uploaded)</div>
                              <img src={bgUrl} alt="Background 4 (Uploaded)" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}
                      </div>

                      <div className="mt-3">
                        <label className="text-neutral-400 text-xs mb-2 block font-medium">Search Images</label>
                        <div className="relative">
                          <input
                            type="text"
                            className="w-full bg-neutral-900 border border-neutral-800 rounded pl-10 pr-20 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                            placeholder="Search for images..."
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearchImages(); }}
                          />
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500" />
                          <button
                            onClick={handleSearchImages}
                            disabled={isSearching || !searchKeyword.trim()}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white px-3 py-1 rounded text-xs transition-colors"
                          >
                            {isSearching ? 'Searching...' : 'Search'}
                          </button>
                        </div>
                        {searchResults.length > 0 && (
                          <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                            {searchResults.map((imageUrl, index) => {
                              const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                              return (
                                <div
                                  key={index}
                                  className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === imageUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                                  onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, imageUrl)}
                                >
                                  <div className="text-neutral-400 text-xs mb-1">Search Result {index + 1}</div>
                                  <img src={imageUrl} alt={`Search result ${index + 1}`} className="w-full h-24 object-cover rounded" />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="mt-3">
                        <label className="text-neutral-400 text-xs mb-2 block font-medium">Upload Image (Image 4)</label>
                        <label className="flex items-center justify-center w/full h-24 bg-neutral-900 border-2 border-dashed border-neutral-800 rounded cursor-pointer hover:border-blue-500 transition-colors">
                          <div className="flex flex-col items-center">
                            <Upload className="w-6 h-6 text-neutral-500 mb-1" />
                            <span className="text-neutral-500 text-xs">Click to upload</span>
                          </div>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(selectedElement.slideIndex, e)} />
                        </label>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CarouselViewer;