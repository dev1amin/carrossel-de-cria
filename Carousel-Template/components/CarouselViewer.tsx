import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  X, ZoomIn, ZoomOut, Download, ChevronDown, ChevronRight, Layers,
  Image as ImageIcon, Type, Upload, Search, Play
} from 'lucide-react';
import { CarouselData, ElementType, ElementStyles } from '../types';
import { searchImages } from '../services';

/** ====================== Utils ======================= */
const isVideoUrl = (url: string): boolean => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
const isImgurUrl = (url: string): boolean => url.includes('i.imgur.com');

/** ====================== Tipos ======================= */
interface CarouselViewerProps {
  slides: string[];
  carouselData: CarouselData;
  onClose: () => void;
}

type TargetKind = 'img' | 'bg';

type ImageEditModalState =
  | {
      open: true;
      slideIndex: number;
      targetType: TargetKind;
      targetSelector: string;
      imageUrl: string;
      slideW: number;
      slideH: number;
      containerHeightPx: number;
      naturalW: number;
      naturalH: number;
      imgOffsetTopPx: number;
      imgOffsetLeftPx: number;
      zoomScale: number;        // escala atual (>= minZoom)
      minZoom: number;          // zoom mínimo dinâmico (cover)
      targetWidthPx: number;
      targetLeftPx: number;
      targetTopPx: number;
    }
  | { open: false };

/** ====================== Componentes auxiliares ======================= */

const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const elRef = useRef<HTMLDivElement | null>(null);
  if (!elRef.current) elRef.current = document.createElement('div');
  useEffect(() => {
    const el = elRef.current!;
    el.style.zIndex = '9999';
    document.body.appendChild(el);
    return () => { document.body.removeChild(el); };
  }, []);
  return ReactDOM.createPortal(children, elRef.current);
};

// Drag X/Y
const DragSurface: React.FC<{ onDrag: (dx: number, dy: number) => void }> = ({ onDrag }) => {
  const dragging = useRef(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (dragging.current) onDrag(e.movementX, e.movementY); };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onDrag]);
  return (
    <div
      onMouseDown={(e) => { e.preventDefault(); dragging.current = true; }}
      className="absolute inset-0 cursor-move"
      style={{ zIndex: 10, background: 'transparent' }}
    />
  );
};

// Resize na borda inferior
const ResizeBar: React.FC<{ onResize: (dy: number) => void }> = ({ onResize }) => {
  const resizing = useRef(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (resizing.current) onResize(e.movementY); };
    const onUp = () => { resizing.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onResize]);
  return (
    <div
      onMouseDown={(e) => { e.preventDefault(); resizing.current = true; }}
      className="absolute left-0 right-0 h-3 -bottom-1 cursor-s-resize"
      style={{ zIndex: 20, background: 'transparent' }}
    >
      <div className="mx-auto w-12 h-1 rounded-full bg-blue-500/80" />
    </div>
  );
};

/** ====================== Helpers COVER/OFFSET ======================= */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// escala "cover" necessária para cobrir o container (sem considerar zoom do usuário)
const coverScale = (natW: number, natH: number, contW: number, contH: number) =>
  Math.max(contW / natW, contH / natH);

// dado natW/H, contW/H e zoom => displayW/H e limites de offset
function computeGeometry(natW: number, natH: number, contW: number, contH: number, zoom: number) {
  const scale = coverScale(natW, natH, contW, contH) * Math.max(1, zoom); // nunca < cover
  const displayW = natW * scale;
  const displayH = natH * scale;
  const minLeft = contW - displayW;   // <= 0
  const minTop  = contH - displayH;   // <= 0
  return { displayW, displayH, minLeft, minTop };
}

// centraliza dentro da máscara
function centeredOffsets(contW: number, contH: number, displayW: number, displayH: number) {
  return {
    left: (contW - displayW) / 2,
    top:  (contH - displayH) / 2,
  };
}

