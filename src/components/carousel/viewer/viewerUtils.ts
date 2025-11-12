/**
 * viewerUtils.ts
 * 
 * Funções auxiliares extraídas do CarouselViewer para melhor modularidade.
 * Inclui: DOM helpers, overlays, pinças de redimensionamento, aplicação de bg/media.
 */

import type { ElementStyles } from '../../../types/carousel';

/** ========= LOG ========= */
const LOG = true;
export const log = (...a: any[]) => { if (LOG) console.log('[CV]', ...a); };
export const logc = (...a: any[]) => { if (LOG) console.log('[CV-CLICK]', ...a); };
export const logd = (...a: any[]) => { if (LOG) console.log('[CV-DRAG]', ...a); };
export const logb = (...a: any[]) => { if (LOG) console.log('[CV-BIND]', ...a); };

/** ========= Utils ========= */
export const isVideoUrl = (url: string): boolean => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
export const isImgurUrl = (url: string): boolean => url.includes('i.imgur.com');

/** ========= Math ========= */
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const computeCoverBleed = (natW: number, natH: number, contW: number, contH: number, bleedPx = 2) => {
  const scale = Math.max(contW / natW, contH / natH);
  const displayW = Math.ceil(natW * scale) + bleedPx;
  const displayH = Math.ceil(natH * scale) + bleedPx;
  return { displayW, displayH };
};

