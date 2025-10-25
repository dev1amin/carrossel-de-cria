// src/components/CarouselViewer.tsx
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  X, ZoomIn, ZoomOut, Download, ChevronDown, ChevronRight, Layers,
  Image as ImageIcon, Type, Upload, Search, Play
} from 'lucide-react';
import type { CarouselData, ElementType, ElementStyles } from '../types';
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
      imageUrl: string; // para vídeo, é o src do <video>
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

      // VÍDEO (crop real)
      isVideo: boolean;
      videoTargetW: number;
      videoTargetH: number;
      videoTargetLeft: number;
      videoTargetTop: number;
      cropX: number;
      cropY: number;
      cropW: number;
      cropH: number;
    }
  | { open: false };

/** ====================== Portal para o Modal ======================= */
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

/** ====================== DragSurface (click+segurar) ======================= */
type DragSurfaceProps = {
  enabled: boolean;
  cursor?: React.CSSProperties['cursor'];
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDrag: (dx: number, dy: number) => void;
};
const DragSurface: React.FC<DragSurfaceProps> = ({ enabled, cursor, onDragStart, onDragEnd, onDrag }) => {
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      onDrag(e.movementX, e.movementY);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      onDragEnd?.();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onDrag, onDragEnd]);

  return (
    <div
      className="absolute inset-0"
      style={{
        zIndex: 10,
        background: 'transparent',
        cursor: enabled ? (cursor || 'move') : 'default',
        pointerEvents: enabled ? 'auto' : 'none'
      }}
      onMouseDown={(e) => {
        if (!enabled) return;
        e.preventDefault();
        dragging.current = true;
        onDragStart?.();
      }}
    />
  );
};

/** ====================== Helpers numéricos ======================= */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const computeFitWidthBleed = (natW: number, natH: number, contW: number, bleedPx = 0) => {
  if (natW <= 0 || natH <= 0 || contW <= 0) return { displayW: contW, displayH: contW };
  const scale = contW / natW;
  const displayW = Math.ceil(natW * scale) + bleedPx;
  const displayH = Math.ceil(natH * scale) + bleedPx;
  return { displayW, displayH };
};
const computeCover = (natW: number, natH: number, contW: number, contH: number) => {
  const scale = Math.max(contW / Math.max(1, natW), contH / Math.max(1, natH));
  return { displayW: Math.ceil(natW * scale), displayH: Math.ceil(natH * scale) };
};

