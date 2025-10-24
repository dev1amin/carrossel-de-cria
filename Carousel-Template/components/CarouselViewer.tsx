// CarouselViewer.tsx
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
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// srcset & lazy helpers
function pickFromSrcset(srcset: string | null | undefined): string {
  if (!srcset) return '';
  const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  const url = last.split(/\s+/)[0];
  return url || '';
}
function resolveImgUrl(img: HTMLImageElement): string {
  const ds =
    img.getAttribute('data-src') ||
    img.getAttribute('data-lazy') ||
    img.getAttribute('data-original') ||
    '';
  const fromSet = pickFromSrcset(img.getAttribute('srcset'));
  return img.currentSrc || img.src || ds || fromSet || '';
}
function primeImages(doc: Document) {
  const imgs = Array.from(doc.querySelectorAll('img')) as HTMLImageElement[];
  imgs.forEach((img) => {
    const resolved = resolveImgUrl(img);
    if (resolved && img.src !== resolved) {
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.loading = 'eager';
      img.src = resolved;
    }
  });
}
async function waitImagesReady(iframe: HTMLIFrameElement | null | undefined, maxWaitMs = 600) {
  if (!iframe) return;
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  primeImages(doc);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, Math.max(0, Math.min(400, maxWaitMs))));
}

/** cover helpers p/ aplicar no slide (mantidos) */
const computeCover = (natW: number, natH: number, contW: number, contH: number) => {
  const scale = Math.max(contW / natW, contH / natH);
  return { displayW: natW * scale, displayH: natH * scale };
};
const centeredOffsets = (displayW: number, displayH: number, contW: number, contH: number) => {
  const minLeft = contW - displayW;
  const minTop  = contH - displayH;
  return { left: minLeft / 2, top:  minTop  / 2, minLeft, minTop };
};
const computeCoverBleed = (natW: number, natH: number, contW: number, contH: number, bleedPx = 2) => {
  const scale = Math.max(contW / natW, contH / natH);
  const displayW = Math.ceil(natW * scale) + bleedPx;
  const displayH = Math.ceil(natH * scale) + bleedPx;
  return { displayW, displayH };
};

/** >>> NOVO: fit-width para o POPUP (mostra altura total da imagem) */
const computeFitWidthBleed = (natW: number, natH: number, contW: number, bleedPx = 2) => {
  const displayW = Math.ceil(contW) + bleedPx;                 // casa pela LARGURA do container
  const scale = displayW / Math.max(1, natW);
  const displayH = Math.ceil(natH * scale);                    // altura total proporcional (pode ser >> container)
  return { displayW, displayH };
};

/** ====================== Tipos ======================= */
interface CarouselViewerProps {
  slides: string[];
  carouselData: CarouselData;
  onClose: () => void;
}
type TargetKind = 'img' | 'bg' | 'vid';
type ImageEditModalState =
  | {
      open: true;
      slideIndex: number;
      targetType: TargetKind;
      targetSelector: string;
      imageUrl: string;
      slideW: number;
      slideH: number;

      // IMG/BG
      containerHeightPx: number;
      naturalW: number;
      naturalH: number;
      imgOffsetTopPx: number;
      imgOffsetLeftPx: number;
      targetWidthPx: number;
      targetLeftPx: number;
      targetTopPx: number;

      // VÍDEO
      isVideo: boolean;
      videoTargetW: number;
      videoTargetH: number;
      videoTargetLeft: number;
      videoTargetTop: number;
      cropX: number;
      cropY: number;
      cropW: number;
      cropH: number;

      // preview
      previewHtml: string;
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

// DragSurface com start/end controlados (move só enquanto mouse pressionado)
const DragSurface: React.FC<{
  onDrag: (dx: number, dy: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  enabled?: boolean;
  cursor?: React.CSSProperties['cursor'];
}> = ({ onDrag, onDragStart, onDragEnd, enabled = true, cursor }) => {
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !enabled) return;
      onDrag(e.movementX, e.movementY);
    };
    const onUp = () => {
      if (dragging.current) {
        dragging.current = false;
        onDragEnd?.();
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onDrag, onDragEnd, enabled]);

  return (
    <div
      onMouseDown={(e) => {
        if (!enabled) return;
        e.preventDefault();
        dragging.current = true;
        onDragStart?.();
      }}
      className="absolute inset-0"
      style={{ zIndex: 10, background: 'transparent', cursor: enabled ? (cursor || 'move') : 'default', pointerEvents: enabled ? 'auto' : 'none' }}
    />
  );
};

const ResizeBar: React.FC<{ position: 'top' | 'bottom'; onResize: (dy: number) => void }> = ({ position, onResize }) => {
  const resizing = useRef(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (resizing.current) onResize(e.movementY * (position === 'top' ? -1 : 1)); };
    const onUp = () => { resizing.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onResize, position]);
  return (
    <div onMouseDown={(e) => { e.preventDefault(); resizing.current = true; }} className={`absolute left-0 right-0 h-3 ${position === 'top' ? '-top-1 cursor-n-resize' : '-bottom-1 cursor-s-resize'}`} style={{ zIndex: 20, background: 'transparent' }}>
      <div className="mx-auto w-12 h-1 rounded-full bg-blue-500/80" />
    </div>
  );
};

