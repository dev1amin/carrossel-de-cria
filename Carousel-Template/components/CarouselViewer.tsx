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
      containerHeightPx: number;
      naturalW: number;
      naturalH: number;
      imgOffsetTopPx: number;
      imgOffsetLeftPx: number;
      targetWidthPx: number;
      targetLeftPx: number;
      targetTopPx: number;
    }
  | { open: false };

/** ====================== Componentes auxiliares ======================= */

// === PORTAL DO MODAL ===
const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const elRef = useRef<HTMLDivElement | null>(null);
  if (!elRef.current) {
    elRef.current = document.createElement('div');
  }
  useEffect(() => {
    const el = elRef.current!;
    el.style.zIndex = '9999';
    document.body.appendChild(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);
  return ReactDOM.createPortal(children, elRef.current);
};

// DragSurface 2D com enable/disable e cursor dinâmico
const DragSurface: React.FC<{ onDrag: (dx: number, dy: number) => void; disabled?: boolean; cursor?: React.CSSProperties['cursor'] }> = ({ onDrag, disabled, cursor }) => {
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      onDrag(e.movementX, e.movementY);
    };
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
      onMouseDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        dragging.current = true;
      }}
      className="absolute inset-0"
      style={{ zIndex: 10, background: 'transparent', cursor: disabled ? 'default' : (cursor || 'move'), pointerEvents: disabled ? 'none' : 'auto' }}
    />
  );
};