/** ====================== Componente principal ======================= */
const CarouselViewer: React.FC<CarouselViewerProps> = ({ slides, carouselData, onClose }) => {
  /** ===== Layout do canvas ===== */
  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  /** ===== Estado global ===== */
  const [zoom, setZoom] = useState(0.35);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [focusedSlide, setFocusedSlide] = useState<number>(0);
  const [selectedElement, setSelectedElement] = useState<{ slideIndex: number; element: ElementType }>({ slideIndex: 0, element: 'background' });

  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set([0]));

  const [editedContent, setEditedContent] = useState<Record<string, any>>({});
  const [elementStyles, setElementStyles] = useState<Record<string, ElementStyles>>({});
  const [originalStyles, setOriginalStyles] = useState<Record<string, ElementStyles>>({});
  const [renderedSlides, setRenderedSlides] = useState<string[]>(slides);

  const [isLoadingProperties, setIsLoadingProperties] = useState(false);
  const [isEditingInline, setIsEditingInline] = useState<{ slideIndex: number; element: ElementType } | null>(null);

  // busca/imagem
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<Record<number, string>>({});

  // modal
  const [imageModal, setImageModal] = useState<ImageEditModalState>({ open: false });
  const [isImageDragging, setIsImageDragging] = useState(false);

  /** ===== Refs ===== */
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const lastSearchId = useRef(0);

  /** ====================== Efeitos ======================= */
  useEffect(() => {
    // Seleção inicial sempre no BG do slide 0
    setSelectedElement({ slideIndex: 0, element: 'background' });
    setExpandedLayers(s => new Set(s).add(0));
  }, []);

  // prepara srcDoc (injeção de ids e marcações editáveis)
  const ensureStyleTag = (html: string): string => {
    if (/<style>/i.test(html)) return html;
    return html.replace(
      /<head([^>]*)>/i,
      `<head$1><style>
      [data-editable]{cursor:pointer!important;position:relative;display:inline-block!important}
      [data-editable].selected{outline:3px solid #3B82F6!important;outline-offset:2px;z-index:1000}
      [data-editable]:hover:not(.selected){outline:2px solid rgba(59,130,246,.5)!important;outline-offset:2px}
      [data-editable][contenteditable="true"]{outline:3px solid #10B981!important;outline-offset:2px;background:rgba(16,185,129,.1)!important}
      img[data-editable]{display:block!important}
      video[data-editable]{display:block!important}
    </style>`
    );
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
        result = result.replace(
          re,
          (m, b, t, a) => `${b}<span id="${id}" data-editable="${attr}" contenteditable="false">${t}</span>${a}`
        );
      });
    };

    if (titleText) addEditableSpan(titleText, `slide-${slideIndex}-title`, 'title');
    if (subtitleText) addEditableSpan(subtitleText, `slide-${slideIndex}-subtitle`, 'subtitle');

    result = result.replace(
      /<body([^>]*)>/i,
      (m, attrs) => /id=/.test(attrs)
        ? m
        : `<body${attrs} id="slide-${slideIndex}-background" data-editable="background">`
    );

    return result;
  };

  useEffect(() => {
    const injected = slides.map((s, i) => injectEditableIds(s, i));
    setRenderedSlides(injected);
  }, [slides, carouselData.conteudos]);

  // posiciona no slide 0 ao abrir
  useEffect(() => {
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = 0 * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
    setFocusedSlide(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // configura interações dentro dos iframes
  useEffect(() => {
    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe || !iframe.contentWindow) return;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;

      // marcar imagens/vídeos
      const imgs = Array.from(doc.querySelectorAll('img')) as HTMLImageElement[];
      let imgIdx = 0;
      imgs.forEach((img) => {
        if (isImgurUrl(img.src) && !img.getAttribute('data-protected')) {
          img.setAttribute('data-protected', 'true');
        }
        if (img.getAttribute('data-protected') !== 'true') {
          img.setAttribute('data-editable', 'image');
          if (!img.id) img.id = `slide-${index}-img-${imgIdx++}`;
        }
        img.style.objectFit = 'cover';
      });

      const vids = Array.from(doc.querySelectorAll('video')) as HTMLVideoElement[];
      let vidIdx = 0;
      vids.forEach((v) => {
        v.setAttribute('data-editable', 'video');
        if (!v.id) v.id = `slide-${index}-vid-${vidIdx++}`;
        v.style.objectFit = 'cover';
        v.style.width = '100%';
        v.style.height = '100%';
      });

      // aplica conteúdo/estilos
      const applyText = (id: string, key: string) => {
        const el = doc.getElementById(id);
        if (!el) return;

        const styles = elementStyles[key] || originalStyles[key];
        if (styles) {
          if (styles.fontSize) el.style.setProperty('font-size', styles.fontSize, 'important');
          if (styles.fontWeight) el.style.setProperty('font-weight', styles.fontWeight, 'important');
          if (styles.textAlign) el.style.setProperty('text-align', styles.textAlign, 'important');
          if (styles.color) el.style.setProperty('color', styles.color, 'important');
        }

        const content =
          editedContent[key] !== undefined
            ? editedContent[key]
            : key.endsWith('-title')
            ? carouselData.conteudos[index]?.title || ''
            : key.endsWith('-subtitle')
            ? carouselData.conteudos[index]?.subtitle || ''
            : '';

        if (content && el.getAttribute('contenteditable') !== 'true') el.textContent = content;

        // captura originais
        setTimeout(() => {
          if (!originalStyles[key]) {
            const cs = doc.defaultView?.getComputedStyle(el as HTMLElement);
            const rgbToHex = (rgb: string) => {
              const m = rgb.match(/\d+/g);
              if (!m || m.length < 3) return rgb;
              const [r, g, b] = m.map(v => parseInt(v, 10));
              const hx = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
              return `#${hx(r)}${hx(g)}${hx(b)}`;
            };
            const color = cs?.color || '#FFFFFF';
            const styles0: ElementStyles = {
              fontSize: cs?.fontSize || '16px',
              fontWeight: cs?.fontWeight || '400',
              textAlign: (cs?.textAlign as any) || 'left',
              color: color.startsWith('rgb') ? rgbToHex(color) : color,
            };
            setOriginalStyles(p => ({ ...p, [key]: styles0 }));
          }
        }, 50);
      };

      applyText(`slide-${index}-title`, `${index}-title`);
      applyText(`slide-${index}-subtitle`, `${index}-subtitle`);
    });
  }, [elementStyles, editedContent, originalStyles, renderedSlides, carouselData.conteudos]);

  // listeners para seleção/edição inline
  useEffect(() => {
    const setup = (iframe: HTMLIFrameElement, slideIndex: number) => {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      const editable = doc.querySelectorAll('[data-editable]');
      editable.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const type = htmlEl.getAttribute('data-editable') as string;
        htmlEl.style.pointerEvents = 'auto';
        htmlEl.style.cursor = 'pointer';

        htmlEl.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          iframeRefs.current.forEach((f) => {
            const d = f?.contentDocument || f?.contentWindow?.document;
            if (!d) return;
            d.querySelectorAll('[data-editable]').forEach(x => x.classList.remove('selected'));
          });
          htmlEl.classList.add('selected');

          if (htmlEl.tagName === 'IMG' || type === 'image' || type === 'video' || type === 'background') {
            selectedImageRefs.current[slideIndex] = htmlEl.tagName === 'IMG' ? (htmlEl as HTMLImageElement) : null;
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
        iframe.onload = () => setTimeout(() => setup(iframe, idx), 60);
        if (iframe.contentDocument?.readyState === 'complete') setup(iframe, idx);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [renderedSlides]);

  // atalhos: ESC fecha; setas trocam slide
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (imageModal.open) {
          setImageModal({ open: false });
          document.documentElement.style.overflow = '';
          return;
        }
        if (selectedElement.element !== null) {
          setSelectedElement({ slideIndex: selectedElement.slideIndex, element: null });
          return;
        }
        onClose();
      }
      if (e.key === 'ArrowRight') {
        handleSlideClick(Math.min(focusedSlide + 1, slides.length - 1));
      }
      if (e.key === 'ArrowLeft') {
        handleSlideClick(Math.max(focusedSlide - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageModal.open, selectedElement, onClose, focusedSlide, slides.length]);

  /** ====================== Helpers ======================= */
  const getElementKey = (slideIndex: number, element: ElementType) => `${slideIndex}-${element}`;

  const getElementStyle = (slideIndex: number, element: ElementType): ElementStyles => {
    const k = getElementKey(slideIndex, element);
    if (elementStyles[k]) return elementStyles[k];
    if (originalStyles[k]) return originalStyles[k];
    return {
      fontSize: element === 'title' ? '24px' : '16px',
      fontWeight: element === 'title' ? '700' : '400',
      textAlign: 'left',
      color: '#FFFFFF',
    };
  };

  const getEditedValue = (slideIndex: number, field: string, def: any) => {
    const k = `${slideIndex}-${field}`;
    return editedContent[k] !== undefined ? editedContent[k] : def;
  };

  /** ====================== Setters ======================= */
  const updateEditedValue = (slideIndex: number, field: string, value: any) => {
    const k = `${slideIndex}-${field}`;
    setEditedContent((prev) => ({ ...prev, [k]: value }));
  };

  const updateElementStyle = (slideIndex: number, element: ElementType, prop: keyof ElementStyles, value: string) => {
    const k = getElementKey(slideIndex, element);
    setElementStyles((prev) => ({
      ...prev,
      [k]: { ...getElementStyle(slideIndex, element), [prop]: value },
    }));
  };

  /** ====================== Slides / Layers ======================= */
  const toggleLayer = (index: number) => {
    const s = new Set(expandedLayers);
    s.has(index) ? s.delete(index) : s.add(index);
    setExpandedLayers(s);
  };

  const handleSlideClick = (index: number) => {
    // limpa seleções visuais dentro dos iframes
    iframeRefs.current.forEach((iframe) => {
      const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
      if (!doc) return;
      doc.querySelectorAll('[data-editable].selected').forEach((el) => el.classList.remove('selected'));
    });

    setFocusedSlide(index);
    setSelectedElement({ slideIndex: index, element: 'background' });
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
      doc.querySelectorAll('[data-editable]').forEach((el) => el.classList.remove('selected'));
      const target = doc.getElementById(`slide-${slideIndex}-${element}`);
      if (target) target.classList.add('selected');
      else if (element === 'background') doc.body.classList.add('selected');
    }

    setSelectedElement({ slideIndex, element });
    setFocusedSlide(slideIndex);
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setTimeout(() => setIsLoadingProperties(false), 80);
  };

  /** ====================== Background / Upload / Busca ======================= */
  const findLargestVisual = (doc: Document): { type: TargetKind; el: HTMLElement } | null => {
    let best: { type: TargetKind; el: HTMLElement; area: number } | null = null;
    const push = (type: TargetKind, el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area <= 9000) return;
      if (!best || area > best.area) best = { type, el, area };
    };

    Array.from(doc.querySelectorAll('video')).forEach((v) => push('vid', v as HTMLElement));
    Array.from(doc.querySelectorAll('img')).forEach((im) => {
      const img = im as HTMLImageElement;
      if (img.getAttribute('data-protected') === 'true' || isImgurUrl(img.src)) return;
      push('img', img);
    });
    Array.from(doc.querySelectorAll<HTMLElement>('body,div,section,header,main,figure,article')).forEach(
      (el) => {
        const cs = doc.defaultView?.getComputedStyle(el);
        if (cs?.backgroundImage && cs.backgroundImage.includes('url(')) push('bg', el);
      }
    );

    return best ? { type: best.type, el: best.el } : null;
  };

  const applyBackgroundImageImmediate = (slideIndex: number, imageUrl: string): HTMLElement | null => {
    const iframe = iframeRefs.current[slideIndex];
    if (!iframe || !iframe.contentWindow) return null;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return null;

    const selected = doc.querySelector('[data-editable].selected') as HTMLElement | null;
    if (selected?.tagName === 'IMG' && selected.getAttribute('data-protected') !== 'true') {
      const img = selected as HTMLImageElement;
      if (!isVideoUrl(imageUrl)) {
        img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.loading = 'eager';
        img.src = imageUrl; img.setAttribute('data-bg-image-url', imageUrl);
        img.style.objectFit = 'cover';
        img.style.width = '100%';
        img.style.height = '100%';
        return img;
      }
    }

    const best = findLargestVisual(doc);
    if (best) {
      if (best.type === 'img') {
        const img = best.el as HTMLImageElement;
        img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.loading = 'eager';
        img.src = imageUrl; img.setAttribute('data-bg-image-url', imageUrl);
        img.style.objectFit = 'cover';
        img.style.width = '100%';
        img.style.height = '100%';
        return img;
      } else if (best.type === 'bg') {
        best.el.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
        best.el.style.setProperty('background-size', 'cover', 'important');
        best.el.style.setProperty('background-repeat', 'no-repeat', 'important');
        best.el.style.setProperty('background-position', 'center', 'important');
        return best.el;
      } else {
        return best.el;
      }
    }

    doc.body.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
    doc.body.style.setProperty('background-size', 'cover', 'important');
    doc.body.style.setProperty('background-repeat', 'no-repeat', 'important');
    doc.body.style.setProperty('background-position', 'center', 'important');
    return doc.body;
  };

  const handleBackgroundImageChange = (slideIndex: number, imageUrl: string) => {
    const updatedEl = applyBackgroundImageImmediate(slideIndex, imageUrl);

    // limpa seleções
    iframeRefs.current.forEach((f) => {
      const d = f?.contentDocument || f?.contentWindow?.document;
      if (!d) return;
      d.querySelectorAll('[data-editable]').forEach((el) => el.classList.remove('selected'));
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

  const handleImageUpload = (slideIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setUploadedImages((prev) => ({ ...prev, [slideIndex]: url }));
      handleBackgroundImageChange(slideIndex, url);
    };
    reader.readAsDataURL(file);
  };

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

  /** ====================== Download ======================= */
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

  /** ====================== Modal: abrir/aplicar ======================= */
  const openImageEditModal = (slideIndex: number) => {
    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!doc) return;

    const selected = doc.querySelector('[data-editable].selected') as HTMLElement | null;
    const largest = findLargestVisual(doc);
    const chosen = selected || largest?.el || doc.body;
    if (!chosen) return;

    if (!chosen.id) chosen.id = `edit-${Date.now()}`;
    const targetSelector = `#${chosen.id}`;

    const cs = doc.defaultView?.getComputedStyle(chosen);
    let imageUrl = '';
    let targetType: TargetKind = 'img';
    let isVideo = false;

    if (chosen.tagName === 'VIDEO') {
      const video = chosen as HTMLVideoElement;
      imageUrl = video.currentSrc || video.src || '';
      targetType = 'vid';
      isVideo = true;
    } else if (chosen.tagName === 'IMG') {
      imageUrl = (chosen as HTMLImageElement).src;
      targetType = 'img';
    } else {
      const bg = cs?.backgroundImage && cs.backgroundImage.includes('url(')
        ? cs.backgroundImage.match(/url\(["']?(.+?)["']?\)/i)?.[1] || ''
        : '';
      imageUrl = bg
        || editedContent[`${slideIndex}-background`]
        || uploadedImages[slideIndex]
        || carouselData.conteudos[slideIndex]?.thumbnail_url
        || carouselData.conteudos[slideIndex]?.imagem_fundo
        || carouselData.conteudos[slideIndex]?.imagem_fundo2
        || carouselData.conteudos[slideIndex]?.imagem_fundo3
        || '';
      targetType = 'bg';
    }
    if (!imageUrl) return;

    // métricas alvo
    const r = chosen.getBoundingClientRect();
    const bodyRect = doc.body.getBoundingClientRect();
    const targetLeftPx = r.left - bodyRect.left;
    const targetTopPx = r.top - bodyRect.top;
    const targetWidthPx = Math.max(1, r.width || slideWidth);
    const targetHeightPx = Math.max(1, r.height || slideHeight);

    // imagem
    if (!isVideo) {
      const tmp = new Image();
      tmp.src = imageUrl;
      const natDone = () => {
        const natW = tmp.naturalWidth || targetWidthPx;
        const natH = tmp.naturalHeight || targetHeightPx;

        // offset inicial: center cover
        const { displayW, displayH } = computeCover(natW, natH, targetWidthPx, targetHeightPx);
        const minLeft = targetWidthPx - displayW;
        const minTop = targetHeightPx - displayH;
        const startLeft = clamp((targetWidthPx - displayW) / 2, minLeft, 0);
        const startTop = clamp((targetHeightPx - displayH) / 2, minTop, 0);

        setImageModal({
          open: true,
          slideIndex,
          targetType,
          targetSelector,
          imageUrl,
          slideW: slideWidth,
          slideH: slideHeight,
          containerHeightPx: targetHeightPx,
          naturalW: natW,
          naturalH: natH,
          imgOffsetTopPx: startTop,
          imgOffsetLeftPx: startLeft,
          targetWidthPx,
          targetLeftPx,
          targetTopPx,
          isVideo: false,
          videoTargetW: 0,
          videoTargetH: 0,
          videoTargetLeft: 0,
          videoTargetTop: 0,
          cropX: 0,
          cropY: 0,
          cropW: 0,
          cropH: 0,
        });
        document.documentElement.style.overflow = 'hidden';
      };
      if (tmp.complete && tmp.naturalWidth && tmp.naturalHeight) natDone();
      else tmp.onload = natDone;
      return;
    }

    // vídeo
    const video = chosen as HTMLVideoElement;
    setImageModal({
      open: true,
      slideIndex,
      targetType: 'vid',
      targetSelector,
      imageUrl,
      slideW: slideWidth,
      slideH: slideHeight,
      containerHeightPx: targetHeightPx,
      naturalW: video.videoWidth || targetWidthPx,
      naturalH: video.videoHeight || targetHeightPx,
      imgOffsetTopPx: 0,
      imgOffsetLeftPx: 0,
      targetWidthPx,
      targetLeftPx,
      targetTopPx,
      isVideo: true,
      videoTargetW: targetWidthPx,
      videoTargetH: targetHeightPx,
      videoTargetLeft: targetLeftPx,
      videoTargetTop: targetTopPx,
      cropX: 0,
      cropY: 0,
      cropW: targetWidthPx,
      cropH: targetHeightPx,
    });
    document.documentElement.style.overflow = 'hidden';
  };

  const applyImageEditModal = () => {
    if (!imageModal.open) return;
    const iframe = iframeRefs.current[imageModal.slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!doc) {
      setImageModal({ open: false });
      document.documentElement.style.overflow = '';
      return;
    }
    const el = doc.querySelector(imageModal.targetSelector) as HTMLElement | null;
    if (!el) {
      setImageModal({ open: false });
      document.documentElement.style.overflow = '';
      return;
    }

    const {
      targetType, imageUrl, containerHeightPx, imgOffsetTopPx, imgOffsetLeftPx,
      naturalW, naturalH, targetWidthPx, isVideo, videoTargetW, videoTargetH,
      cropX, cropY, cropW, cropH
    } = imageModal;

    if (isVideo && targetType === 'vid') {
      // aplica crop real com wrapper
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

      setImageModal({ open: false });
      document.documentElement.style.overflow = '';
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

      const { displayW, displayH } = computeCover(naturalW, naturalH, targetWidthPx, containerHeightPx);
      const minLeft = targetWidthPx - displayW;
      const minTop = containerHeightPx - displayH;

      const safeLeft = clamp(imgOffsetLeftPx, minLeft, 0);
      const safeTop = clamp(imgOffsetTopPx, minTop, 0);

      const im = el as HTMLImageElement;
      im.style.position = 'absolute';
      im.style.left = `${safeLeft}px`;
      im.style.top = `${safeTop}px`;
      im.style.width = `${displayW}px`;
      im.style.height = `${displayH}px`;
      im.removeAttribute('srcset');
      im.removeAttribute('sizes');
      im.loading = 'eager';
      if (im.src !== imageUrl) im.src = imageUrl;
      im.style.objectFit = 'cover';
      im.style.backfaceVisibility = 'hidden';
      im.style.transform = 'translateZ(0)';

    } else if (targetType === 'bg') {
      const { displayW, displayH } = computeCover(naturalW, naturalH, targetWidthPx, containerHeightPx);
      const maxOffsetX = Math.max(0, displayW - targetWidthPx);
      const maxOffsetY = Math.max(0, displayH - containerHeightPx);

      let xPerc = maxOffsetX ? (-imgOffsetLeftPx / maxOffsetX) * 100 : 50;
      let yPerc = maxOffsetY ? (-imgOffsetTopPx / maxOffsetY) * 100 : 50;
      if (!isFinite(xPerc)) xPerc = 50;
      if (!isFinite(yPerc)) yPerc = 50;

      el.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
      el.style.setProperty('background-repeat', 'no-repeat', 'important');
      el.style.setProperty('background-size', 'cover', 'important');
      el.style.setProperty('background-position-x', `${xPerc}%`, 'important');
      el.style.setProperty('background-position-y', `${yPerc}%`, 'important');
      el.style.setProperty('height', `${containerHeightPx}px`, 'important');
      if ((doc.defaultView?.getComputedStyle(el).position || 'static') === 'static') {
        el.style.position = 'relative';
      }
    }

    setImageModal({ open: false });
    document.documentElement.style.overflow = '';
  };

  /** ====================== TopBar ======================= */
  const topBar = (
    <div className="h-14 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-6">
      <div className="flex items-center space-x-4">
        <h2 className="text-white font-semibold">Carousel Editor</h2>
        <div className="text-neutral-500 text-sm">{slides.length} slides</div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setZoom((p) => Math.max(0.1, p - 0.1))}
          className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
          title="Zoom Out"
          disabled={imageModal.open}
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="bg-neutral-800 text-white px-3 py-1.5 rounded text-xs min-w-[70px] text-center">
          {Math.round(zoom * 100)}%
        </div>
        <button
          onClick={() => setZoom((p) => Math.min(2, p + 0.1))}
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
  );

  /** ====================== Render ======================= */
  return (
    <div className="fixed top-14 left-16 right-0 bottom-0 z-[90] bg-neutral-900 flex">
      {/* Modal */}
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
                  <div className="text-white font-medium text-sm">
                    {imageModal.isVideo ? 'Crop do vídeo' : 'Edição da imagem'} — Slide {imageModal.slideIndex + 1}
                  </div>
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

                {/* conteúdo */}
                <div className="w-full h-[calc(100%-3rem)] p-4 overflow-auto">
                  {/* Instruções */}
                  {imageModal.isVideo ? (
                    <div className="text-neutral-400 text-xs mb-3 space-y-1">
                      <div>• Arraste o <span className="text-neutral-200">retângulo</span> para mover o crop.</div>
                      <div>• Use os <span className="text-neutral-200">handles</span> nas bordas/cantos para redimensionar.</div>
                      <div>• Apenas a área dentro do retângulo será exibida no slide.</div>
                    </div>
                  ) : (
                    <div className="text-neutral-400 text-xs mb-3 space-y-1">
                      <div>• Arraste a imagem (quando houver margem) para ajustar o enquadramento.</div>
                      <div>• Arraste a borda inferior do container para alterar sua altura.</div>
                      <div>• Áreas fora do container ficam visíveis a 40% durante o arrasto.</div>
                    </div>
                  )}

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
                        sandbox="allow-same-origin allow-scripts"
                        title={`Slide Preview ${imageModal.slideIndex + 1}`}
                      />

                      {/* Overlay específico */}
                      {!imageModal.isVideo ? (
                        // ======= IMAGEM (fit-width + sempre cobrindo o container) =======
                        (() => {
                          const containerLeft = imageModal.targetLeftPx;
                          const containerTop = imageModal.targetTopPx;
                          const containerWidth = imageModal.targetWidthPx;
                          const containerHeight = imageModal.containerHeightPx;

                          // Fit-width: mostra a imagem com altura total proporcional à largura do container
                          const { displayW, displayH } = computeFitWidthBleed(
                            imageModal.naturalW, imageModal.naturalH, containerWidth, 0
                          );

                          // Limites para **sempre cobrir** o container (sem “buracos”)
                          const minLeft  = containerWidth - displayW;  // <= 0
                          const maxLeft  = 0;
                          const minTop   = containerHeight - displayH; // <= 0
                          const maxTop   = 0;

                          // Clamp na renderização (impede fugir e deixar fundo exposto)
                          const clampedLeft = clamp(imageModal.imgOffsetLeftPx, minLeft, maxLeft);
                          const clampedTop  = clamp(imageModal.imgOffsetTopPx,  minTop,  maxTop);

                          const canDragX = displayW > containerWidth;
                          const canDragY = displayH > containerHeight;
                          const dragCursor: React.CSSProperties['cursor'] =
                            canDragX && canDragY ? 'move' : canDragX ? 'ew-resize' : canDragY ? 'ns-resize' : 'default';

                          const rightW = imageModal.slideW - (containerLeft + containerWidth);
                          const bottomH = imageModal.slideH - (containerTop + containerHeight);

                          return (
                            <>
                              {/* Destaque do container */}
                              <div
                                className="absolute rounded-lg pointer-events-none"
                                style={{
                                  left: containerLeft - 2,
                                  top:  containerTop  - 2,
                                  width:  containerWidth + 4,
                                  height: containerHeight + 4,
                                  boxShadow: '0 0 0 2px rgba(59,130,246,0.9)',
                                  zIndex: 3
                                }}
                              />

                              {/* Esmaecer fora do container (para contextualizar o recorte) */}
                              <div className="absolute top-0 left-0 bg-black/30 pointer-events-none" style={{ width: '100%', height: containerTop, zIndex: 2 }} />
                              <div className="absolute left-0 bg-black/30 pointer-events-none" style={{ top: containerTop, width: containerLeft, height: containerHeight, zIndex: 2 }} />
                              <div className="absolute bg-black/30 pointer-events-none" style={{ top: containerTop, right: 0, width: rightW, height: containerHeight, zIndex: 2 }} />
                              <div className="absolute left-0 bottom-0 bg-black/30 pointer-events-none" style={{ width: '100%', height: bottomH, zIndex: 2 }} />

                              {/* GHOST sem clip (altura total), visível só durante o arrasto */}
                              <img
                                src={imageModal.imageUrl}
                                alt="ghost"
                                draggable={false}
                                className="absolute pointer-events-none"
                                style={{
                                  left: `${containerLeft + clampedLeft}px`,
                                  top:  `${containerTop  + clampedTop }px`,
                                  width:  `${displayW}px`,
                                  height: `${displayH}px`,
                                  opacity: isImageDragging ? 0.4 : 0,
                                  transition: 'opacity 120ms ease',
                                  objectFit: 'cover',
                                  backfaceVisibility: 'hidden',
                                  transform: 'translateZ(0)',
                                  zIndex: 3
                                }}
                              />

                              {/* Container com clip (sem “buracos”) */}
                              <div
                                className="absolute bg-neutral-900 rounded-lg"
                                style={{
                                  left: containerLeft,
                                  top:  containerTop,
                                  width:  containerWidth,
                                  height: containerHeight,
                                  overflow: 'hidden',
                                  zIndex: 4,
                                }}
                              >
                                <img
                                  src={imageModal.imageUrl}
                                  alt="to-edit"
                                  draggable={false}
                                  style={{
                                    position: 'absolute',
                                    left: `${clampedLeft}px`,
                                    top:  `${clampedTop }px`,
                                    width:  `${displayW}px`,
                                    height: `${displayH}px`,
                                    userSelect: 'none',
                                    pointerEvents: 'none',
                                    objectFit: 'cover',
                                    backfaceVisibility: 'hidden',
                                    transform: 'translateZ(0)',
                                  }}
                                />

                                <DragSurface
                                  enabled={canDragX || canDragY}
                                  cursor={dragCursor}
                                  onDragStart={() => setIsImageDragging(true)}
                                  onDragEnd={() => setIsImageDragging(false)}
                                  onDrag={(dx, dy) => {
                                    // mantém cobertura do container
                                    const nextLeft = canDragX ? clamp(imageModal.imgOffsetLeftPx + dx, minLeft, maxLeft) : clampedLeft;
                                    const nextTop  = canDragY ? clamp(imageModal.imgOffsetTopPx  + dy, minTop,  maxTop) : clampedTop;

                                    if (nextLeft !== imageModal.imgOffsetLeftPx || nextTop !== imageModal.imgOffsetTopPx) {
                                      setImageModal({ ...imageModal, imgOffsetLeftPx: nextLeft, imgOffsetTopPx: nextTop });
                                    }
                                  }}
                                />

                                {/* Redimensiona só a altura do container; recalcula limites de cobertura */}
                                <div
                                  onMouseDown={(e) => e.preventDefault()}
                                  className="absolute left-0 right-0 h-3 -bottom-1 cursor-s-resize"
                                  style={{ zIndex: 6, background: 'transparent' }}
                                  onMouseUp={(e) => e.preventDefault()}
                                  onMouseMove={(e) => e.preventDefault()}
                                  onMouseDownCapture={(e) => {
                                    e.preventDefault();
                                    const startY = e.clientY;
                                    const startH = containerHeight;
                                    const onMove = (ev: MouseEvent) => {
                                      const dy = ev.clientY - startY;
                                      const newH = Math.max(60, startH + dy);

                                      // displayW/H (fit-width) não mudam com a altura do container
                                      const newMinLeft = containerWidth - displayW; // igual a minLeft
                                      const newMinTop  = newH - displayH;          // novo limite vertical

                                      const adjLeft = clamp(imageModal.imgOffsetLeftPx, newMinLeft, 0);
                                      const adjTop  = clamp(imageModal.imgOffsetTopPx,  newMinTop,  0);

                                      setImageModal({
                                        ...imageModal,
                                        containerHeightPx: newH,
                                        imgOffsetLeftPx: adjLeft,
                                        imgOffsetTopPx:  adjTop,
                                      });
                                    };
                                    const onUp = () => {
                                      window.removeEventListener('mousemove', onMove);
                                      window.removeEventListener('mouseup', onUp);
                                    };
                                    window.addEventListener('mousemove', onMove);
                                    window.addEventListener('mouseup', onUp);
                                  }}
                                >
                                  <div className="mx-auto w-12 h-1 rounded-full bg-blue-500/80" />
                                </div>
                              </div>
                            </>
                          );
                        })()
                      ) : (
                        // ======= VÍDEO (CROP RETANGULAR) =======
                        (() => {
                          const vLeft = imageModal.videoTargetLeft;
                          const vTop  = imageModal.videoTargetTop;
                          const vW    = imageModal.videoTargetW;
                          const vH    = imageModal.videoTargetH;

                          const rightW = imageModal.slideW - (vLeft + vW);
                          const bottomH = imageModal.slideH - (vTop + vH);

                          return (
                            <>
                              {/* destaque do vídeo */}
                              <div
                                className="absolute rounded-lg pointer-events-none"
                                style={{
                                  left: vLeft - 2,
                                  top:  vTop - 2,
                                  width: vW + 4,
                                  height: vH + 4,
                                  boxShadow: '0 0 0 2px rgba(59,130,246,0.9)',
                                  zIndex: 3
                                }}
                              />

                              {/* esmaecer fora do vídeo */}
                              <div className="absolute top-0 left-0 bg-black/30 pointer-events-none" style={{ width: '100%', height: vTop, zIndex: 2 }} />
                              <div className="absolute left-0 bg-black/30 pointer-events-none" style={{ top: vTop, width: vLeft, height: vH, zIndex: 2 }} />
                              <div className="absolute bg-black/30 pointer-events-none" style={{ top: vTop, right: 0, width: rightW, height: vH, zIndex: 2 }} />
                              <div className="absolute left-0 bottom-0 bg-black/30 pointer-events-none" style={{ width: '100%', height: bottomH, zIndex: 2 }} />

                              {/* Retângulo de crop */}
                              <div
                                className="absolute"
                                style={{
                                  left: vLeft + imageModal.cropX,
                                  top:  vTop  + imageModal.cropY,
                                  width: imageModal.cropW,
                                  height: imageModal.cropH,
                                  boxShadow: '0 0 0 2px rgba(59,130,246,1), inset 0 0 0 1px rgba(255,255,255,0.6)',
                                  background: 'transparent',
                                  cursor: 'move',
                                  zIndex: 4
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const start = { x: e.clientX, y: e.clientY };
                                  const startRect = { x: imageModal.cropX, y: imageModal.cropY, w: imageModal.cropW, h: imageModal.cropH };
                                  const onMove = (ev: MouseEvent) => {
                                    const dx = ev.clientX - start.x;
                                    const dy = ev.clientY - start.y;
                                    const vW = imageModal.videoTargetW;
                                    const vH = imageModal.videoTargetH;
                                    const nx = clamp(startRect.x + dx, 0, vW - startRect.w);
                                    const ny = clamp(startRect.y + dy, 0, vH - startRect.h);
                                    setImageModal(prev => ({ ...prev, cropX: nx, cropY: ny }));
                                  };
                                  const onUp = () => {
                                    window.removeEventListener('mousemove', onMove);
                                    window.removeEventListener('mouseup', onUp);
                                  };
                                  window.addEventListener('mousemove', onMove);
                                  window.addEventListener('mouseup', onUp);
                                }}
                              >
                                {/* Handles */}
                                {(['n','s','e','w','ne','nw','se','sw'] as const).map((pos) => {
                                  const base: React.CSSProperties = {
                                    position: 'absolute', background: 'white', borderRadius: 999,
                                    boxShadow: '0 0 0 1px rgba(0,0,0,0.4)', width: 12, height: 12
                                  };
                                  const map: Record<string, React.CSSProperties> = {
                                    n:  { top: -6, left: '50%', marginLeft: -6, cursor: 'ns-resize' },
                                    s:  { bottom: -6, left: '50%', marginLeft: -6, cursor: 'ns-resize' },
                                    e:  { right: -6, top: '50%', marginTop: -6, cursor: 'ew-resize' },
                                    w:  { left: -6, top: '50%', marginTop: -6, cursor: 'ew-resize' },
                                    ne: { top: -6, right: -6, cursor: 'nesw-resize' },
                                    nw: { top: -6, left: -6, cursor: 'nwse-resize' },
                                    se: { bottom: -6, right: -6, cursor: 'nwse-resize' },
                                    sw: { bottom: -6, left: -6, cursor: 'nesw-resize' },
                                  };
                                  return (
                                    <div
                                      key={pos}
                                      style={{ ...base, ...map[pos] }}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        const start = { x: e.clientX, y: e.clientY };
                                        const s = { x: imageModal.cropX, y: imageModal.cropY, w: imageModal.cropW, h: imageModal.cropH };
                                        const vW = imageModal.videoTargetW;
                                        const vH = imageModal.videoTargetH;
                                        const onMove = (ev: MouseEvent) => {
                                          const dx = ev.clientX - start.x;
                                          const dy = ev.clientY - start.y;
                                          let { x, y, w, h } = s;

                                          if (pos.includes('w')) { const nx = x + dx; const dw = x - nx; x = nx; w = w + dw; }
                                          if (pos.includes('e')) { w = w + dx; }
                                          if (pos.includes('n')) { const ny = y + dy; const dh = y - ny; y = ny; h = h + dh; }
                                          if (pos.includes('s')) { h = h + dy; }

                                          w = Math.max(40, Math.min(w, vW));
                                          h = Math.max(40, Math.min(h, vH));
                                          x = clamp(x, 0, vW - w);
                                          y = clamp(y, 0, vH - h);

                                          setImageModal(prev => ({ ...prev, cropX: x, cropY: y, cropW: w, cropH: h }));
                                        };
                                        const onUp = () => {
                                          window.removeEventListener('mousemove', onMove);
                                          window.removeEventListener('mouseup', onUp);
                                        };
                                        window.addEventListener('mousemove', onMove);
                                        window.addEventListener('mouseup', onUp);
                                      }}
                                    />
                                  );
                                })}
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

      {/* Painel esquerdo */}
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
              <div
                key={index}
                className={`border-b border-neutral-800 ${isFocused ? 'bg-neutral-900' : ''}`}
              >
                <button
                  onClick={() => {
                    toggleLayer(index);
                    handleSlideClick(index);
                  }}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-900 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-neutral-500" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-neutral-500" />
                    )}
                    <Layers className="w-3 h-3 text-blue-400" />
                    <span className="text-white text-sm">Slide {index + 1}</span>
                  </div>
                </button>

                {isExpanded && conteudo && (
                  <div className="ml-3 border-l border-neutral-800">
                    <button
                      onClick={() => handleElementClick(index, 'background')}
                      className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                        selectedElement.slideIndex === index &&
                        selectedElement.element === 'background'
                          ? 'bg-neutral-800'
                          : ''
                      }`}
                    >
                      <ImageIcon className="w-4 h-4 text-neutral-500" />
                      <span className="text-neutral-300 text-xs">Background</span>
                    </button>

                    <button
                      onClick={() => handleElementClick(index, 'title')}
                      className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                        selectedElement.slideIndex === index &&
                        selectedElement.element === 'title'
                          ? 'bg-neutral-800'
                          : ''
                      }`}
                    >
                      <Type className="w-4 h-4 text-neutral-500" />
                      <span className="text-neutral-300 text-xs">Title</span>
                    </button>

                    {conteudo.subtitle && (
                      <button
                        onClick={() => handleElementClick(index, 'subtitle')}
                        className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                          selectedElement.slideIndex === index &&
                          selectedElement.element === 'subtitle'
                            ? 'bg-neutral-800'
                            : ''
                        }`}
                      >
                        <Type className="w-4 h-4 text-neutral-500" />
                        <span className="text-neutral-300 text-xs">
                          Subtitle
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Área central */}
      <div className="flex-1 flex flex-col">
        {topBar}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative bg-neutral-800"
          style={{ cursor: imageModal.open ? 'default' : isDragging ? 'grabbing' : 'grab' }}
          onWheel={(e) => {
            if (imageModal.open) return; // não pan/zoom durante modal
            e.preventDefault();
            // pan com wheel
            setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
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
          onMouseUp={() => !imageModal.open && setIsDragging(false)}
          onMouseLeave={() => !imageModal.open && setIsDragging(false)}
        >
          <div
            className="absolute"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.25s ease-out',
              left: '50%',
              top: '50%',
              marginLeft: `-${(slideWidth * slides.length + gap * (slides.length - 1)) / 2}px`,
              marginTop: `-${slideHeight / 2}px`,
              zIndex: 1,
              pointerEvents: imageModal.open ? 'none' : 'auto',
            }}
          >
            <div className="flex items-start" style={{ gap: `${gap}px` }}>
              {renderedSlides.map((slide, i) => (
                <div
                  key={i}
                  className={`relative bg-white rounded-lg shadow-2xl overflow-hidden flex-shrink-0 transition-all ${
                    focusedSlide === i ? 'ring-4 ring-blue-500' : ''
                  }`}
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

          {/* HUD de zoom */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-neutral-950/90 backdrop-blur-sm text-neutral-400 px-3 py-1.5 rounded text-xs z-[2]">
            Zoom: {Math.round(zoom * 100)}%
          </div>
        </div>
      </div>

      {/* Painel direito */}
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
              <p className="text-neutral-500 text-sm mb-1">
                Click on an element in the preview
              </p>
              <p className="text-neutral-500 text-sm">to edit its properties</p>
              <div className="mt-6 space-y-2 text-xs text-neutral-600">
                <p>• Single click to select</p>
                <p>• Double click text to edit inline</p>
                <p>• Press ESC to deselect</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {isLoadingProperties ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              ) : selectedElement.element === 'background' ? (
                <>
                  <div className="flex items-center justify-between">
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">
                      Background
                    </label>
                    <button
                      onClick={() => openImageEditModal(selectedElement.slideIndex)}
                      className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
                      title="Editar enquadramento"
                    >
                      Editar
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(() => {
                      const c = carouselData.conteudos[selectedElement.slideIndex] || {};
                      const makeThumb = (label: string, url: string, isVid?: boolean, thumb?: string) => {
                        const displayUrl = isVid && thumb ? thumb : url;
                        const currentBg = getEditedValue(selectedElement.slideIndex, 'background', c.imagem_fundo || '');
                        return (
                          <div
                            className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === url ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                            onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, url)}
                          >
                            <div className="text-neutral-400 text-xs mb-1 flex items-center justify-between">
                              <span>{label}</span>
                              {isVid && <Play className="w-3 h-3" />}
                            </div>
                            <div className="relative">
                              <img src={displayUrl} alt={label} className="w-full h-24 object-cover rounded" />
                              {isVid && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded">
                                  <Play className="w-8 h-8 text-white" fill="white" />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      };
                      return (
                        <>
                          {c.imagem_fundo && makeThumb(isVideoUrl(c.imagem_fundo) ? 'Video 1' : 'Image 1', c.imagem_fundo, isVideoUrl(c.imagem_fundo), c.thumbnail_url)}
                          {c.imagem_fundo2 && makeThumb(isVideoUrl(c.imagem_fundo2) ? 'Video 2' : 'Image 2', c.imagem_fundo2, isVideoUrl(c.imagem_fundo2))}
                          {c.imagem_fundo3 && makeThumb(isVideoUrl(c.imagem_fundo3) ? 'Video 3' : 'Image 3', c.imagem_fundo3, isVideoUrl(c.imagem_fundo3))}
                          {uploadedImages[selectedElement.slideIndex] && makeThumb('Image 4 (Uploaded)', uploadedImages[selectedElement.slideIndex])}
                        </>
                      );
                    })()}
                  </div>

                  {/* Search */}
                  <div className="mt-3">
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">
                      Search Images
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded pl-10 pr-20 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        placeholder="Search for images..."
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSearchImages();
                        }}
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
                        {searchResults.map((imageUrl, i) => (
                          <div
                            key={i}
                            className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${
                              getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo || '') === imageUrl
                                ? 'border-blue-500'
                                : 'border-neutral-800 hover:border-blue-400'
                            }`}
                            onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, imageUrl)}
                          >
                            <div className="text-neutral-400 text-xs mb-1">
                              Search Result {i + 1}
                            </div>
                            <img
                              src={imageUrl}
                              alt={`Search result ${i + 1}`}
                              className="w-full h-24 object-cover rounded"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Upload */}
                  <div className="mt-3">
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">
                      Upload Image (Image 4)
                    </label>
                    <label className="flex items-center justify-center w-full h-24 bg-neutral-900 border-2 border-dashed border-neutral-800 rounded cursor-pointer hover:border-blue-500 transition-colors">
                      <div className="flex flex-col items-center">
                        <Upload className="w-6 h-6 text-neutral-500 mb-1" />
                        <span className="text-neutral-500 text-xs">Click to upload</span>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(selectedElement.slideIndex, e)}
                      />
                    </label>
                  </div>
                </>
              ) : selectedElement.element === 'title' ? (
                <>
                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">
                      Text Content
                    </label>
                    <textarea
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-blue-500 transition-colors"
                      rows={4}
                      value={
                        editedContent[`${selectedElement.slideIndex}-title`] ??
                        (carouselData.conteudos[selectedElement.slideIndex]?.title || '')
                      }
                      onChange={(e) => updateEditedValue(selectedElement.slideIndex, 'title', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Font Size</label>
                    <input
                      type="text"
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={getElementStyle(selectedElement.slideIndex, 'title').fontSize}
                      onChange={(e) => updateElementStyle(selectedElement.slideIndex, 'title', 'fontSize', e.target.value)}
                      placeholder="e.g. 24px, 1.5rem"
                    />
                  </div>
                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Font Weight</label>
                    <select
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={getElementStyle(selectedElement.slideIndex, 'title').fontWeight}
                      onChange={(e) => updateElementStyle(selectedElement.slideIndex, 'title', 'fontWeight', e.target.value)}
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
                      value={getElementStyle(selectedElement.slideIndex, 'title').textAlign}
                      onChange={(e) => updateElementStyle(selectedElement.slideIndex, 'title', 'textAlign', e.target.value)}
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
                        value={getElementStyle(selectedElement.slideIndex, 'title').color}
                        onChange={(e) => updateElementStyle(selectedElement.slideIndex, 'title', 'color', e.target.value)}
                      />
                      <input
                        type="text"
                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        value={getElementStyle(selectedElement.slideIndex, 'title').color}
                        onChange={(e) => updateElementStyle(selectedElement.slideIndex, 'title', 'color', e.target.value)}
                        placeholder="#FFFFFF"
                      />
                    </div>
                  </div>
                </>
              ) : selectedElement.element === 'subtitle' ? (
                <>
                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">
                      Text Content
                    </label>
                    <textarea
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-blue-500 transition-colors"
                      rows={3}
                      value={
                        editedContent[`${selectedElement.slideIndex}-subtitle`] ??
                        (carouselData.conteudos[selectedElement.slideIndex]?.subtitle || '')
                      }
                      onChange={(e) => updateEditedValue(selectedElement.slideIndex, 'subtitle', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Font Size</label>
                    <input
                      type="text"
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={getElementStyle(selectedElement.slideIndex, 'subtitle').fontSize}
                      onChange={(e) => updateElementStyle(selectedElement.slideIndex, 'subtitle', 'fontSize', e.target.value)}
                      placeholder="e.g. 18px, 1.125rem"
                    />
                  </div>
                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Font Weight</label>
                    <select
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={getElementStyle(selectedElement.slideIndex, 'subtitle').fontWeight}
                      onChange={(e) => updateElementStyle(selectedElement.slideIndex, 'subtitle', 'fontWeight', e.target.value)}
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
                      value={getElementStyle(selectedElement.slideIndex, 'subtitle').textAlign}
                      onChange={(e) => updateElementStyle(selectedElement.slideIndex, 'subtitle', 'textAlign', e.target.value)}
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
                        value={getElementStyle(selectedElement.slideIndex, 'subtitle').color}
                        onChange={(e) => updateElementStyle(selectedElement.slideIndex, 'subtitle', 'color', e.target.value)}
                      />
                      <input
                        type="text"
                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        value={getElementStyle(selectedElement.slideIndex, 'subtitle').color}
                        onChange={(e) => updateElementStyle(selectedElement.slideIndex, 'subtitle', 'color', e.target.value)}
                        placeholder="#FFFFFF"
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CarouselViewer;