type HandlePos = 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw';
const handleStyles: Record<HandlePos, React.CSSProperties> = {
  n:{top:-6,left:'50%',marginLeft:-6,width:12,height:12,cursor:'ns-resize'},
  s:{bottom:-6,left:'50%',marginLeft:-6,width:12,height:12,cursor:'ns-resize'},
  e:{right:-6,top:'50%',marginTop:-6,width:12,height:12,cursor:'ew-resize'},
  w:{left:-6,top:'50%',marginTop:-6,width:12,height:12,cursor:'ew-resize'},
  ne:{top:-6,right:-6,width:12,height:12,cursor:'nesw-resize'},
  nw:{top:-6,left:-6,width:12,height:12,cursor:'nwse-resize'},
  se:{bottom:-6,right:-6,width:12,height:12,cursor:'nwse-resize'},
  sw:{bottom:-6,left:-6,width:12,height:12,cursor:'nesw-resize'},
};

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

  // estado do arrasto (imagem)
  const [isImageDragging, setIsImageDragging] = useState(false);

  // refs
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const cropResizeRef = useRef<{ active: boolean; pos: HandlePos | null }>({ active: false, pos: null });
  const cropDragRef = useRef<boolean>(false);

  /** ====================== Constantes ======================= */
  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  /** ====================== Estado inicial + injeção ======================= */
  useEffect(() => {
    setRenderedSlides(slides.map((s, i) => {
      if (!/<style[\s>]/i.test(s)) {
        return s.replace(/<head([^>]*)>/i, `<head$1><style></style>`);
      }
      return s;
    }).map((html, i) => {
      // injeta data-editable
      let result = html;
      const conteudo = carouselData.conteudos[i];
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
      if (titleText) addEditableSpan(titleText, `slide-${i}-title`, 'title');
      if (subtitleText) addEditableSpan(subtitleText, `slide-${i}-subtitle`, 'subtitle');

      result = result.replace(/<style>/i, `<style>
        [data-editable]{cursor:pointer!important;position:relative;display:inline-block!important}
        [data-editable].selected{outline:3px solid #3B82F6!important;outline-offset:2px;z-index:1000}
        [data-editable]:hover:not(.selected){outline:2px solid rgba(59,130,246,.5)!important;outline-offset:2px}
        [data-editable][contenteditable="true"]{outline:3px solid #10B981!important;outline-offset:2px;background:rgba(16,185,129,.1)!important}
        img[data-editable]{display:block!important}
        video[data-editable]{display:block!important}
      `);
      result = result.replace(
        /<body([^>]*)>/i,
        (m, attrs) => /id=/.test(attrs) ? m : `<body${attrs} id="slide-${i}-background" data-editable="background">`
      );
      return result;
    }));
  }, [slides, carouselData.conteudos]);

  useEffect(() => {
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = 0 * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
    setFocusedSlide(0);
  }, []); // mount

  /** ====================== Efeitos nos iframes ======================= */
  useEffect(() => {
    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe || !iframe.contentWindow) return;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;

      // marca imagens/vídeos
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
      const vids = Array.from(doc.querySelectorAll('video'));
      let vidIdx = 0;
      vids.forEach((v) => {
        (v as HTMLVideoElement).setAttribute('data-editable', 'video');
        if (!v.id) v.id = `slide-${index}-vid-${vidIdx++}`;
        (v as HTMLVideoElement).style.objectFit = 'cover';
        (v as HTMLVideoElement).style.width = '100%';
        (v as HTMLVideoElement).style.height = '100%';
      });

      // aplica estilos/conteúdo textuais
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
        if (content !== undefined && titleEl.getAttribute('contenteditable') !== 'true') {
          titleEl.textContent = content;
        }
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
        if (content !== undefined && subtitleEl.getAttribute('contenteditable') !== 'true') {
          subtitleEl.textContent = content;
        }
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

      // aplica bg escolhido
      const bg = editedContent[`${index}-background`];
      if (bg) {
        const best = findLargestVisual(doc);
        if (best) {
          if (best.type === 'img') {
            const img = best.el as HTMLImageElement;
            img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.loading = 'eager';
            img.src = bg; img.setAttribute('data-bg-image-url', bg);
          } else if (best.type === 'bg') {
            best.el.setAttribute('data-bg-image-url', bg);
            best.el.style.setProperty('background-image', `url('${bg}')`, 'important');
            best.el.style.setProperty('background-repeat', 'no-repeat', 'important');
            best.el.style.setProperty('background-size', 'cover', 'important');
            best.el.style.setProperty('background-position', '50% 50%', 'important');
          } else if (best.type === 'vid') {
            (best.el as HTMLVideoElement).src = bg;
          }
        }
      }
    });
  }, [elementStyles, editedContent, originalStyles, renderedSlides]);

  /** ====================== Interações no iframe ======================= */
  const findLargestVisual = (doc: Document): { type: 'img' | 'bg' | 'vid', el: HTMLElement } | null => {
    let best: { type: 'img' | 'bg' | 'vid', el: HTMLElement, area: number } | null = null;
    const vids = Array.from(doc.querySelectorAll('video')) as HTMLVideoElement[];
    vids.forEach(v => {
      const r = v.getBoundingClientRect(); const area = r.width * r.height;
      if (area > 9000) if (!best || area > best.area) best = { type: 'vid', el: v, area };
    });
    const imgs = Array.from(doc.querySelectorAll('img')) as HTMLImageElement[];
    imgs.forEach(img => {
      if (img.getAttribute('data-protected') === 'true' || isImgurUrl(img.src)) return;
      const r = img.getBoundingClientRect(); const area = r.width * r.height;
      if (area > 9000) if (!best || area > best.area) best = { type: 'img', el: img, area };
    });
    const els = Array.from(doc.querySelectorAll<HTMLElement>('body,div,section,header,main,figure,article'));
    els.forEach(el => {
      const cs = doc.defaultView?.getComputedStyle(el);
      if (!cs) return;
      if (cs.backgroundImage && cs.backgroundImage.includes('url(')) {
        const r = el.getBoundingClientRect(); const area = r.width * r.height;
        if (area > 9000) if (!best || area > best.area) best = { type: 'bg', el, area };
      }
    });
    return best ? { type: best.type, el: best.el } : null;
  };

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
          e.preventDefault();
          e.stopPropagation();

          // limpa seleções
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
          } else if (type === 'video') {
            selectedImageRefs.current[slideIndex] = null;
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

            const doc2 = iframe.contentDocument || iframe.contentWindow?.document;
            const range = doc2?.createRange();
            if (range) {
              range.selectNodeContents(htmlEl);
              const sel = iframe.contentWindow?.getSelection();
              if (sel) { sel.removeAllRanges(); sel.addRange(range); }
            }
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

  /** ====================== BG change ======================= */
  const applyBackgroundImageImmediate = (slideIndex: number, imageUrl: string): HTMLElement | null => {
    const iframe = iframeRefs.current[slideIndex];
    if (!iframe || !iframe.contentWindow) return null;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return null;

    const selected = doc.querySelector('[data-editable].selected') as HTMLElement | null;
    const selectedIsBody = selected && selected === doc.body;
    let target: { type: 'img'|'bg'|'vid', el: HTMLElement } | null = null;

    if (selected && !selectedIsBody) {
      const tag = selected.tagName;
      if (tag === 'IMG') target = { type: 'img', el: selected };
      else if (tag === 'VIDEO') target = { type: 'vid', el: selected };
      else target = { type: 'bg', el: selected };
    } else {
      target = findLargestVisual(doc);
    }

    if (!target) return null;

    if (target.type === 'img') {
      const img = target.el as HTMLImageElement;
      img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.loading = 'eager';
      img.src = imageUrl; img.setAttribute('data-bg-image-url', imageUrl);
      return img;
    }
    if (target.type === 'bg') {
      const el = target.el;
      el.setAttribute('data-bg-image-url', imageUrl);
      el.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
      el.style.setProperty('background-repeat', 'no-repeat', 'important');
      el.style.setProperty('background-size', 'cover', 'important');
      el.style.setProperty('background-position', '50% 50%', 'important');
      return el;
    }
    (target.el as HTMLVideoElement).src = imageUrl;
    return target.el;
  };

  const handleBackgroundImageChange = (slideIndex: number, imageUrl: string) => {
    const updatedEl = applyBackgroundImageImmediate(slideIndex, imageUrl);
    iframeRefs.current.forEach((f) => {
      const d = f?.contentDocument || f?.contentWindow?.document;
      if (!d) return;
      d.querySelectorAll('[data-editable]').forEach(el => el.classList.remove('selected'));
    });

    if (updatedEl) {
      updatedEl.classList.add('selected');
      const isImg = updatedEl.tagName === 'IMG';
      selectedImageRefs.current[slideIndex] = isImg ? (updatedEl as HTMLImageElement) : null;
    }

    setSelectedElement({ slideIndex, element: 'background' });
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setFocusedSlide(slideIndex);
    updateEditedValue(slideIndex, 'background', imageUrl);
  };

  /** ====================== Abrir popup ======================= */
  const openImageEditModal = async (slideIndex: number) => {
    const getPreviewHtml = (): string => renderedSlides[slideIndex] || '';
    const iframe = iframeRefs.current[slideIndex];
    await waitImagesReady(iframe, 600);

    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!doc) return;

    const selected = doc.querySelector('[data-editable].selected') as HTMLElement | null;
    const largest = findLargestVisual(doc);
    let chosen: HTMLElement | null = selected || largest?.el || null;

    const selectedIsBody = chosen && chosen === doc.body;
    const selectedHasBg = !!(chosen && doc.defaultView?.getComputedStyle(chosen).backgroundImage.includes('url('));

    if (!chosen || selectedIsBody || (!selectedHasBg && chosen.tagName !== 'IMG' && chosen.tagName !== 'VIDEO')) {
      chosen = largest?.el || null;
    }
    if (!chosen) { chosen = doc.body; }

    if (!chosen.id) chosen.id = `edit-${Date.now()}`;
    const targetSelector = `#${chosen.id}`;

    // tipo + url
    let imageUrl = '';
    let targetType: TargetKind = 'img';
    let isVideo = false;

    if (chosen.tagName === 'VIDEO') {
      const video = chosen as HTMLVideoElement;
      const sourceEl = video.querySelector('source') as HTMLSourceElement | null;
      imageUrl = video.currentSrc || video.src || sourceEl?.src || '';
      targetType = 'vid';
      isVideo = true;
    } else if (chosen.tagName === 'IMG') {
      imageUrl = resolveImgUrl(chosen as HTMLImageElement);
      targetType = 'img';
    } else {
      const cs = doc.defaultView?.getComputedStyle(chosen);
      const m = cs?.backgroundImage?.match(/url\(["']?(.+?)["']?\)/i);
      imageUrl = m?.[1] || '';
      targetType = 'bg';
    }

    if (!imageUrl) {
      const c = carouselData.conteudos[slideIndex] || {};
      imageUrl =
        editedContent[`${slideIndex}-background`] ||
        uploadedImages[slideIndex] ||
        c.thumbnail_url ||
        c.imagem_fundo ||
        c.imagem_fundo2 ||
        c.imagem_fundo3 ||
        '';
      if (!imageUrl) return;
      targetType = targetType === 'vid' ? 'vid' : 'bg';
    }

    // métricas alvo
    const r = chosen.getBoundingClientRect();
    const bodyRect = doc.body.getBoundingClientRect();
    const targetLeftPx = (r.left || 0) - (bodyRect.left || 0);
    const targetTopPx  = (r.top  || 0) - (bodyRect.top  || 0);
    const targetWidthPx = Math.max(1, r.width || slideWidth);
    const targetHeightPx = Math.max(1, r.height || slideHeight);

    const previewHtml = getPreviewHtml();

    if (isVideo) {
      const video = chosen as HTMLVideoElement;
      const videoW = targetWidthPx;
      const videoH = targetHeightPx;

      setImageModal({
        open: true, slideIndex, targetType: 'vid', targetSelector, imageUrl,
        slideW: slideWidth, slideH: slideHeight,
        containerHeightPx: targetHeightPx,
        naturalW: video.videoWidth || videoW, naturalH: video.videoHeight || videoH,
        imgOffsetTopPx: 0, imgOffsetLeftPx: 0,
        targetWidthPx, targetLeftPx, targetTopPx,
        isVideo: true,
        videoTargetW: videoW, videoTargetH: videoH,
        videoTargetLeft: targetLeftPx, videoTargetTop: targetTopPx,
        cropX: 0, cropY: 0, cropW: videoW, cropH: videoH,
        previewHtml,
      });
      document.documentElement.style.overflow = 'hidden';
      return;
    }

    // imagem/bg
    const tmp = new Image();
    tmp.src = imageUrl;
    const natW = tmp.naturalWidth || targetWidthPx || 1;
    const natH = tmp.naturalHeight || targetHeightPx || 1;

    const contW = targetWidthPx;
    const contH = targetHeightPx;

    // offsets iniciais (usando cover para “centro”, mas a render do modal será fit-width)
    const { displayW: covW, displayH: covH } = computeCover(natW, natH, contW, contH);
    const { left: centerLeft, top: centerTop, minLeft } = centeredOffsets(covW, covH, contW, contH);

    let imgOffsetTopPx = centerTop;
    let imgOffsetLeftPx = centerLeft;

    if (targetType === 'img') {
      const top = parseFloat((chosen as HTMLImageElement).style.top || `${centerTop}`);
      const left = parseFloat((chosen as HTMLImageElement).style.left || `${centerLeft}`);
      imgOffsetTopPx = isNaN(top) ? centerTop : top;
      imgOffsetLeftPx = isNaN(left) ? centerLeft : left;
    } else if (targetType === 'bg') {
      const cs2 = doc.defaultView?.getComputedStyle(chosen);
      const bgPosY = cs2?.backgroundPositionY || '50%';
      const bgPosX = cs2?.backgroundPositionX || '50%';
      const toPerc = (v: string) => v.endsWith('%') ? parseFloat(v) / 100 : 0.5;
      const pxFromPerc = (perc: number, maxOffset: number) => -Math.max(0, maxOffset) * clamp(perc, 0, 1);
      const offY = pxFromPerc(toPerc(bgPosY), covH - contH);
      const offX = pxFromPerc(toPerc(bgPosX), covW - contW);
      imgOffsetTopPx = isNaN(offY) ? centerTop : offY;
      imgOffsetLeftPx = isNaN(offX) ? centerLeft : offX;
    }

    setImageModal({
      open: true,
      slideIndex,
      targetType,
      targetSelector,
      imageUrl,
      slideW: slideWidth,
      slideH: slideHeight,
      containerHeightPx: contH,
      naturalW: natW,
      naturalH: natH,
      imgOffsetTopPx,
      imgOffsetLeftPx,
      targetWidthPx: contW,
      targetLeftPx,
      targetTopPx,
      isVideo: false,
      videoTargetW: 0,
      videoTargetH: 0,
      videoTargetLeft: 0,
      videoTargetTop: 0,
      cropX: 0, cropY: 0, cropW: 0, cropH: 0,
      previewHtml,
    });
    setIsImageDragging(false);
    document.documentElement.style.overflow = 'hidden';
  };

  /** ====================== Aplicar popup ======================= */
  const applyImageEditModal = () => {
    if (!imageModal.open) return;

    const {
      slideIndex, targetType, targetSelector, imageUrl,
      containerHeightPx, imgOffsetTopPx, imgOffsetLeftPx, naturalW, naturalH, targetWidthPx,
      isVideo, videoTargetW, videoTargetH, cropX, cropY, cropW, cropH
    } = imageModal;

    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!doc) { setImageModal({ open: false }); document.documentElement.style.overflow = ''; return; }

    const el = doc.querySelector(targetSelector) as HTMLElement | null;
    if (!el) { setImageModal({ open: false }); document.documentElement.style.overflow = ''; return; }

    if (isVideo && targetType === 'vid') {
      const vid = el as HTMLVideoElement;
      let wrapper = vid.parentElement;
      if (!wrapper || !wrapper.classList.contains('vid-crop-wrapper')) {
        const w = doc.createElement('div');
        w.className = 'vid-crop-wrapper';
        w.style.display = 'inline-block';
        w.style.position = 'relative';
        w.style.overflow = 'hidden';
        w.style.borderRadius = doc.defaultView?.getComputedStyle(vid).borderRadius || '';
        if (vid.parentNode) vid.parentNode.replaceChild(w, vid);
        w.appendChild(vid);
        wrapper = w;
      }
      (wrapper as HTMLElement).style.width = `${cropW}px`;
      (wrapper as HTMLElement).style.height = `${cropH}px`;
      vid.style.position = 'absolute';
      vid.style.left = `${-cropX}px`;
      vid.style.top = `${-cropY}px`;
      vid.style.width = `${videoTargetW}px`;
      vid.style.height = `${videoTargetH}px`;
      vid.style.objectFit = 'cover';
      if (vid.src !== imageUrl) vid.src = imageUrl;

      setImageModal({ open: false }); document.documentElement.style.overflow = '';
      return;
    }

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
      (wrapper as HTMLElement).style.width = `${targetWidthPx}px`;
      (wrapper as HTMLElement).style.height = `${containerHeightPx}px`;

      // Ao aplicar no slide: COVER (para não deixar buracos)
      const { displayW, displayH } = computeCover(naturalW, naturalH, targetWidthPx, containerHeightPx);
      const minLeft = targetWidthPx - displayW;
      const minTop  = containerHeightPx - displayH;
      const safeLeft = clamp(isNaN(imgOffsetLeftPx) ? (minLeft/2) : imgOffsetLeftPx, minLeft, 0);
      const safeTop  = clamp(isNaN(imgOffsetTopPx)  ? (minTop/2)  : imgOffsetTopPx,  minTop,  0);

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
      (el as HTMLImageElement).style.backfaceVisibility = 'hidden';
      (el as HTMLImageElement).style.transform = 'translateZ(0)';
    } else if (targetType === 'bg') {
      const { displayW, displayH } = computeCover(naturalW, naturalH, targetWidthPx, containerHeightPx);
      const maxOffsetX = Math.max(0, displayW - targetWidthPx);
      const maxOffsetY = Math.max(0, displayH - containerHeightPx);
      let xPerc = maxOffsetX ? (-imgOffsetLeftPx / maxOffsetX) * 100 : 50;
      let yPerc = maxOffsetY ? (-imgOffsetTopPx  / maxOffsetY) * 100 : 50;
      if (!isFinite(xPerc)) xPerc = 50;
      if (!isFinite(yPerc)) yPerc = 50;

      el.setAttribute('data-bg-image-url', imageUrl);
      el.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
      el.style.setProperty('background-repeat', 'no-repeat', 'important');
      el.style.setProperty('background-size', 'cover', 'important');
      el.style.setProperty('background-position-x', `${xPerc}%`, 'important');
      el.style.setProperty('background-position-y', `${yPerc}%`, 'important');
      el.style.setProperty('height', `${containerHeightPx}px`, 'important');
      if ((doc.defaultView?.getComputedStyle(el).position || 'static') === 'static') el.style.position = 'relative';
    }

    setImageModal({ open: false });
    setIsImageDragging(false);
    document.documentElement.style.overflow = '';
  };

  /** ====================== VIDEO: drag/resize ======================= */
  useEffect(() => {
    if (!(imageModal.open && imageModal.isVideo)) return;
    const onMove = (e: MouseEvent) => {
      if (!cropResizeRef.current.active) return;
      const pos = cropResizeRef.current.pos!;
      const dx = e.movementX; const dy = e.movementY;
      setImageModal(prev => {
        if (!prev.open || !prev.isVideo) return prev;
        const vW = prev.videoTargetW; const vH = prev.videoTargetH;
        const clampRect = (x:number,y:number,w:number,h:number) => {
          w = Math.max(40, Math.min(w, vW));
          h = Math.max(40, Math.min(h, vH));
          x = clamp(x, 0, vW - w);
          y = clamp(y, 0, vH - h);
          return { x,y,w,h };
        };
        let { cropX:x, cropY:y, cropW:w, cropH:h } = prev;
        if (pos.includes('w')) { const nx = x + dx; const dw = x - nx; x = nx; w = w + dw; }
        if (pos.includes('e')) { w = w + dx; }
        if (pos.includes('n')) { const ny = y + dy; const dh = y - ny; y = ny; h = h + dh; }
        if (pos.includes('s')) { h = h + dy; }
        const c = clampRect(x,y,w,h);
        return { ...prev, cropX: c.x, cropY: c.y, cropW: c.w, cropH: c.h };
      });
    };
    const onUp = () => { cropResizeRef.current.active = false; cropResizeRef.current.pos = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [imageModal.open, imageModal.isVideo]);

  useEffect(() => {
    if (!(imageModal.open && imageModal.isVideo)) return;
    const onMove = (e: MouseEvent) => {
      if (!cropDragRef.current) return;
      const dx = e.movementX; const dy = e.movementY;
      setImageModal(prev => {
        if (!prev.open || !prev.isVideo) return prev;
        const vW = prev.videoTargetW; const vH = prev.videoTargetH;
        let { cropX:x, cropY:y, cropW:w, cropH:h } = prev;
        const nx = x + dx; const ny = y + dy;
        const clampRect = (x:number,y:number,w:number,h:number) => {
          w = Math.max(40, Math.min(w, vW));
          h = Math.max(40, Math.min(h, vH));
          x = clamp(x, 0, vW - w);
          y = clamp(y, 0, vH - h);
          return { x,y,w,h };
        };
        const c = clampRect(nx, ny, w, h);
        return { ...prev, cropX: c.x, cropY: c.y, cropW: c.w, cropH: c.h };
      });
    };
    const onUp = () => { cropDragRef.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [imageModal.open, imageModal.isVideo]);

  /** ====================== UI handlers ======================= */
  useEffect(() => {
    // segurança extra: soltar mouse cancela "arrastando"
    const onUp = () => setIsImageDragging(false);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

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

      if (element === 'background') {
        const best = findLargestVisual(doc);
        if (best?.el) best.el.classList.add('selected');
        else doc.body.classList.add('selected');
      } else {
        const target = doc.getElementById(`slide-${slideIndex}-${element}`);
        if (target) target.classList.add('selected');
      }
    }

    setSelectedElement({ slideIndex, element });
    setFocusedSlide(slideIndex);
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setTimeout(() => setIsLoadingProperties(false), 100);
  };

  const getElementKey = (slideIndex: number, element: ElementType) => `${slideIndex}-${element}`;
  const getEditedValue = (slideIndex: number, field: string, def: any) => editedContent[`${slideIndex}-${field}`] ?? def;
  const updateEditedValue = (slideIndex: number, field: string, value: any) => setEditedContent(prev => ({ ...prev, [`${slideIndex}-${field}`]: value }));
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

  const lastSearchId = useRef(0);
  const handleSearchImages = async () => {
    if (!searchKeyword.trim()) return;
    setIsSearching(true);
    const id = ++lastSearchId.current;
    try {
      const imageUrls = await searchImages(searchKeyword);
      if (id === lastSearchId.current) setSearchResults(imageUrls);
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
      a.href = url; a.download = `slide-${index + 1}.html`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    });
  };

  /** ====================== Render ======================= */
  return (
    <div className="fixed top-14 left-16 right-0 bottom-0 bg-neutral-900 flex" style={{ zIndex: 99 }}>
      {/* === MODAL === */}
      {imageModal.open && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999]">
            <div className="absolute inset-0 bg-black/70" />
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl w-[min(92vw,1200px)] h-[min(90vh,900px)] shadow-2xl pointer-events-auto overflow-hidden" role="dialog" aria-modal="true" style={{ resize: 'vertical' }}>
                <div className="h-12 px-4 flex items-center justify-between border-b border-neutral-800">
                  <div className="text-white font-medium text-sm">
                    {imageModal.isVideo ? 'Crop do vídeo' : 'Edição da imagem'} — Slide {imageModal.slideIndex + 1}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={applyImageEditModal} className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded">Aplicar</button>
                    <button onClick={() => { setImageModal({ open: false }); setIsImageDragging(false); document.documentElement.style.overflow=''; }} className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded" aria-label="Fechar popup">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="w-full h-[calc(100%-3rem)] p-4 overflow-auto">
                  {imageModal.isVideo ? (
                    <div className="text-neutral-400 text-xs mb-3 space-y-1">
                      <div>• Arraste o <span className="text-neutral-200">retângulo</span> para mover o crop.</div>
                      <div>• Use os <span className="text-neutral-200">handles</span> para redimensionar.</div>
                    </div>
                  ) : (
                    <div className="text-neutral-400 text-xs mb-3 space-y-1">
                      <div>• Arraste a imagem verticalmente para ajustar o enquadramento.</div>
                      <div>• A parte fora do container fica visível com ~40% enquanto arrasta.</div>
                    </div>
                  )}

                  <div className="grid place-items-center">
                    <div className="relative bg-neutral-100 rounded-xl shadow-xl border border-neutral-800" style={{ width: `${imageModal.slideW}px`, height: `${imageModal.slideH}px`, overflow: 'hidden' }}>
                      {/* Slide completo */}
                      <iframe
                        srcDoc={imageModal.previewHtml}
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        sandbox="allow-same-origin allow-scripts"
                        title={`Slide Preview ${imageModal.slideIndex + 1}`}
                      />

                      {/* ======= MODO IMAGEM (fit-width no popup) ======= */}
                      {!imageModal.isVideo ? (() => {
                        const containerLeft = imageModal.targetLeftPx;
                        const containerTop = imageModal.targetTopPx;
                        const containerWidth = imageModal.targetWidthPx;
                        const containerHeight = imageModal.containerHeightPx;

                        // >>> AQUI trocamos de COVER para FIT-WIDTH para exibir altura total
                        const { displayW, displayH } = computeFitWidthBleed(
                          imageModal.naturalW, imageModal.naturalH, containerWidth, 2
                        );

                        const minLeft  = containerWidth - displayW;   // leve bleed, pode ser -2
                        const maxLeft  = 0;

                        const clampedLeft = clamp(imageModal.imgOffsetLeftPx, minLeft, maxLeft);
                        const freeTop = imageModal.imgOffsetTopPx; // vertical livre

                        const canDragX = displayW > containerWidth; // true se tiver bleed
                        const dragCursor: React.CSSProperties['cursor'] =
                          canDragX ? 'move' : 'ns-resize';

                        return (
                          <>
                            {/* Borda do container */}
                            <div className="absolute rounded-lg pointer-events-none"
                              style={{ left: containerLeft - 2, top: containerTop - 2, width: containerWidth + 4, height: containerHeight + 4, boxShadow: '0 0 0 2px rgba(59,130,246,0.9)' }} />

                            {/* GHOST: imagem completa SEM CLIP (altura total) */}
                            <img
                              src={imageModal.imageUrl}
                              alt="ghost"
                              draggable={false}
                              className="absolute pointer-events-none"
                              style={{
                                left: `${containerLeft + clampedLeft}px`,
                                top: `${containerTop + freeTop}px`,
                                width: `${displayW}px`,
                                height: `${displayH}px`, // altura total proporcional
                                opacity: isImageDragging ? 0.4 : 0,
                                transition: 'opacity 120ms ease',
                                objectFit: 'cover',
                                backfaceVisibility: 'hidden',
                                transform: 'translateZ(0)',
                                zIndex: 4,
                              }}
                            />

                            {/* Container com CLIP */}
                            <div
                              className="absolute bg-neutral-900 rounded-lg"
                              style={{ left: containerLeft, top: containerTop, width: containerWidth, height: containerHeight, overflow: 'hidden', zIndex: 5 }}
                            >
                              <img
                                src={imageModal.imageUrl}
                                alt="to-edit"
                                draggable={false}
                                style={{
                                  position: 'absolute',
                                  left: `${clampedLeft}px`,
                                  top: `${freeTop}px`, // topo livre
                                  width: `${displayW}px`,
                                  height: `${displayH}px`, // altura total proporcional
                                  userSelect: 'none',
                                  pointerEvents: 'none',
                                  objectFit: 'cover',
                                  backfaceVisibility: 'hidden',
                                  transform: 'translateZ(0)',
                                }}
                              />

                              <DragSurface
                                enabled={true}
                                cursor={dragCursor}
                                onDragStart={() => setIsImageDragging(true)}
                                onDragEnd={() => setIsImageDragging(false)}
                                onDrag={(dx, dy) => {
                                  const nextLeft = canDragX ? clamp(imageModal.imgOffsetLeftPx + dx, minLeft, maxLeft) : clampedLeft;
                                  const nextTop  = imageModal.imgOffsetTopPx + dy; // livre no Y (move apenas enquanto mouse pressionado)
                                  if (nextLeft !== imageModal.imgOffsetLeftPx || nextTop !== imageModal.imgOffsetTopPx) {
                                    setImageModal({ ...imageModal, imgOffsetLeftPx: nextLeft, imgOffsetTopPx: nextTop });
                                  }
                                }}
                              />

                              <ResizeBar
                                position="bottom"
                                onResize={(dy) => {
                                  const newH = Math.max(60, containerHeight + dy);
                                  // ao mudar a altura do container, mantemos FIT-WIDTH (displayW depende do width, não do height)
                                  const { displayW: newDisplayW } =
                                    computeFitWidthBleed(imageModal.naturalW, imageModal.naturalH, containerWidth, 2);
                                  const newMinLeft = containerWidth - newDisplayW;
                                  const adjLeft = clamp(imageModal.imgOffsetLeftPx, newMinLeft, 0);
                                  setImageModal({
                                    ...imageModal,
                                    containerHeightPx: newH,
                                    imgOffsetLeftPx: adjLeft
                                  });
                                }}
                              />
                            </div>
                          </>
                        );
                      })() : (
                        // ======= MODO VÍDEO (inalterado) =======
                        (() => {
                          const vLeft = imageModal.videoTargetLeft;
                          const vTop  = imageModal.videoTargetTop;
                          const vW    = imageModal.videoTargetW;
                          const vH    = imageModal.videoTargetH;
                          return (
                            <>
                              <div className="absolute rounded-lg pointer-events-none"
                                style={{ left: vLeft - 2, top:  vTop - 2, width: vW + 4, height: vH + 4, boxShadow: '0 0 0 2px rgba(59,130,246,0.9)' }} />
                              <div
                                className="absolute"
                                style={{
                                  left: vLeft + imageModal.cropX, top: vTop + imageModal.cropY,
                                  width: imageModal.cropW, height: imageModal.cropH,
                                  boxShadow: '0 0 0 2px rgba(59,130,246,1), inset 0 0 0 1px rgba(255,255,255,0.6)',
                                  background: 'transparent', cursor: 'move',
                                }}
                                onMouseDown={(e) => { e.preventDefault(); cropDragRef.current = true; }}
                              >
                                {(Object.keys(handleStyles) as HandlePos[]).map((pos) => (
                                  <div
                                    key={pos}
                                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); cropResizeRef.current.active = true; cropResizeRef.current.pos = pos; }}
                                    style={{ position: 'absolute', background: 'white', borderRadius: 999, boxShadow: '0 0 0 1px rgba(0,0,0,0.4)', ...handleStyles[pos] }}
                                  />
                                ))}
                              </div>
                            </>
                          );
                        })()
                      )}
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
                <button onClick={() => { toggleLayer(index); handleSlideClick(index); }} className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-900 transition-colors">
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

      {/* ============ Canvas ============ */}
      <div className="flex-1 flex flex-col">
        <div className="h-14 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-white font-semibold">Carousel Editor</h2>
            <div className="text-neutral-500 text-sm">{slides.length} slides</div>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={() => setZoom(p => Math.max(0.1, p - 0.1))} className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors" title="Zoom Out" disabled={imageModal.open}>
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="bg-neutral-800 text-white px-3 py-1.5 rounded text-xs min-w-[70px] text-center">{Math.round(zoom * 100)}%</div>
            <button onClick={() => setZoom(p => Math.min(2, p + 0.1))} className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors" title="Zoom In" disabled={imageModal.open}>
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-neutral-800 mx-2" />
            <button onClick={handleDownloadAll} className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded transition-colors flex items-center space-x-2 text-sm" title="Download All Slides" disabled={imageModal.open}>
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
            <button onClick={onClose} className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors" title="Close (Esc)">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative bg-neutral-800"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onWheel={(e) => {
            e.preventDefault();
            if (imageModal.open) return;
            const container = containerRef.current!;
            const rect = container.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left - pan.x) / zoom;
            const mouseY = (e.clientY - rect.top  - pan.y) / zoom;
            if (e.ctrlKey) {
              const delta = e.deltaY > 0 ? -0.05 : 0.05;
              const newZoom = Math.min(Math.max(0.1, zoom + delta), 2);
              setZoom(newZoom);
              setPan({ x: e.clientX - rect.left - mouseX * newZoom, y: e.clientY - rect.top  - mouseY * newZoom });
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
                  <iframe
                    ref={(el) => (iframeRefs.current[i] = el)}
                    srcDoc={slide}
                    className="w-full h-full border-0"
                    title={`Slide ${i + 1}`}
                    sandbox="allow-same-origin allow-scripts"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-neutral-950/90 backdrop-blur-sm text-neutral-400 px-3 py-1.5 rounded text-xs z-[2]">
            Zoom: {Math.round(zoom * 100)}%
          </div>
        </div>
      </div>

      {/* ============ Sidebar direita (Properties) ============ */}
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
                      <input type="color" className="w-12 h-10 bg-neutral-900 border border-neutral-800 rounded cursor-pointer"
                        value={getElementStyle(selectedElement.slideIndex, selectedElement.element).color}
                        onChange={(e) => updateElementStyle(selectedElement.slideIndex, selectedElement.element!, 'color', e.target.value)}
                      />
                      <input type="text" className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
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
                        <button onClick={() => openImageEditModal(selectedElement.slideIndex)} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded" title="Abrir popup de edição">Editar</button>
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
                              <div className="text-neutral-400 text-xs mb-1 flex items-center justify-between">
                                <span>{isVid ? 'Video 1' : 'Image 1'}</span>
                                {isVid && <Play className="w-3 h-3" />}
                              </div>
                              <div className="relative">
                                <img src={displayUrl} alt="BG 1" className="w-full h-24 object-cover rounded" />
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
                            <div className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`} onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}>
                              <div className="text-neutral-400 text-xs mb-1">{isVid ? 'Video 2' : 'Image 2'}</div>
                              <img src={bgUrl} alt="BG 2" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}
                        {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3 && (() => {
                          const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3!;
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                          const isVid = isVideoUrl(bgUrl);
                          return (
                            <div className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`} onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}>
                              <div className="text-neutral-400 text-xs mb-1">{isVid ? 'Video 3' : 'Image 3'}</div>
                              <img src={bgUrl} alt="BG 3" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}
                        {uploadedImages[selectedElement.slideIndex] && (() => {
                          const bgUrl = uploadedImages[selectedElement.slideIndex];
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                          return (
                            <div className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`} onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}>
                              <div className="text-neutral-400 text-xs mb-1">Image 4 (Uploaded)</div>
                              <img src={bgUrl} alt="BG 4" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}
                      </div>

                      <div className="mt-3">
                        <label className="text-neutral-400 text-xs mb-2 block font-medium">Search Images</label>
                        <div className="relative">
                          <input type="text" className="w-full bg-neutral-900 border border-neutral-800 rounded pl-10 pr-20 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors" placeholder="Search for images..."
                            value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearchImages(); }} />
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500" />
                          <button onClick={handleSearchImages} disabled={isSearching || !searchKeyword.trim()} className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white px-3 py-1 rounded text-xs transition-colors">
                            {isSearching ? 'Searching...' : 'Search'}
                          </button>
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