const ResizeBar: React.FC<{ position: 'top' | 'bottom'; onResize: (dy: number) => void }> = ({ position, onResize }) => {
  const resizing = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const dy = e.movementY * (position === 'top' ? -1 : 1);
      onResize(dy);
    };
    const onUp = () => { resizing.current = false; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onResize, position]);

  return (
    <div
      onMouseDown={(e) => { e.preventDefault(); resizing.current = true; }}
      className={`absolute left-0 right-0 h-3 ${position === 'top' ? '-top-1 cursor-n-resize' : '-bottom-1 cursor-s-resize'}`}
      style={{ zIndex: 20, background: 'transparent' }}
    >
      <div className="mx-auto w-12 h-1 rounded-full bg-blue-500/80" />
    </div>
  );
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

  // === MODAL DE EDIÇÃO DE IMAGEM/VÍDEO ===
  const [imageModal, setImageModal] = useState<ImageEditModalState>({ open: false });

  // refs
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({}); // mantido para retrocompat; vídeo não usa isso

  /** ============== Constantes de layout ======================= */
  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  /** ====================== Eventos globais ======================= */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (cropMode) { setCropMode(null); return; }
        if (imageModal.open) { setImageModal({ open: false }); document.documentElement.style.overflow=''; return; }
        if (selectedElement.element !== null) {
          setSelectedElement({ slideIndex: selectedElement.slideIndex, element: null });
        } else {
          onClose();
        }
      }
      if (e.key === 'ArrowRight') handleSlideClick(Math.min((focusedSlide ?? 0)+1, slides.length-1));
      if (e.key === 'ArrowLeft')  handleSlideClick(Math.max((focusedSlide ?? 0)-1, 0));
      if (e.key === 'Enter' && selectedElement.element === null) handleElementClick(focusedSlide ?? 0, 'title');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cropMode, imageModal, selectedElement, onClose, focusedSlide, slides.length]);

  /** ====================== Injeção de ids editáveis ======================= */
  const ensureStyleTag = (html: string) => {
    if (!/<style[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1><style></style>`);
    }
    return html;
  };

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
      img[data-editable], video[data-editable]{display:block!important}
    `);

    result = result.replace(
      /<body([^>]*)>/i,
      (m, attrs) => /id=/.test(attrs) ? m : `<body${attrs} id="slide-${slideIndex}-background" data-editable="background">`
    );
    return result;
  };

  useEffect(() => {
    setRenderedSlides(slides.map((s, i) => injectEditableIds(s, i)));
  }, [slides]);

  useEffect(() => {
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = 0 * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
    setFocusedSlide(0);
  }, []); // mount only

  /** ====================== Helpers COVER/OFFSET ======================= */
  const computeCover = (natW: number, natH: number, contW: number, contH: number) => {
    const scale = Math.max(contW / natW, contH / natH);
    return { displayW: natW * scale, displayH: natH * scale };
  };
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const centeredOffsets = (displayW: number, displayH: number, contW: number, contH: number) => {
    const minLeft = contW - displayW; // <= 0
    const minTop  = contH - displayH; // <= 0
    return { left: minLeft / 2, top:  minTop  / 2, minLeft, minTop };
  };
  const computeCoverBleed = (natW: number, natH: number, contW: number, contH: number, bleedPx = 2) => {
    const scale = Math.max(contW / natW, contH / natH);
    const displayW = Math.ceil(natW * scale) + bleedPx;
    const displayH = Math.ceil(natH * scale) + bleedPx;
    return { displayW, displayH };
  };

  /** ====================== Helpers de DOM (iframe) ======================= */

  const findLargestVisual = (doc: Document): { type: 'img' | 'bg' | 'vid', el: HTMLElement } | null => {
    let best: { type: 'img' | 'bg' | 'vid', el: HTMLElement, area: number } | null = null;

    const imgs = Array.from(doc.querySelectorAll('img')) as HTMLImageElement[];
    imgs.forEach(img => {
      if (img.getAttribute('data-protected') === 'true' || isImgurUrl(img.src)) return;
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > 9000) if (!best || area > best.area) best = { type: 'img', el: img, area };
    });

    const vids = Array.from(doc.querySelectorAll('video')) as HTMLVideoElement[];
    vids.forEach(v => {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > 9000) if (!best || area > best.area) best = { type: 'vid', el: v, area };
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

  // ==== helpers de troca entre IMG/VIDEO ====
  const replaceElWithImg = (doc: Document, el: HTMLElement, url: string): HTMLImageElement => {
    const img = doc.createElement('img');
    img.src = url;
    img.setAttribute('data-editable', 'image');
    img.loading = 'eager';
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    if (el.id) img.id = el.id; else img.id = `img-${Date.now()}`;
    el.replaceWith(img);
    return img;
  };

  const replaceElWithVideo = (doc: Document, el: HTMLElement, url: string): HTMLVideoElement => {
    const video = doc.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('data-editable', 'image');
    video.src = url;
    if (el.id) video.id = el.id; else video.id = `vid-${Date.now()}`;
    el.replaceWith(video);
    // start
    video.play().catch(()=>{});
    return video;
  };

  const applyBackgroundImageImmediate = (slideIndex: number, mediaUrl: string): HTMLElement | null => {
    const iframe = iframeRefs.current[slideIndex];
    if (!iframe || !iframe.contentWindow) return null;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return null;

    const best = findLargestVisual(doc);
    if (!best) {
      // fallback: body bg sempre cover/center
      doc.body.style.setProperty('background-image', `url('${mediaUrl}')`, 'important');
      doc.body.style.setProperty('background-repeat', 'no-repeat', 'important');
      doc.body.style.setProperty('background-size', 'cover', 'important');
      doc.body.style.setProperty('background-position', '50% 50%', 'important');
      return doc.body;
    }

    if (best.type === 'bg') {
      if (isVideoUrl(mediaUrl)) {
        // não dá para definir video como background-image, então criamos <video> posicionado dentro do BG element
        const host = best.el;
        // limpa background-image (vamos usar elemento filho)
        host.style.removeProperty('background-image');
        let inner = host.querySelector(':scope > video.__bg_media, :scope > img.__bg_media') as HTMLMediaElement | HTMLImageElement | null;
        if (inner) inner.remove();
        const video = doc.createElement('video');
        video.className = '__bg_media';
        Object.assign(video.style, {
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          height: '100%',
          objectFit: 'cover' as any,
          pointerEvents: 'none',
        });
        video.autoplay = true; video.muted = true; video.loop = true; video.playsInline = true;
        video.src = mediaUrl;
        host.style.position = host.style.position || 'relative';
        host.appendChild(video);
        video.play().catch(()=>{});
        return video;
      } else {
        best.el.style.setProperty('background-image', `url('${mediaUrl}')`, 'important');
        best.el.style.setProperty('background-repeat', 'no-repeat', 'important');
        best.el.style.setProperty('background-size', 'cover', 'important');
        best.el.style.setProperty('background-position', '50% 50%', 'important');
        // se tinha mídia filha de tentativa de video, remove
        const inner = best.el.querySelector(':scope > video.__bg_media, :scope > img.__bg_media');
        if (inner) inner.remove();
        return best.el;
      }
    }

    if (best.type === 'vid') {
      const videoEl = best.el as HTMLVideoElement;
      if (isVideoUrl(mediaUrl)) {
        videoEl.src = mediaUrl;
        videoEl.autoplay = true; videoEl.muted = true; videoEl.loop = true; videoEl.playsInline = true;
        videoEl.play().catch(()=>{});
        return videoEl;
      } else {
        // substituir video por imagem
        const img = replaceElWithImg(doc, videoEl, mediaUrl);
        return img;
      }
    }

    // best.type === 'img'
    const imgEl = best.el as HTMLImageElement;
    if (isVideoUrl(mediaUrl)) {
      // substituir imagem por vídeo
      const video = replaceElWithVideo(doc, imgEl, mediaUrl);
      return video;
    } else {
      imgEl.removeAttribute('srcset'); imgEl.removeAttribute('sizes'); imgEl.loading = 'eager';
      imgEl.src = mediaUrl; imgEl.setAttribute('data-bg-image-url', mediaUrl);
      return imgEl;
    }
  };

  /** ====================== Aplicações/efeitos no iframe ======================= */
  useEffect(() => {
    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe || !iframe.contentWindow) return;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;

      // marcar imagens e vídeos editáveis
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
      vids.forEach((vd) => {
        const v = vd as HTMLVideoElement;
        v.setAttribute('data-editable', 'image');
        if (!v.id) v.id = `slide-${index}-vid-${vidIdx++}`;
      });

      // aplica estilos texto + conteúdo
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

      // aplica bg escolhido (se houver) — cover + center
      const bg = editedContent[`${index}-background`];
      if (bg) {
        const best = findLargestVisual(doc);
        if (best?.type === 'bg') {
          if (isVideoUrl(bg)) {
            best.el.style.removeProperty('background-image');
            const innerOld = best.el.querySelector(':scope > video.__bg_media, :scope > img.__bg_media');
            if (innerOld) innerOld.remove();
            const v = doc.createElement('video');
            v.className = '__bg_media';
            Object.assign(v.style, {
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '100%',
              height: '100%',
              objectFit: 'cover' as any,
              pointerEvents: 'none',
            });
            v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
            v.src = bg;
            best.el.style.position = best.el.style.position || 'relative';
            best.el.appendChild(v);
            v.play().catch(()=>{});
          } else {
            best.el.style.setProperty('background-image', `url('${bg}')`, 'important');
            best.el.style.setProperty('background-repeat', 'no-repeat', 'important');
            best.el.style.setProperty('background-size', 'cover', 'important');
            best.el.style.setProperty('background-position', '50% 50%', 'important');
            const inner = best.el.querySelector(':scope > video.__bg_media, :scope > img.__bg_media');
            if (inner) inner.remove();
          }
        } else if (best?.type === 'img') {
          (best.el as HTMLImageElement).src = bg;
        } else if (best?.type === 'vid') {
          const v = best.el as HTMLVideoElement;
          if (isVideoUrl(bg)) { v.src = bg; v.play().catch(()=>{}); }
          else replaceElWithImg(doc, v, bg);
        } else {
          doc.body.style.setProperty('background-image', `url('${bg}')`, 'important');
          doc.body.style.setProperty('background-repeat', 'no-repeat', 'important');
          doc.body.style.setProperty('background-size', 'cover', 'important');
          doc.body.style.setProperty('background-position', '50% 50%', 'important');
        }
      }
    });
  }, [elementStyles, editedContent, originalStyles, renderedSlides]);

  /** ====================== Interações dentro do iframe ======================= */
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

  /** ====================== Painel lateral: trocar mídia e abrir modal ======================= */
  const handleBackgroundImageChange = (slideIndex: number, mediaUrl: string) => {
    const updatedEl = applyBackgroundImageImmediate(slideIndex, mediaUrl);

    // seleciona o alvo
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
    updateEditedValue(slideIndex, 'background', mediaUrl);
  };

  // ==== Abre SEMPRE, lendo estilos/posições do próprio iframe ====
  const openImageEditModal = (slideIndex: number) => {
    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!doc) return;

    // alvo: selecionado ou maior visual
    const selected = doc.querySelector('[data-editable].selected') as HTMLElement | null;
    const largest = findLargestVisual(doc);
    const chosen = selected || largest?.el || null;
    const chosenType: TargetKind | null = selected
      ? (selected.tagName === 'IMG' ? 'img' : selected.tagName === 'VIDEO' ? 'vid' : 'bg')
      : (largest?.type ?? null) as TargetKind | null;

    if (!chosen || !chosenType) return;

    // id estável
    if (!chosen.id) chosen.id = `img-edit-${Date.now()}`;
    const targetSelector = `#${chosen.id}`;

    // pega URL
    const cs = doc.defaultView?.getComputedStyle(chosen);
    let mediaUrl = '';
    let targetType: TargetKind = chosenType;
    if (chosenType === 'img') {
      mediaUrl = (chosen as HTMLImageElement).src;
    } else if (chosenType === 'vid') {
      const v = chosen as HTMLVideoElement;
      mediaUrl = (v.currentSrc || v.src || (v.querySelector('source') as HTMLSourceElement | null)?.src || '') ?? '';
    } else if (chosenType === 'bg') {
      if (cs?.backgroundImage && cs.backgroundImage.includes('url(')) {
        const m = cs.backgroundImage.match(/url\(["']?(.+?)["']?\)/i);
        mediaUrl = m?.[1] || '';
      } else {
        // pode haver mídia filha __bg_media
        const inner = chosen.querySelector(':scope > video.__bg_media, :scope > img.__bg_media') as HTMLVideoElement | HTMLImageElement | null;
        if (inner) {
          if (inner.tagName === 'VIDEO') { targetType = 'vid'; const v = inner as HTMLVideoElement; mediaUrl = v.currentSrc || v.src || ''; }
          else { targetType = 'img'; const i = inner as HTMLImageElement; mediaUrl = i.src; }
        }
      }
    }
    if (!mediaUrl) return;

    // métricas do alvo
    const r = chosen.getBoundingClientRect();
    const bodyRect = doc.body.getBoundingClientRect();
    const targetLeftPx = r.left - bodyRect.left;
    const targetTopPx  = r.top  - bodyRect.top;
    const targetWidthPx = r.width;
    const targetHeightPx = r.height;

    const containerHeightPx = targetHeightPx;

    const finalizeOpen = (natW: number, natH: number) => {
      const contW = targetWidthPx;
      const contH = containerHeightPx;
      const { displayW, displayH } = computeCover(natW, natH, contW, contH);
      const { left: centerLeft, top: centerTop, minLeft, minTop } = centeredOffsets(displayW, displayH, contW, contH);

      let imgOffsetTopPx = centerTop;
      let imgOffsetLeftPx = centerLeft;

      if (targetType === 'img' || targetType === 'vid') {
        const top = parseFloat((chosen as HTMLElement).style.top || `${centerTop}`);
        const left = parseFloat((chosen as HTMLElement).style.left || `${centerLeft}`);
        imgOffsetTopPx = clamp(isNaN(top) ? centerTop : top, minTop, 0);
        imgOffsetLeftPx = clamp(isNaN(left) ? centerLeft : left, minLeft, 0);
      } else {
        const cs2 = doc.defaultView?.getComputedStyle(chosen);
        const bgPosY = cs2?.backgroundPositionY || '50%';
        const bgPosX = cs2?.backgroundPositionX || '50%';
        const toPerc = (v: string) => v.endsWith('%') ? parseFloat(v) / 100 : 0.5;
        const pxFromPerc = (perc: number, maxOffset: number) => -clamp(perc, 0, 1) * Math.max(0, maxOffset);
        const offY = pxFromPerc(toPerc(bgPosY), displayH - contH);
        const offX = pxFromPerc(toPerc(bgPosX), displayW - contW);
        imgOffsetTopPx = clamp(isNaN(offY) ? centerTop : offY, minTop, 0);
        imgOffsetLeftPx = clamp(isNaN(offX) ? centerLeft : offX, minLeft, 0);
      }

      setImageModal({
        open: true,
        slideIndex,
        targetType,
        targetSelector,
        imageUrl: mediaUrl,
        slideW: slideWidth,
        slideH: slideHeight,
        containerHeightPx,
        naturalW: natW,
        naturalH: natH,
        imgOffsetTopPx,
        imgOffsetLeftPx,
        targetWidthPx,
        targetLeftPx,
        targetTopPx,
      });
      document.documentElement.style.overflow = 'hidden';
    };

    if (targetType === 'vid') {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.src = mediaUrl;
      v.onloadedmetadata = () => finalizeOpen(v.videoWidth || 1920, v.videoHeight || 1080);
      v.onerror = () => finalizeOpen(1920, 1080); // fallback bruto
    } else {
      const tmp = new Image();
      tmp.src = mediaUrl;
      if (tmp.complete && tmp.naturalWidth && tmp.naturalHeight) {
        finalizeOpen(tmp.naturalWidth, tmp.naturalHeight);
      } else {
        tmp.onload = () => finalizeOpen(tmp.naturalWidth, tmp.naturalHeight);
        tmp.onerror = () => finalizeOpen(1920, 1080); // fallback bruto
      }
    }
  };

  const applyImageEditModal = () => {
    if (!imageModal.open) return;

    const {
      slideIndex, targetType, targetSelector, imageUrl,
      containerHeightPx, imgOffsetTopPx, imgOffsetLeftPx, naturalW, naturalH, targetWidthPx
    } = imageModal;

    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!doc) { setImageModal({ open: false }); document.documentElement.style.overflow = ''; return; }

    const el = doc.querySelector(targetSelector) as HTMLElement | null;
    if (!el) { setImageModal({ open: false }); document.documentElement.style.overflow = ''; return; }

    const { displayW, displayH } = computeCoverBleed(naturalW, naturalH, targetWidthPx, containerHeightPx, 2);
    const { left: centerLeft, top: centerTop, minLeft, minTop } =
      centeredOffsets(displayW, displayH, targetWidthPx, containerHeightPx);
    const safeLeft = clamp(isNaN(imgOffsetLeftPx) ? centerLeft : imgOffsetLeftPx, minLeft, 0);
    const safeTop  = clamp(isNaN(imgOffsetTopPx)  ? centerTop  : imgOffsetTopPx,  minTop,  0);

    const ensureWrapper = (): HTMLElement => {
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
      return wrapper as HTMLElement;
    };

    if (targetType === 'img') {
      const wrapper = ensureWrapper();
      const node = el as HTMLImageElement;
      node.style.position = 'absolute';
      node.style.left = `${safeLeft}px`;
      node.style.top  = `${safeTop}px`;
      node.style.width  = `${displayW}px`;
      node.style.height = `${displayH}px`;
      node.style.maxWidth = 'unset';
      node.style.maxHeight = 'unset';
      node.style.objectFit = 'cover';
      node.style.backfaceVisibility = 'hidden';
      node.style.transform = 'translateZ(0)';
      node.removeAttribute('srcset');
      node.removeAttribute('sizes');
      node.loading = 'eager';
      if (node.src !== imageUrl) node.src = imageUrl;
    } else if (targetType === 'vid') {
      const wrapper = ensureWrapper();
      // se o el não é video (pode ter sido antes), trocamos
      let videoEl: HTMLVideoElement;
      if (el.tagName !== 'VIDEO') {
        videoEl = replaceElWithVideo(doc, el, imageUrl);
      } else {
        videoEl = el as HTMLVideoElement;
        if (videoEl.src !== imageUrl) videoEl.src = imageUrl;
      }
      videoEl.autoplay = true; videoEl.muted = true; videoEl.loop = true; videoEl.playsInline = true;
      videoEl.style.position = 'absolute';
      videoEl.style.left = `${safeLeft}px`;
      videoEl.style.top  = `${safeTop}px`;
      videoEl.style.width  = `${displayW}px`;
      videoEl.style.height = `${displayH}px`;
      (videoEl.style as any).objectFit = 'cover';
      videoEl.style.backfaceVisibility = 'hidden';
      videoEl.style.transform = 'translateZ(0)';
      videoEl.play().catch(()=>{});
      (wrapper as HTMLElement).style.width = `${targetWidthPx}px`;
      (wrapper as HTMLElement).style.height = `${containerHeightPx}px`;
    } else {
      // BACKGROUND: se a URL é vídeo, criamos filho <video> cover; senão, background-image cover
      const host = el;
      if (isVideoUrl(imageUrl)) {
        host.style.removeProperty('background-image');
        let inner = host.querySelector(':scope > video.__bg_media, :scope > img.__bg_media') as HTMLVideoElement | HTMLImageElement | null;
        if (!inner || inner.tagName !== 'VIDEO') {
          if (inner) inner.remove();
          inner = doc.createElement('video');
          inner.className = '__bg_media';
          Object.assign(inner.style, {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '100%',
            height: '100%',
            objectFit: 'cover' as any,
            pointerEvents: 'none',
          });
          (inner as HTMLVideoElement).autoplay = true;
          (inner as HTMLVideoElement).muted = true;
          (inner as HTMLVideoElement).loop = true;
          (inner as HTMLVideoElement).playsInline = true;
          host.style.position = host.style.position || 'relative';
          host.appendChild(inner);
        }
        (inner as HTMLVideoElement).src = imageUrl;
        (inner as HTMLVideoElement).play().catch(()=>{});
        host.style.setProperty('height', `${containerHeightPx}px`, 'important');
      } else {
        host.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
        host.style.setProperty('background-repeat', 'no-repeat', 'important');
        host.style.setProperty('background-size', 'cover', 'important');
        host.style.setProperty('background-position', '50% 50%', 'important');
        host.style.setProperty('height', `${containerHeightPx}px`, 'important');
        const inner = host.querySelector(':scope > video.__bg_media, :scope > img.__bg_media');
        if (inner) inner.remove();
      }
      if ((doc.defaultView?.getComputedStyle(host).position || 'static') === 'static') host.style.position = 'relative';
    }

    setImageModal({ open: false });
    document.documentElement.style.overflow = '';
  };

  /** ====================== Handlers UI ======================= */
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
      if (target) target.classList.add('selected');
      else if (element === 'background') doc.body.classList.add('selected');
    }

    setSelectedElement({ slideIndex, element });
    setFocusedSlide(slideIndex);
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setTimeout(() => setIsLoadingProperties(false), 100);
  };

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
      {/* === MODAL via PORTAL === */}
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
                  <div className="text-white font-medium text-sm">Edição da mídia — Slide {imageModal.slideIndex + 1}</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={applyImageEditModal}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded"
                    >
                      Aplicar
                    </button>
                    <button
                      onClick={() => { setImageModal({ open: false }); document.documentElement.style.overflow=''; }}
                      className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded"
                      aria-label="Fechar popup"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* conteúdo do editor (contexto do slide + máscara alinhada) */}
                <div className="w-full h-[calc(100%-3rem)] p-4 overflow-auto">
                  {/* Instruções */}
                  {(() => {
                    const containerWidth = imageModal.targetWidthPx;
                    const containerHeight = imageModal.containerHeightPx;
                    const { displayW, displayH } = computeCoverBleed(imageModal.naturalW, imageModal.naturalH, containerWidth, containerHeight, 2);
                    const minTop  = containerHeight - displayH;
                    const minLeft = containerWidth - displayW;
                    const canDragX = minLeft < 0;
                    const canDragY = minTop < 0;

                    return (
                      <div className="text-neutral-400 text-xs mb-3 space-y-1">
                        {canDragX || canDragY ? (
                          <>
                            <div>• Arraste a <span className="text-neutral-200">mídia</span> {canDragX && canDragY ? 'livremente' : canDragX ? 'na horizontal' : 'na vertical'} para ajustar o enquadramento.</div>
                            <div>• Arraste a <span className="text-neutral-200">borda inferior</span> para ajustar a área visível.</div>
                            <div>• As partes <span className="text-neutral-200">esmaecidas</span> não aparecerão no slide final.</div>
                          </>
                        ) : (
                          <>
                            <div>• Esta mídia <span className="text-neutral-200">já preenche 100%</span> do container. Não há margem para arrastar.</div>
                            <div>• Você ainda pode <span className="text-neutral-200">ajustar a altura</span> da área visível pela borda inferior.</div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  <div className="grid place-items-center">
                    <div
                      className="relative bg-neutral-100 rounded-xl shadow-xl border border-neutral-800"
                      style={{
                        width: `${imageModal.slideW}px`,
                        height: `${imageModal.slideH}px`,
                        overflow: 'hidden',
                      }}
                    >
                      {/* Preview do SLIDE COMPLETO */}
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

                        // COVER com bleed — sem vazamento
                        const { displayW, displayH } = computeCoverBleed(
                          imageModal.naturalW,
                          imageModal.naturalH,
                          containerWidth,
                          containerHeight,
                          2
                        );

                        // limites de movimento
                        const minTop  = containerHeight - displayH;   // <= 0
                        const maxTop  = 0;
                        const minLeft = containerWidth - displayW;    // <= 0
                        const maxLeft = 0;

                        const canDragX = minLeft < 0;
                        const canDragY = minTop  < 0;

                        const clampedTop  = clamp(imageModal.imgOffsetTopPx,  minTop,  maxTop);
                        const clampedLeft = clamp(imageModal.imgOffsetLeftPx, minLeft, maxLeft);

                        const rightW = imageModal.slideW - (containerLeft + containerWidth);
                        const bottomH = imageModal.slideH - (containerTop + containerHeight);

                        const dragCursor: React.CSSProperties['cursor'] =
                          canDragX && canDragY ? 'move' : canDragX ? 'ew-resize' : canDragY ? 'ns-resize' : 'default';

                        const mediaNode =
                          imageModal.targetType === 'vid' ? (
                            <video
                              src={imageModal.imageUrl}
                              autoPlay
                              muted
                              loop
                              playsInline
                              style={{
                                position: 'absolute',
                                left: `${clampedLeft}px`,
                                top: `${clampedTop}px`,
                                width: `${displayW}px`,
                                height: `${displayH}px`,
                                userSelect: 'none',
                                pointerEvents: 'none',
                                objectFit: 'cover' as any,
                                backfaceVisibility: 'hidden',
                                transform: 'translateZ(0)',
                              }}
                            />
                          ) : (
                            <img
                              src={imageModal.imageUrl}
                              alt="to-edit"
                              draggable={false}
                              style={{
                                position: 'absolute',
                                left: `${clampedLeft}px`,
                                top: `${clampedTop}px`,
                                width: `${displayW}px`,
                                height: `${displayH}px`,
                                userSelect: 'none',
                                pointerEvents: 'none',
                                objectFit: 'cover',
                                backfaceVisibility: 'hidden',
                                transform: 'translateZ(0)',
                              }}
                            />
                          );

                        return (
                          <>
                            {/* destaque do alvo */}
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

                            {/* overlays esmaecidos (fora da máscara) */}
                            <div className="absolute top-0 left-0 bg-black/30 pointer-events-none" style={{ width: '100%', height: containerTop }} />
                            <div className="absolute left-0 bg-black/30 pointer-events-none" style={{ top: containerTop, width: containerLeft, height: containerHeight }} />
                            <div className="absolute bg-black/30 pointer-events-none" style={{ top: containerTop, right: 0, width: rightW, height: containerHeight }} />
                            <div className="absolute left-0 bottom-0 bg-black/30 pointer-events-none" style={{ width: '100%', height: bottomH }} />

                            {/* MÁSCARA (área visível) */}
                            <div
                              className="absolute bg-neutral-900 rounded-lg"
                              style={{
                                left: containerLeft,
                                top: containerTop,
                                width: containerWidth,
                                height: containerHeight,
                                overflow: 'hidden',
                              }}
                            >
                              {mediaNode}

                              {/* drag 2D — bloqueado se não houver margem */}
                              <DragSurface
                                disabled={!canDragX && !canDragY}
                                cursor={dragCursor}
                                onDrag={(dx, dy) => {
                                  const nextLeft = canDragX ? clamp(imageModal.imgOffsetLeftPx + dx, minLeft, maxLeft) : clampedLeft;
                                  const nextTop  = canDragY ? clamp(imageModal.imgOffsetTopPx  + dy, minTop,  maxTop) : clampedTop;
                                  if (nextLeft !== imageModal.imgOffsetLeftPx || nextTop !== imageModal.imgOffsetTopPx) {
                                    setImageModal({ ...imageModal, imgOffsetLeftPx: nextLeft, imgOffsetTopPx: nextTop });
                                  }
                                }}
                              />

                              {/* resize inferior (sempre disponível) */}
                              <ResizeBar
                                position="bottom"
                                onResize={(dy) => {
                                  const newH = Math.max(60, containerHeight + dy);
                                  const { displayW: newDisplayW, displayH: newDisplayH } =
                                    computeCoverBleed(imageModal.naturalW, imageModal.naturalH, containerWidth, newH, 2);

                                  const newMinTop  = newH - newDisplayH;
                                  const newMinLeft = containerWidth - newDisplayW;

                                  const adjTop  = clamp(imageModal.imgOffsetTopPx,  newMinTop,  0);
                                  const adjLeft = clamp(imageModal.imgOffsetLeftPx, newMinLeft, 0);

                                  setImageModal({
                                    ...imageModal,
                                    containerHeightPx: newH,
                                    imgOffsetTopPx: adjTop,
                                    imgOffsetLeftPx: adjLeft
                                  });
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
                  onClick={() => { toggleLayer(index); handleSlideClick(index); }}
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
                      className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                        selectedElement.slideIndex === index && selectedElement.element === 'background' ? 'bg-neutral-800' : ''
                      }`}
                    >
                      <ImageIcon className="w-4 h-4 text-neutral-500" />
                      <span className="text-neutral-300 text-xs">Background Media</span>
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

      {/* ============ Área principal (canvas) ============ */}
      <div className="flex-1 flex flex-col">
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
              disabled={imageModal.open}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="bg-neutral-800 text-white px-3 py-1.5 rounded text-xs min-w-[70px] text-center">{Math.round(zoom * 100)}%</div>
            <button
              onClick={() => setZoom(p => Math.min(2, p + 0.1))}
              className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
              title="Zoom In"
              disabled={imageModal.open}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-neutral-800 mx-2" />
            <button
              onClick={handleDownloadAll}
              className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded transition-colors flex items-center space-x-2 text-sm"
              title="Download All Slides"
              disabled={imageModal.open}
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
              setPan({
                x: e.clientX - rect.left - mouseX * newZoom,
                y: e.clientY - rect.top  - mouseY * newZoom,
              });
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
          onMouseMove={(e) => {
            if (imageModal.open) return;
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
                        <label className="text-neutral-400 text-xs mb-2 block font-medium">Background Media</label>
                        <button
                          onClick={() => openImageEditModal(selectedElement.slideIndex)}
                          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
                          title="Abrir popup de edição da mídia"
                        >
                          Editar mídia
                        </button>
                      </div>

                      <div className="space-y-2">
                        {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo && (() => {
                          const url = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo;
                          const isVid = isVideoUrl(url);
                          const thumb = carouselData.conteudos[selectedElement.slideIndex]?.thumbnail_url;
                          const displayUrl = isVid && thumb ? thumb : url;
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', url);
                          return (
                            <div
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === url ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, url)}
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
                          const url = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo2!;
                          const isVid = isVideoUrl(url);
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                          return (
                            <div
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === url ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, url)}
                            >
                              <div className="text-neutral-400 text-xs mb-1">{isVid ? 'Video 2' : 'Image 2'}</div>
                              <img src={isVid ? (carouselData.conteudos[selectedElement.slideIndex]?.thumbnail_url || url) : url} alt="Background 2" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}

                        {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3 && (() => {
                          const url = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3!;
                          const isVid = isVideoUrl(url);
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                          return (
                            <div
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === url ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, url)}
                            >
                              <div className="text-neutral-400 text-xs mb-1">{isVid ? 'Video 3' : 'Image 3'}</div>
                              <img src={isVid ? (carouselData.conteudos[selectedElement.slideIndex]?.thumbnail_url || url) : url} alt="Background 3" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}

                        {uploadedImages[selectedElement.slideIndex] && (() => {
                          const url = uploadedImages[selectedElement.slideIndex];
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                          return (
                            <div
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === url ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, url)}
                            >
                              <div className="text-neutral-400 text-xs mb-1">Uploaded</div>
                              <img src={url} alt="Background Uploaded" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}
                      </div>

                      <div className="mt-3">
                        <label className="text-neutral-400 text-xs mb-2 block font-medium">Search Images/Videos</label>
                        <div className="relative">
                          <input
                            type="text"
                            className="w-full bg-neutral-900 border border-neutral-800 rounded pl-10 pr-20 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                            placeholder="Paste image or video URL, or search…"
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
                            {searchResults.map((url, index) => {
                              const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                              const isVid = isVideoUrl(url);
                              return (
                                <div
                                  key={index}
                                  className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === url ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                                  onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, url)}
                                >
                                  <div className="text-neutral-400 text-xs mb-1">{isVid ? `Video result ${index + 1}` : `Image result ${index + 1}`}</div>
                                  <img src={url} alt={`Result ${index + 1}`} className="w-full h-24 object-cover rounded" />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="mt-3">
                        <label className="text-neutral-400 text-xs mb-2 block font-medium">Upload Image/Video</label>
                        <label className="flex items-center justify-center w-full h-24 bg-neutral-900 border-2 border-dashed border-neutral-800 rounded cursor-pointer hover:border-blue-500 transition-colors">
                          <div className="flex flex-col items-center">
                            <Upload className="w-6 h-6 text-neutral-500 mb-1" />
                            <span className="text-neutral-500 text-xs">Click to upload</span>
                          </div>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const url = URL.createObjectURL(file);
                              setUploadedImages(prev => ({ ...prev, [selectedElement.slideIndex]: url }));
                              handleBackgroundImageChange(selectedElement.slideIndex, url);
                            }}
                          />
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