/** ========= Drag State Types ========= */
export type ImgDragState = {
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

export type VideoCropState = {
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

/** ========= DOM Helpers ========= */
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
  const el = doc.getElementById(id) as HTMLElement | null;
  if (!el) return;
  const computed = extractTextStyles(doc, el);
  setOriginalStylesFn(prev => ({ ...prev, [`${slideIndex}-${key}`]: computed }));
};

/** ========= Limpa alt lixo (deep) ========= */
export const cleanupAltArtifacts = (host: HTMLElement) => {
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

/** ========= Observador global p/ matar "alt" assim que surge ========= */
export const installAltCleanupObserver = (doc: Document) => {
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

/** ========= BG helpers ========= */
export const getBgElements = (doc: Document) =>
  Array.from(doc.querySelectorAll<HTMLElement>('body,div,section,header,main,figure,article'))
    .filter(el => {
      const cs = doc.defaultView?.getComputedStyle(el);
      // Inclui elementos com url() OU linear-gradient() no background-image
      return !!cs && cs.backgroundImage && (
        cs.backgroundImage.includes('url(') || 
        cs.backgroundImage.includes('linear-gradient(')
      );
    });

export const findLargestVisual = (doc: Document): { type: 'img' | 'bg' | 'vid', el: HTMLElement } | null => {
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
export const forceVideoStyle = (v: HTMLVideoElement) => {
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

export const removeAllPlayOverlays = (doc: Document) => {
  doc.querySelectorAll('.cv-play-overlay').forEach(n => n.remove());
};

export const killPlayOverlays = (root: ParentNode | null) => {
  if (!root) return;
  root.querySelectorAll?.('.cv-play-overlay')?.forEach(n => n.remove());
  const vids = (root as ParentNode).querySelectorAll?.('video') || [];
  vids.forEach((v: any) => {
    const entry = playOverlayMap.get(v as HTMLVideoElement);
    if (entry) { try { entry.abort.abort(); } catch {} playOverlayMap.delete(v as HTMLVideoElement); }
  });
};

export const safeUserPlay = (video: HTMLVideoElement) => {
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

export const attachPlayOverlay = (doc: Document, host: HTMLElement, video: HTMLVideoElement) => {
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

/** ========= Overlay root ========= */
export const ensureOverlayRoot = (doc: Document) => {
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

export const rectInViewport = (el: HTMLElement) => el.getBoundingClientRect();

/** ========= ensureImgCropWrapper ========= */
export const ensureImgCropWrapper = (doc: Document, img: HTMLImageElement): { wrapper: HTMLElement, contW:number, contH:number } => {
  const rectNow = img.getBoundingClientRect();
  let initialW = rectNow.width || (img as any).offsetWidth || img.naturalWidth || 0;
  let initialH = rectNow.height || (img as any).offsetHeight || img.naturalHeight || 0;

  const cs = doc.defaultView?.getComputedStyle(img);
  const originalDisplay = cs?.display || 'inline-block';
  
  // Captura TODOS os estilos visuais importantes do elemento original E do wrapper pai
  const parentEl = img.parentElement;
  const parentCs = parentEl ? doc.defaultView?.getComputedStyle(parentEl) : null;
  
  // Preserva estilos do elemento OU do container pai (prioriza elemento)
  const preservedStyles = {
    borderRadius: cs?.borderRadius || parentCs?.borderRadius || '',
    boxShadow: cs?.boxShadow || parentCs?.boxShadow || '',
    // IMPORTANTE: captura margin do próprio elemento img primeiro (ex: .text-box img tem margin-top)
    marginTop: cs?.marginTop || parentCs?.marginTop || '',
    marginBottom: cs?.marginBottom || parentCs?.marginBottom || '',
    marginLeft: cs?.marginLeft || parentCs?.marginLeft || '',
    marginRight: cs?.marginRight || parentCs?.marginRight || '',
  };

  let wrapper = img.parentElement;
  if (!wrapper || !wrapper.classList.contains('img-crop-wrapper')) {
    const w = doc.createElement('div');
    w.className = 'img-crop-wrapper media';
    w.style.display  = originalDisplay;
    w.style.position = 'relative';
    w.style.setProperty('overflow', 'hidden', 'important');
    
    // IMPORTANTE: Remove transformações que possam interferir no drag
    w.style.transform = 'none';
    w.style.filter = 'none';
    
    // Preserva o container pai original se existir
    const originalParent = img.parentElement;
    if (img.parentNode) img.parentNode.replaceChild(w, img);
    w.appendChild(img);
    wrapper = w;
    
    // Copia classes do elemento original para o wrapper se tiver
    if (originalParent && originalParent.className) {
      const classes = originalParent.className.split(' ').filter(c => !c.includes('selected') && c !== 'img-crop-wrapper');
      classes.forEach(c => w.classList.add(c));
    }
  } else {
    (wrapper as HTMLElement).style.position = (wrapper as HTMLElement).style.position || 'relative';
    (wrapper as HTMLElement).style.setProperty('overflow', 'hidden', 'important');
    // Remove transformações do wrapper existente também
    (wrapper as HTMLElement).style.transform = 'none';
    (wrapper as HTMLElement).style.filter = 'none';
  }
  
  // Aplica os estilos preservados ao wrapper
  if (preservedStyles.borderRadius && preservedStyles.borderRadius !== '0px') {
    (wrapper as HTMLElement).style.borderRadius = preservedStyles.borderRadius;
    (wrapper as HTMLElement).setAttribute('data-original-border-radius', preservedStyles.borderRadius);
  }
  if (preservedStyles.boxShadow && preservedStyles.boxShadow !== 'none') {
    (wrapper as HTMLElement).style.boxShadow = preservedStyles.boxShadow;
  }
  if (preservedStyles.marginTop && preservedStyles.marginTop !== '0px') {
    (wrapper as HTMLElement).style.marginTop = preservedStyles.marginTop;
    (wrapper as HTMLElement).setAttribute('data-original-margin-top', preservedStyles.marginTop);
  }
  if (preservedStyles.marginBottom && preservedStyles.marginBottom !== '0px') {
    (wrapper as HTMLElement).style.marginBottom = preservedStyles.marginBottom;
  }
  if (preservedStyles.marginLeft && preservedStyles.marginLeft !== '0px') {
    (wrapper as HTMLElement).style.marginLeft = preservedStyles.marginLeft;
  }
  if (preservedStyles.marginRight && preservedStyles.marginRight !== '0px') {
    (wrapper as HTMLElement).style.marginRight = preservedStyles.marginRight;
  }

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
export const ensureHostResizeObserver = (host: HTMLElement) => {
  if ((host as any).__cvRO) return;
  const ro = new ResizeObserver(() => {
    // Restaura estilos preservados antes de aplicar novos
    const originalBorderRadius = host.getAttribute('data-original-border-radius');
    if (originalBorderRadius) {
      host.style.borderRadius = originalBorderRadius;
    }
    
    const originalMarginTop = host.getAttribute('data-original-margin-top');
    if (originalMarginTop) {
      host.style.marginTop = originalMarginTop;
    }
    
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
export type PinchersHandle = { dispose: () => void };

declare global {
  interface Document {
    __cvActivePinchersHost?: HTMLElement | null;
  }
}

export const disposePinchersInDoc = (doc: Document) => {
  const prev = (doc as any).__cvActivePinchersHost as (HTMLElement | null);
  if (prev && (prev as any).__cvPinchers) {
    try { (prev as any).__cvPinchers.dispose(); } catch {}
  }
  (doc as any).__cvActivePinchersHost = null;
};

/** ========= Pinças (overlay fixo) ========= */
export const attachResizePinchers = (doc: Document, host: HTMLElement) => {
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
    
    // Sincroniza o conteúdo com o container ao inicializar
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
    
    // Força reflow
    host.offsetHeight;
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
    
    // Sincroniza o conteúdo com o novo tamanho do container
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
    
    // Força reflow para garantir que as mudanças sejam aplicadas
    host.offsetHeight;
    
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
export const normFill = (host: HTMLElement) => {
  // Restaura estilos preservados
  const originalBorderRadius = host.getAttribute('data-original-border-radius');
  if (originalBorderRadius) {
    host.style.borderRadius = originalBorderRadius;
  }
  
  const originalMarginTop = host.getAttribute('data-original-margin-top');
  if (originalMarginTop) {
    host.style.marginTop = originalMarginTop;
  }
  
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

/** ========= Sincronizar redimensionamento de container e conteúdo ========= */
export const syncContainerWithContent = (container: HTMLElement, content: HTMLImageElement | HTMLVideoElement) => {
  const isVideo = content.tagName === 'VIDEO';
  
  // Verificar se o container já tem um tamanho fixo definido (data-cv-height)
  const hasFixedSize = container.hasAttribute('data-cv-height');
  
  // Garante que container e conteúdo tenham a mesma estrutura de posicionamento
  container.style.position = container.style.position || 'relative';
  container.style.overflow = 'hidden';
  
  if (isVideo) {
    // Para vídeos: vídeo preenche o container
    // Vídeo em modo absolute para preencher todo o container
    content.style.setProperty('position', 'absolute', 'important');
    (content.style as any).inset = '0';
    content.style.setProperty('width', '100%', 'important');
    content.style.setProperty('height', '100%', 'important');
    content.style.setProperty('object-fit', 'cover', 'important');
    
    // Só ajusta tamanho do container se NÃO tiver tamanho fixo definido
    if (!hasFixedSize) {
      // Para vídeos, usa altura padrão de 450px (não 100%)
      container.style.setProperty('width', '100%', 'important');
      container.style.setProperty('height', '450px', 'important');
      container.setAttribute('data-cv-height', '450');
    }
  } else {
    // Para imagens: imagem preenche o container
    const img = content as HTMLImageElement;
    
    // Aplica estilos da imagem
    img.style.removeProperty('position'); // Imagens não precisam de absolute
    img.style.setProperty('width', '100%', 'important');
    img.style.setProperty('height', '100%', 'important');
    img.style.setProperty('object-fit', 'cover', 'important');
    
    // Só ajusta altura do container se NÃO tiver tamanho fixo definido
    if (!hasFixedSize) {
      const applyImageHeight = () => {
        const naturalHeight = img.naturalHeight || 450;
        container.style.setProperty('width', '100%', 'important');
        container.style.setProperty('height', `${naturalHeight}px`, 'important');
        container.setAttribute('data-cv-height', String(naturalHeight));
      };
      
      if (img.complete && img.naturalHeight > 0) {
        applyImageHeight();
      } else {
        img.onload = applyImageHeight;
      }
    }
  }
  
  // Força recálculo do layout
  container.offsetHeight; // Trigger reflow
};

/** ========= APPLY BG / MEDIA ========= */
export const applyBackgroundImageImmediate = (
  slideIndex: number,
  mediaUrl: string,
  iframeRefs: (HTMLIFrameElement | null)[]
): HTMLElement | null => {
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
        // Preserva linear-gradient existente ao trocar a URL
        // Lê do estilo computado para pegar gradients definidos no template original
        const win = cont.ownerDocument?.defaultView || window;
        const computedBg = win.getComputedStyle(cont).backgroundImage || '';
        const currentBgImage = computedBg !== 'none' ? computedBg : '';
        let newBgImage = `url('${mediaUrl}')`;
        
        // Se já tem linear-gradient, substitui apenas a url() mantendo o gradient
        if (currentBgImage.includes('linear-gradient') && currentBgImage.includes('url(')) {
          newBgImage = currentBgImage.replace(/url\([^)]+\)/g, `url('${mediaUrl}')`);
        } else if (currentBgImage.includes('linear-gradient')) {
          // Se tem gradient mas sem url, adiciona a url após o gradient
          newBgImage = currentBgImage + `, url('${mediaUrl}')`;
        }
        
        cont.style.setProperty('background-image', newBgImage, 'important');
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
    // Preserva linear-gradient existente ao trocar a URL do body
    // Lê do estilo computado para pegar gradients definidos no template original
    const win = doc.defaultView || window;
    const computedBg = win.getComputedStyle(doc.body).backgroundImage || '';
    const currentBgImage = computedBg !== 'none' ? computedBg : '';
    let newBgImage = `url('${mediaUrl}')`;
    
    // Se já tem linear-gradient, substitui apenas a url() mantendo o gradient
    if (currentBgImage.includes('linear-gradient') && currentBgImage.includes('url(')) {
      newBgImage = currentBgImage.replace(/url\([^)]+\)/g, `url('${mediaUrl}')`);
    } else if (currentBgImage.includes('linear-gradient')) {
      // Se tem gradient mas sem url, adiciona a url após o gradient
      newBgImage = currentBgImage + `, url('${mediaUrl}')`;
    }
    
    doc.documentElement.style.setProperty('background-color', 'black', 'important');
    doc.body.style.setProperty('background-color', 'black', 'important');
    doc.body.style.setProperty('background-image', newBgImage, 'important');
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
export const layoutReady = (doc: Document) => new Promise<void>(r => {
  requestAnimationFrame(() => { void doc.body?.getBoundingClientRect(); r(); });
});