/** ====================== Componente principal ======================= */
const CarouselViewer: React.FC<CarouselViewerProps> = ({ slides, carouselData, onClose }) => {
  const [zoom, setZoom] = useState(0.35);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [focusedSlide, setFocusedSlide] = useState<number | null>(0);

  const [selectedElement, setSelectedElement] = useState<{ slideIndex: number; element: ElementType }>({ slideIndex: 0, element: null });
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set([0]));
  const [editedContent, setEditedContent] = useState<Record<string, any>>({});
  const [elementStyles, setElementStyles] = useState<Record<string, ElementStyles>>({});
  const [originalStyles, setOriginalStyles] = useState<Record<string, ElementStyles>>({});
  const [renderedSlides, setRenderedSlides] = useState<string[]>(slides);

  const [isEditingInline, setIsEditingInline] = useState<{ slideIndex: number; element: ElementType } | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<Record<number, string>>({});
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);

  const [cropMode, setCropMode] = useState<{ slideIndex: number; videoId: string } | null>(null);

  const [imageModal, setImageModal] = useState<ImageEditModalState>({ open: false });

  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({});

  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  /** ====================== Teclas globais ======================= */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (imageModal.open) { setImageModal({ open: false }); document.documentElement.style.overflow=''; return; }
        if (selectedElement.element !== null) setSelectedElement({ slideIndex: selectedElement.slideIndex, element: null });
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageModal, selectedElement, onClose]);

  /** ====================== Injeção ids ======================= */
  const ensureStyleTag = (html: string) =>
    /<style[\s>]/i.test(html) ? html : html.replace(/<head([^>]*)>/i, `<head$1><style></style>`);

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
        result = result.replace(re, (m, b, t, a) => `${b}<span id="${id}" data-editable="${attr}" contenteditable="false">${t}</span>${a}`);
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
    `);

    result = result.replace(/<body([^>]*)>/i, `<body$1 id="slide-${slideIndex}-background" data-editable="background">`);
    return result;
  };

  useEffect(() => { setRenderedSlides(slides.map((s, i) => injectEditableIds(s, i))); }, [slides]);

  useEffect(() => {
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = 0 * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
    setFocusedSlide(0);
  }, []); // mount only

  /** ====================== DOM helpers ======================= */
  const findLargestVisual = (doc: Document): { type: 'img' | 'bg', el: HTMLElement } | null => {
    let best: { type: 'img' | 'bg', el: HTMLElement, area: number } | null = null;
    const imgs = Array.from(doc.querySelectorAll('img')) as HTMLImageElement[];
    imgs.forEach(img => {
      if (img.getAttribute('data-protected') === 'true' || isImgurUrl(img.src)) return;
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > 9000) if (!best || area > best.area) best = { type: 'img', el: img, area };
    });
    const els = Array.from(doc.querySelectorAll<HTMLElement>('body,div,section,header,main,figure,article'));
    els.forEach(el => {
      const cs = doc.defaultView?.getComputedStyle(el);
      if (!cs) return;
      if (cs.backgroundImage && cs.backgroundImage.includes('url(')) {
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > 9000) if (!best || area > best.area) best = { type: 'bg', el, area };
      }
    });
    return best ? { type: best.type, el: best.el } : null;
  };

  const extractTextStyles = (doc: Document, el: HTMLElement): ElementStyles => {
    const cs = doc.defaultView?.getComputedStyle(el);
    if (!cs) return { fontSize: '16px', fontWeight: '400', textAlign: 'left', color: '#FFFFFF' };
    const rgbToHex = (rgb: string): string => {
      const m = rgb.match(/\d+/g); if (!m || m.length < 3) return rgb;
      const [r, g, b] = m.map(v => parseInt(v, 10));
      const hx = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
      return `#${hx(r)}${hx(g)}${hx(b)}`;
    };
    const color = cs.color || '#FFFFFF';
    return {
      fontSize: cs.fontSize || '16px',
      fontWeight: cs.fontWeight || '400',
      textAlign: (cs.textAlign as any) || 'left',
      color: color.startsWith('rgb') ? rgbToHex(color) : color,
    };
  };

  const applyBackgroundImageImmediate = (slideIndex: number, imageUrl: string): HTMLElement | null => {
    const iframe = iframeRefs.current[slideIndex];
    if (!iframe || !iframe.contentWindow) return null;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return null;

    const targetImg = selectedImageRefs.current[slideIndex];
    if (targetImg && targetImg.getAttribute('data-protected') !== 'true') {
      if (!isVideoUrl(imageUrl)) {
        targetImg.removeAttribute('srcset'); targetImg.removeAttribute('sizes'); targetImg.loading = 'eager';
        targetImg.src = imageUrl; targetImg.setAttribute('data-bg-image-url', imageUrl);
        return targetImg;
      }
    }

    const best = findLargestVisual(doc);
    if (best) {
      if (best.type === 'img') {
        const img = best.el as HTMLImageElement;
        img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.loading = 'eager';
        img.src = imageUrl; img.setAttribute('data-bg-image-url', imageUrl);
        return img;
      } else {
        best.el.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
        best.el.style.setProperty('background-repeat', 'no-repeat', 'important');
        best.el.style.setProperty('background-size', 'cover', 'important');
        best.el.style.setProperty('background-position', '50% 50%', 'important');
        return best.el;
      }
    }

    doc.body.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
    doc.body.style.setProperty('background-repeat', 'no-repeat', 'important');
    doc.body.style.setProperty('background-size', 'cover', 'important');
    doc.body.style.setProperty('background-position', '50% 50%', 'important');
    return doc.body;
  };

  /** ====================== Aplicações no iframe ======================= */
  useEffect(() => {
    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe || !iframe.contentWindow) return;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;

      // imagens editáveis
      const imgs = Array.from(doc.querySelectorAll('img'));
      let imgIdx = 0;
      imgs.forEach((img) => {
        const im = img as HTMLImageElement;
        if (isImgurUrl(im.src) && !im.getAttribute('data-protected')) im.setAttribute('data-protected', 'true');
        if (im.getAttribute('data-protected') !== 'true') {
          im.setAttribute('data-editable', 'image');
          if (!im.id) im.id = `slide-${index}-img-${imgIdx++}`;
        }
      });

      // estilos texto
      const titleEl = doc.getElementById(`slide-${index}-title`);
      if (titleEl) {
        const styles = elementStyles[`${index}-title`];
        const content = editedContent[`${index}-title`];
        if (styles) {
          if (styles.fontSize) titleEl.style.setProperty('font-size', styles.fontSize, 'important');
          if (styles.fontWeight) titleEl.style.setProperty('font-weight', styles.fontWeight, 'important');
          if (styles.textAlign) titleEl.style.setProperty('text-align', styles.textAlign, 'important');
          if (styles.color) titleEl.style.setProperty('color', styles.color, 'important');
        }
        if (content !== undefined && titleEl.getAttribute('contenteditable') !== 'true') titleEl.textContent = content;
      }

      const subtitleEl = doc.getElementById(`slide-${index}-subtitle`);
      if (subtitleEl) {
        const styles = elementStyles[`${index}-subtitle`];
        const content = editedContent[`${index}-subtitle`];
        if (styles) {
          if (styles.fontSize) subtitleEl.style.setProperty('font-size', styles.fontSize, 'important');
          if (styles.fontWeight) subtitleEl.style.setProperty('font-weight', styles.fontWeight, 'important');
          if (styles.textAlign) subtitleEl.style.setProperty('text-align', styles.textAlign, 'important');
          if (styles.color) subtitleEl.style.setProperty('color', styles.color, 'important');
        }
        if (content !== undefined && subtitleEl.getAttribute('contenteditable') !== 'true') subtitleEl.textContent = content;
      }

      // captura estilos originais 1x
      setTimeout(() => {
        if (titleEl && !originalStyles[`${index}-title`]) {
          setOriginalStyles(p => ({ ...p, [`${index}-title`]: extractTextStyles(doc, titleEl as HTMLElement) }));
        }
        if (subtitleEl && !originalStyles[`${index}-subtitle`]) {
          setOriginalStyles(p => ({ ...p, [`${index}-subtitle`]: extractTextStyles(doc, subtitleEl as HTMLElement) }));
        }
      }, 60);

      // aplica bg (cover+center)
      const bg = editedContent[`${index}-background`];
      if (bg) {
        const best = findLargestVisual(doc);
        if (best) {
          if (best.type === 'img') {
            const img = best.el as HTMLImageElement;
            img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.loading = 'eager';
            img.src = bg; img.setAttribute('data-bg-image-url', bg);
          } else {
            best.el.style.setProperty('background-image', `url('${bg}')`, 'important');
            best.el.style.setProperty('background-repeat', 'no-repeat', 'important');
            best.el.style.setProperty('background-size', 'cover', 'important');
            best.el.style.setProperty('background-position', '50% 50%', 'important');
          }
        } else {
          doc.body.style.setProperty('background-image', `url('${bg}')`, 'important');
          doc.body.style.setProperty('background-repeat', 'no-repeat', 'important');
          doc.body.style.setProperty('background-size', 'cover', 'important');
          doc.body.style.setProperty('background-position', '50% 50%', 'important');
        }
      }
    });
  }, [elementStyles, editedContent, originalStyles, renderedSlides]);

  /** ====================== Setup clicks no iframe ======================= */
  useEffect(() => {
    const setupIframe = (iframe: HTMLIFrameElement, slideIndex: number) => {
      if (!iframe.contentWindow) return;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;

      const editable = doc.querySelectorAll('[data-editable]');
      editable.forEach((el) => {
        const type = (el as HTMLElement).getAttribute('data-editable');
        const htmlEl = el as HTMLElement;

        htmlEl.style.pointerEvents = 'auto';
        htmlEl.style.cursor = 'pointer';

        htmlEl.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          iframeRefs.current.forEach((f) => {
            const d = f?.contentDocument || f?.contentWindow?.document;
            if (!d) return;
            d.querySelectorAll('[data-editable]').forEach(x => x.classList.remove('selected'));
          });
          htmlEl.classList.add('selected');

          if (type === 'image') {
            const isImg = htmlEl.tagName === 'IMG';
            selectedImageRefs.current[slideIndex] = isImg ? (htmlEl as HTMLImageElement) : null;
            handleElementClick(slideIndex, 'background');
          } else {
            selectedImageRefs.current[slideIndex] = null;
            handleElementClick(slideIndex, type as ElementType);
          }
        };

        if (type === 'title' || type === 'subtitle') {
          htmlEl.ondblclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            htmlEl.setAttribute('contenteditable', 'true');
            htmlEl.focus();
            setIsEditingInline({ slideIndex, element: type as ElementType });

            const range = doc.createRange();
            range.selectNodeContents(htmlEl);
            const sel = iframe.contentWindow?.getSelection();
            if (sel) { sel.removeAllRanges(); sel.addRange(range); }
          };

          htmlEl.onblur = () => {
            if (htmlEl.getAttribute('contenteditable') === 'true') {
              htmlEl.setAttribute('contenteditable', 'false');
              const newContent = htmlEl.textContent || '';
              updateEditedValue(slideIndex, type, newContent);
              setIsEditingInline(null);
            }
          };

          htmlEl.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); htmlEl.blur(); }
            if (e.key === 'Escape') { e.preventDefault(); htmlEl.blur(); }
          };
        }
      });
    };

    const timer = setTimeout(() => {
      iframeRefs.current.forEach((iframe, idx) => {
        if (!iframe) return;
        iframe.onload = () => setTimeout(() => setupIframe(iframe, idx), 60);
        if (iframe.contentDocument?.readyState === 'complete') setupIframe(iframe, idx);
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [renderedSlides]);

  /** ====================== Troca imagem / abrir modal ======================= */
  const handleBackgroundImageChange = (slideIndex: number, imageUrl: string) => {
    const updatedEl = applyBackgroundImageImmediate(slideIndex, imageUrl);
    iframeRefs.current.forEach((f) => {
      const d = f?.contentDocument || f?.contentWindow?.document;
      if (!d) return;
      d.querySelectorAll('[data-editable]').forEach(el => el.classList.remove('selected'));
    });
    if (updatedEl) {
      updatedEl.classList.add('selected');
      selectedImageRefs.current[slideIndex] = updatedEl.tagName === 'IMG' ? (updatedEl as HTMLImageElement) : null;
    }
    setSelectedElement({ slideIndex, element: 'background' });
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setFocusedSlide(slideIndex);
    updateEditedValue(slideIndex, 'background', imageUrl);
  };

  // Abre SEMPRE com minZoom = cover e offsets centralizados clampados
  const openImageEditModal = (slideIndex: number) => {
    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!doc) return;

    const selected = doc.querySelector('[data-editable].selected') as HTMLElement | null;
    const largest = findLargestVisual(doc)?.el || null;
    const chosen = selected || largest;
    if (!chosen) return;

    if (!chosen.id) chosen.id = `img-edit-${Date.now()}`;
    const targetSelector = `#${chosen.id}`;

    const cs = doc.defaultView?.getComputedStyle(chosen);
    let imageUrl = '', targetType: TargetKind = 'img';
    if (chosen.tagName === 'IMG') { imageUrl = (chosen as HTMLImageElement).src; targetType = 'img'; }
    else if (cs?.backgroundImage && cs.backgroundImage.includes('url('))) {
      const m = cs.backgroundImage.match(/url\(["']?(.+?)["']?\)/i);
      imageUrl = m?.[1] || ''; targetType = 'bg';
    }
    if (!imageUrl) return;

    const r = chosen.getBoundingClientRect();
    const bodyRect = doc.body.getBoundingClientRect();
    const targetLeftPx = r.left - bodyRect.left;
    const targetTopPx  = r.top  - bodyRect.top;
    const targetWidthPx = r.width;
    const targetHeightPx = r.height;

    const containerHeightPx = targetHeightPx;

    const tmp = new Image();
    tmp.src = imageUrl;

    const finalizeOpen = (natW: number, natH: number) => {
      const minZoom = coverScale(natW, natH, targetWidthPx, containerHeightPx); // cover exato
      const { displayW, displayH } = computeGeometry(natW, natH, targetWidthPx, containerHeightPx, 1);
      const { left, top } = centeredOffsets(targetWidthPx, containerHeightPx, displayW, displayH);

      setImageModal({
        open: true,
        slideIndex,
        targetType,
        targetSelector,
        imageUrl,
        slideW: slideWidth,
        slideH: slideHeight,
        containerHeightPx,
        naturalW: natW,
        naturalH: natH,
        imgOffsetTopPx: top,
        imgOffsetLeftPx: left,
        zoomScale: 1,     // relativo: 1 == cover
        minZoom,          // informativo (não usamos direto no slider; calculamos efetivo sempre)
        targetWidthPx,
        targetLeftPx,
        targetTopPx,
      });
      document.documentElement.style.overflow = 'hidden';
    };

    if (tmp.complete && tmp.naturalWidth && tmp.naturalHeight) finalizeOpen(tmp.naturalWidth, tmp.naturalHeight);
    else tmp.onload = () => finalizeOpen(tmp.naturalWidth, tmp.naturalHeight);
  };

  // aplica no iframe (mantido)
  const applyImageEditModal = () => {
    if (!imageModal.open) return;
    const {
      slideIndex, targetType, targetSelector, imageUrl,
      containerHeightPx, imgOffsetTopPx, imgOffsetLeftPx,
      naturalW, naturalH, targetWidthPx, zoomScale
    } = imageModal;

    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!doc) { setImageModal({ open: false }); document.documentElement.style.overflow = ''; return; }

    const el = doc.querySelector(targetSelector) as HTMLElement | null;
    if (!el) { setImageModal({ open: false }); document.documentElement.style.overflow = ''; return; }

    // display/limites com zoom efetivo (>= cover)
    const { displayW, displayH, minLeft, minTop } =
      computeGeometry(naturalW, naturalH, targetWidthPx, containerHeightPx, zoomScale);

    const safeLeft = clamp(imgOffsetLeftPx, minLeft, 0);
    const safeTop  = clamp(imgOffsetTopPx,  minTop,  0);

    if (targetType === 'img') {
      let wrapper = el.parentElement;
      if (!wrapper || !wrapper.classList.contains('img-crop-wrapper')) {
        const w = doc.createElement('div');
        w.className = 'img-crop-wrapper';
        w.style.display = 'inline-block';
        w.style.position = 'relative';
        w.style.overflow = 'hidden';
        w.style.borderRadius = doc.defaultView?.getComputedStyle(el).borderRadius || '';
        if (el.parentNode) el.parentNode.replaceChild(w, el);
        w.appendChild(el);
        wrapper = w;
      }
      (wrapper as HTMLElement).style.width  = `${targetWidthPx}px`;
      (wrapper as HTMLElement).style.height = `${containerHeightPx}px`;

      (el as HTMLElement).style.position = 'absolute';
      (el as HTMLElement).style.width  = `${displayW}px`;
      (el as HTMLElement).style.height = `${displayH}px`;
      (el as HTMLElement).style.left   = `${safeLeft}px`;
      (el as HTMLElement).style.top    = `${safeTop}px`;
      (el as HTMLElement).style.maxWidth = 'unset';
      (el as HTMLElement).style.maxHeight = 'unset';
      (el as HTMLImageElement).removeAttribute('srcset');
      (el as HTMLImageElement).removeAttribute('sizes');
      (el as HTMLImageElement).loading = 'eager';
      if ((el as HTMLImageElement).src !== imageUrl) (el as HTMLImageElement).src = imageUrl;
      (el as HTMLImageElement).style.objectFit = 'cover';
    } else {
      // background com px exatos
      el.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
      el.style.setProperty('background-repeat', 'no-repeat', 'important');
      el.style.setProperty('background-size', `${displayW}px ${displayH}px`, 'important');

      const maxOffsetX = Math.max(0, displayW - targetWidthPx);
      const maxOffsetY = Math.max(0, displayH - containerHeightPx);
      const xPerc = maxOffsetX ? (-safeLeft / maxOffsetX) * 100 : 50;
      const yPerc = maxOffsetY ? (-safeTop  / maxOffsetY) * 100 : 50;

      el.style.setProperty('background-position-x', `${xPerc}%`, 'important');
      el.style.setProperty('background-position-y', `${yPerc}%`, 'important');
      el.style.setProperty('height', `${containerHeightPx}px`, 'important');
      if ((doc.defaultView?.getComputedStyle(el).position || 'static') === 'static') el.style.position = 'relative';
    }

    setImageModal({ open: false });
    document.documentElement.style.overflow = '';
  };

  /** ====================== UI Aux ======================= */
  const toggleLayer = (index: number) => {
    const s = new Set(expandedLayers);
    s.has(index) ? s.delete(index) : s.add(index);
    setExpandedLayers(s);
  };

  const handleSlideClick = (index: number) => {
    iframeRefs.current.forEach((iframe) => {
      const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
      if (!doc) return;
      doc.querySelectorAll('[data-editable]').forEach(el => el.classList.remove('selected'));
    });
    setFocusedSlide(index);
    setSelectedElement({ slideIndex: index, element: null });
    selectedImageRefs.current[index] = null;

    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = index * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
  };

  const handleElementClick = (slideIndex: number, element: ElementType) => {
    setIsLoadingProperties(true);
    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (doc && element) {
      doc.querySelectorAll('[data-editable]').forEach(el => el.classList.remove('selected'));
      const target = doc.getElementById(`slide-${slideIndex}-${element}`);
      if (target) target.classList.add('selected'); else if (element === 'background') doc.body.classList.add('selected');
    }
    setSelectedElement({ slideIndex, element });
    setFocusedSlide(slideIndex);
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setTimeout(() => setIsLoadingProperties(false), 100);
  };

  const getElementStyle = (slideIndex: number, element: ElementType): ElementStyles => {
    const k = `${slideIndex}-${element}`;
    return elementStyles[k] || originalStyles[k] || { fontSize: element === 'title' ? '24px' : '16px', fontWeight: element === 'title' ? '700' : '400', textAlign: 'left', color: '#FFFFFF' };
  };
  const updateElementStyle = (slideIndex: number, element: ElementType, prop: keyof ElementStyles, value: string) => {
    const k = `${slideIndex}-${element}`;
    setElementStyles(prev => ({ ...prev, [k]: { ...getElementStyle(slideIndex, element), [prop]: value } }));
  };
  const updateEditedValue = (slideIndex: number, field: string, value: any) => {
    const k = `${slideIndex}-${field}`;
    setEditedContent(prev => ({ ...prev, [k]: value }));
  };
  const getEditedValue = (slideIndex: number, field: string, def: any) => {
    const k = `${slideIndex}-${field}`;
    return editedContent[k] !== undefined ? editedContent[k] : def;
  };

  // busca
  const lastSearchId = useRef(0);
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

  /** ====================== Render ======================= */
  return (
    <div className="fixed top-14 left-16 right-0 bottom-0 z-[90] bg-neutral-900 flex">
      {/* === MODAL === */}
      {imageModal.open && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999]">
            <div className="absolute inset-0 bg-black/70" />
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <div
                className="relative bg-neutral-950 border border-neutral-800 rounded-2xl w-[min(92vw,1200px)] h-[min(90vh,900px)] shadow-2xl pointer-events-auto overflow-hidden"
                role="dialog"
                aria-modal="true"
                style={{ resize: 'vertical' }}
              >
                <div className="h-12 px-4 flex items-center justify-between border-b border-neutral-800">
                  <div className="text-white font-medium text-sm">Edição da imagem — Slide {imageModal.slideIndex + 1}</div>
                  <div className="flex items-center gap-2">
                    {/* ZOOM (relativo ao cover). Nunca permite ficar abaixo de cover */}
                    <button
                      className="bg-neutral-800 hover:bg-neutral-700 text-white p-1 rounded"
                      onClick={() => {
                        const newZoom = Math.max(1, +(imageModal.zoomScale - 0.1).toFixed(2));
                        // recalcula offsets clampados
                        const g = computeGeometry(imageModal.naturalW, imageModal.naturalH, imageModal.targetWidthPx, imageModal.containerHeightPx, newZoom);
                        const left = clamp(imageModal.imgOffsetLeftPx, g.minLeft, 0);
                        const top  = clamp(imageModal.imgOffsetTopPx,  g.minTop,  0);
                        setImageModal({ ...imageModal, zoomScale: newZoom, imgOffsetLeftPx: left, imgOffsetTopPx: top });
                      }}
                      title="Zoom -"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.01}
                      value={imageModal.zoomScale}
                      onChange={(e) => {
                        const newZoom = Math.max(1, Math.min(3, parseFloat(e.target.value)));
                        const g = computeGeometry(imageModal.naturalW, imageModal.naturalH, imageModal.targetWidthPx, imageModal.containerHeightPx, newZoom);
                        const left = clamp(imageModal.imgOffsetLeftPx, g.minLeft, 0);
                        const top  = clamp(imageModal.imgOffsetTopPx,  g.minTop,  0);
                        setImageModal({ ...imageModal, zoomScale: newZoom, imgOffsetLeftPx: left, imgOffsetTopPx: top });
                      }}
                      className="w-32 accent-blue-500"
                      title="Zoom"
                    />
                    <button
                      className="bg-neutral-800 hover:bg-neutral-700 text-white p-1 rounded"
                      onClick={() => {
                        const newZoom = Math.min(3, +(imageModal.zoomScale + 0.1).toFixed(2));
                        const g = computeGeometry(imageModal.naturalW, imageModal.naturalH, imageModal.targetWidthPx, imageModal.containerHeightPx, newZoom);
                        const left = clamp(imageModal.imgOffsetLeftPx, g.minLeft, 0);
                        const top  = clamp(imageModal.imgOffsetTopPx,  g.minTop,  0);
                        setImageModal({ ...imageModal, zoomScale: newZoom, imgOffsetLeftPx: left, imgOffsetTopPx: top });
                      }}
                      title="Zoom +"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <div className="text-neutral-300 text-xs w-10 text-right tabular-nums">{(imageModal.zoomScale*100).toFixed(0)}%</div>

                    <button
                      onClick={applyImageEditModal}
                      className="ml-2 bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded"
                    >
                      Aplicar
                    </button>
                    <button
                      onClick={() => { setImageModal({ open: false }); document.documentElement.style.overflow=''; }}
                      className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded"
                      aria-label="Fechar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="w-full h-[calc(100%-3rem)] p-4 overflow-auto">
                  <div className="text-neutral-400 text-xs mb-3 space-y-1">
                    <div>• Arraste a <span className="text-neutral-200">imagem</span> para ajustar o enquadramento.</div>
                    <div>• Arraste a <span className="text-neutral-200">borda inferior</span> para aumentar a área visível.</div>
                    <div>• O <span className="text-neutral-200">zoom</span> nunca deixa aparecer o fundo.</div>
                  </div>

                  <div className="grid place-items-center">
                    <div
                      className="relative bg-neutral-100 rounded-xl shadow-xl border border-neutral-800"
                      style={{ width: `${imageModal.slideW}px`, height: `${imageModal.slideH}px`, overflow: 'hidden' }}
                    >
                      {/* Preview do SLIDE */}
                      <iframe
                        srcDoc={renderedSlides[imageModal.slideIndex]}
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        sandbox="allow-same-origin"
                        title={`Slide Preview ${imageModal.slideIndex + 1}`}
                      />

                      {(() => {
                        const containerLeft = imageModal.targetLeftPx;
                        const containerTop = imageModal.targetTopPx;
                        const containerWidth = imageModal.targetWidthPx;
                        const containerHeight = imageModal.containerHeightPx;

                        // Geometria com zoom efetivo (>= cover)
                        const g = computeGeometry(
                          imageModal.naturalW, imageModal.naturalH,
                          containerWidth, containerHeight,
                          imageModal.zoomScale
                        );
                        const { displayW, displayH, minLeft, minTop } = g;

                        // clamp visual SEMPRE (o estado pode estar fora; aqui não deixa vazar)
                        const vLeft = clamp(imageModal.imgOffsetLeftPx, minLeft, 0);
                        const vTop  = clamp(imageModal.imgOffsetTopPx,  minTop,  0);

                        const rightW = imageModal.slideW - (containerLeft + containerWidth);
                        const bottomH = imageModal.slideH - (containerTop + containerHeight);

                        return (
                          <>
                            {/* destaque/container */}
                            <div
                              className="absolute rounded-lg pointer-events-none"
                              style={{
                                left: containerLeft - 2,
                                top: containerTop - 2,
                                width: containerWidth + 4,
                                height: containerHeight + 4,
                                boxShadow: '0 0 0 2px rgba(59,130,246,0.9)',
                              }}
                            />
                            {/* overlays fora da máscara */}
                            <div className="absolute top-0 left-0 bg-black/30 pointer-events-none" style={{ width: '100%', height: containerTop }} />
                            <div className="absolute left-0 bg-black/30 pointer-events-none" style={{ top: containerTop, width: containerLeft, height: containerHeight }} />
                            <div className="absolute bg-black/30 pointer-events-none" style={{ top: containerTop, right: 0, width: rightW, height: containerHeight }} />
                            <div className="absolute left-0 bottom-0 bg-black/30 pointer-events-none" style={{ width: '100%', height: bottomH }} />

                            {/* MÁSCARA */}
                            <div
                              className="absolute rounded-lg"
                              style={{
                                left: containerLeft,
                                top: containerTop,
                                width: containerWidth,
                                height: containerHeight,
                                overflow: 'hidden',
                                background: '#000', // mesmo se algo falhar, não fica branco
                              }}
                            >
                              <img
                                src={imageModal.imageUrl}
                                alt="to-edit"
                                draggable={false}
                                style={{
                                  position: 'absolute',
                                  left: `${vLeft}px`,
                                  top: `${vTop}px`,
                                  width: `${displayW}px`,
                                  height: `${displayH}px`,
                                  display: 'block',
                                  objectFit: 'cover',
                                  userSelect: 'none',
                                  pointerEvents: 'none',
                                }}
                              />

                              {/* drag X/Y com clamp em tempo-real */}
                              <DragSurface
                                onDrag={(dx, dy) => {
                                  const nextLeft = clamp(imageModal.imgOffsetLeftPx + dx, minLeft, 0);
                                  const nextTop  = clamp(imageModal.imgOffsetTopPx  + dy, minTop,  0);
                                  setImageModal({ ...imageModal, imgOffsetLeftPx: nextLeft, imgOffsetTopPx: nextTop });
                                }}
                              />

                              {/* resize inferior com recalculo/clamp */}
                              <ResizeBar
                                onResize={(dy) => {
                                  const newH = Math.max(60, containerHeight + dy);
                                  const gg = computeGeometry(imageModal.naturalW, imageModal.naturalH, containerWidth, newH, imageModal.zoomScale);
                                  const newLeft = clamp(imageModal.imgOffsetLeftPx, gg.minLeft, 0);
                                  const newTop  = clamp(imageModal.imgOffsetTopPx,  gg.minTop,  0);
                                  setImageModal({ ...imageModal, containerHeightPx: newH, imgOffsetLeftPx: newLeft, imgOffsetTopPx: newTop });
                                }}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ============ Sidebar (Layers) ============ */}
      <div className="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col">
        <div className="h-14 border-b border-neutral-800 flex items-center px-4">
          <Layers className="w-4 h-4 text-neutral-400 mr-2" />
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
                    <Layers className="w-3 h-3 text-blue-400" />
                    <span className="text-white text-sm">Slide {index + 1}</span>
                  </div>
                </button>
                {isExpanded && conteudo && (
                  <div className="ml-3 border-l border-neutral-800">
                    <button
                      onClick={() => handleElementClick(index, 'background')}
                      className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${selectedElement.slideIndex === index && selectedElement.element === 'background' ? 'bg-neutral-800' : ''}`}
                    >
                      <ImageIcon className="w-4 h-4 text-neutral-500" />
                      <span className="text-neutral-300 text-xs">Background Image</span>
                    </button>
                    <button
                      onClick={() => handleElementClick(index, 'title')}
                      className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${selectedElement.slideIndex === index && selectedElement.element === 'title' ? 'bg-neutral-800' : ''}`}
                    >
                      <Type className="w-4 h-4 text-neutral-500" />
                      <span className="text-neutral-300 text-xs">Title</span>
                    </button>
                    {conteudo.subtitle && (
                      <button
                        onClick={() => handleElementClick(index, 'subtitle')}
                        className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${selectedElement.slideIndex === index && selectedElement.element === 'subtitle' ? 'bg-neutral-800' : ''}`}
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

      {/* ============ Área principal ============ */}
      <div className="flex-1 flex flex-col">
        <div className="h-14 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-white font-semibold">Carousel Editor</h2>
            <div className="text-neutral-500 text-sm">{slides.length} slides</div>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={() => setZoom(p => Math.max(0.1, p - 0.1))} className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded" title="Zoom Out"><ZoomOut className="w-4 h-4" /></button>
            <div className="bg-neutral-800 text-white px-3 py-1.5 rounded text-xs min-w-[70px] text-center">{Math.round(zoom * 100)}%</div>
            <button onClick={() => setZoom(p => Math.min(2, p + 0.1))} className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded" title="Zoom In"><ZoomIn className="w-4 h-4" /></button>
            <div className="w-px h-6 bg-neutral-800 mx-2" />
            <button onClick={handleDownloadAll} className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded flex items-center space-x-2 text-sm" title="Download All Slides">
              <Download className="w-4 h-4" /><span>Download</span>
            </button>
            <button onClick={onClose} className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded" title="Close (Esc)"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative bg-neutral-800"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onWheel={(e) => {
            e.preventDefault();
            if (imageModal.open) return;
            if (e.ctrlKey) {
              const rect = containerRef.current!.getBoundingClientRect();
              const mouseX = (e.clientX - rect.left - pan.x) / zoom;
              const mouseY = (e.clientY - rect.top  - pan.y) / zoom;
              const delta = e.deltaY > 0 ? -0.05 : 0.05;
              const newZoom = Math.min(Math.max(0.1, zoom + delta), 2);
              setZoom(newZoom);
              setPan({ x: e.clientX - rect.left - mouseX * newZoom, y: e.clientY - rect.top - mouseY * newZoom });
            } else {
              setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
            }
          }}
          onMouseDown={(e) => {
            if (imageModal.open) return;
            if (e.button === 0 && e.currentTarget === e.target) {
              setIsDragging(true);
              setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            }
          }}
          onMouseMove={(e) => { if (!imageModal.open && isDragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }}
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
                <div key={i} className={`relative bg-white rounded-lg shadow-2xl overflow-hidden flex-shrink-0 transition-all ${focusedSlide === i ? 'ring-4 ring-blue-500' : ''}`} style={{ width: `${slideWidth}px`, height: `${slideHeight}px` }}>
                  <iframe ref={(el) => (iframeRefs.current[i] = el)} srcDoc={slide} className="w-full h-full border-0" title={`Slide ${i + 1}`} sandbox="allow-same-origin allow-scripts" />
                </div>
              ))}
            </div>
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neutral-950/90 backdrop-blur-sm text-neutral-400 px-3 py-1.5 rounded text-xs z-[2]">
            Zoom: {Math.round(zoom * 100)}%
          </div>
        </div>
      </div>

      {/* ============ Properties ============ */}
      <div className="w-80 bg-neutral-950 border-l border-neutral-800 flex flex-col">
        <div className="h-14 border-b border-neutral-800 flex items-center px-4"><h3 className="text-white font-medium text-sm">Properties</h3></div>
        <div className="flex-1 overflow-y-auto p-4">
          {selectedElement.element === null ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mb-4"><Type className="w-8 h-8 text-neutral-700" /></div>
              <h4 className="text-white font-medium mb-2">No Element Selected</h4>
              <p className="text-neutral-500 text-sm">Click on an element in the preview</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(selectedElement.element === 'title' || selectedElement.element === 'subtitle') && (
                <>
                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Text Content</label>
                    <textarea
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-blue-500"
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
                    <input type="text" className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" value={getElementStyle(selectedElement.slideIndex, selectedElement.element).fontSize} onChange={(e) => updateElementStyle(selectedElement.slideIndex, selectedElement.element!, 'fontSize', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Font Weight</label>
                    <select className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" value={getElementStyle(selectedElement.slideIndex, selectedElement.element).fontWeight} onChange={(e) => updateElementStyle(selectedElement.slideIndex, selectedElement.element!, 'fontWeight', e.target.value)}>
                      <option value="300">Light (300)</option><option value="400">Regular (400)</option><option value="500">Medium (500)</option><option value="600">Semi Bold (600)</option><option value="700">Bold (700)</option><option value="800">Extra Bold (800)</option><option value="900">Black (900)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Text Align</label>
                    <select className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" value={getElementStyle(selectedElement.slideIndex, selectedElement.element).textAlign} onChange={(e) => updateElementStyle(selectedElement.slideIndex, selectedElement.element!, 'textAlign', e.target.value)}>
                      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option>
                    </select>
                  </div>
                </>
              )}

              {selectedElement.element === 'background' && (
                <>
                  {isLoadingProperties ? (
                    <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <label className="text-neutral-400 text-xs mb-2 block font-medium">Background Images</label>
                        <button onClick={() => openImageEditModal(selectedElement.slideIndex)} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded">Editar imagem</button>
                      </div>

                      <div className="space-y-2">
                        {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo && (() => {
                          const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo;
                          const isVid = isVideoUrl(bgUrl);
                          const thumb = carouselData.conteudos[selectedElement.slideIndex]?.thumbnail_url;
                          const displayUrl = isVid && thumb ? thumb : bgUrl;
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', bgUrl);
                          return (
                            <div className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`} onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}>
                              <div className="text-neutral-400 text-xs mb-1 flex items-center justify-between"><span>{isVid ? 'Video 1' : 'Image 1'}</span>{isVid && <Play className="w-3 h-3" />}</div>
                              <div className="relative"><img src={displayUrl} alt="Background 1" className="w-full h-24 object-cover rounded" />{isVid && <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded"><Play className="w-8 h-8 text-white" fill="white" /></div>}</div>
                            </div>
                          );
                        })()}

                        {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo2 && (() => {
                          const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo2!;
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                          return (
                            <div className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`} onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}>
                              <div className="text-neutral-400 text-xs mb-1">Image 2</div>
                              <img src={bgUrl} alt="Background 2" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}

                        {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3 && (() => {
                          const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3!;
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                          return (
                            <div className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`} onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}>
                              <div className="text-neutral-400 text-xs mb-1">Image 3</div>
                              <img src={bgUrl} alt="Background 3" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}

                        {uploadedImages[selectedElement.slideIndex] && (() => {
                          const bgUrl = uploadedImages[selectedElement.slideIndex];
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                          return (
                            <div className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`} onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}>
                              <div className="text-neutral-400 text-xs mb-1">Image 4 (Uploaded)</div>
                              <img src={bgUrl} alt="Background 4 (Uploaded)" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}
                      </div>

                      <div className="mt-3">
                        <label className="text-neutral-400 text-xs mb-2 block font-medium">Search Images</label>
                        <div className="relative">
                          <input type="text" className="w-full bg-neutral-900 border border-neutral-800 rounded pl-10 pr-20 py-2 text-white text-sm focus:outline-none focus:border-blue-500" placeholder="Search for images..." value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearchImages(); }} />
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                          <button onClick={handleSearchImages} disabled={isSearching || !searchKeyword.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 text-white px-3 py-1 rounded text-xs">{isSearching ? 'Searching...' : 'Search'}</button>
                        </div>
                        {searchResults.length > 0 && (
                          <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                            {searchResults.map((imageUrl, index) => {
                              const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                              return (
                                <div key={index} className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === imageUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`} onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, imageUrl)}>
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
                        <label className="flex items-center justify-center w-full h-24 bg-neutral-900 border-2 border-dashed border-neutral-800 rounded cursor-pointer hover:border-blue-500 transition-colors">
                          <div className="flex flex-col items-center"><Upload className="w-6 h-6 text-neutral-500 mb-1" /><span className="text-neutral-500 text-xs">Click to upload</span></div>
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