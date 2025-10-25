import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  X, ZoomIn, ZoomOut, Download, ChevronDown, ChevronRight, Layers as LayersIcon,
  Image as ImageIcon, Type, Upload, Search, Play
} from 'lucide-react';
import type { CarouselData, ElementType, ElementStyles } from '../types';
import { searchImages } from '../services';

/** ====================== Utils ======================= */
const isVideoUrl = (url: string): boolean => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
const isImgurUrl = (url: string): boolean => url.includes('i.imgur.com');
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

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
    }
  | { open: false };

/** ====================== Portal p/ Modal ======================= */
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

/** ====================== Componente principal ======================= */
const CarouselViewer: React.FC<CarouselViewerProps> = ({ slides, carouselData, onClose }) => {
  /** Canvas geral */
  const [zoom, setZoom] = useState(0.35);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [focusedSlide, setFocusedSlide] = useState<number>(0);

  /** Seleção / edição */
  const [selectedElement, setSelectedElement] = useState<{ slideIndex: number; element: ElementType }>({ slideIndex: 0, element: null });
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set([0]));
  const [editedContent, setEditedContent] = useState<Record<string, any>>({});
  const [elementStyles, setElementStyles] = useState<Record<string, ElementStyles>>({});
  const [originalStyles, setOriginalStyles] = useState<Record<string, ElementStyles>>({});
  const [renderedSlides, setRenderedSlides] = useState<string[]>(slides);
  const [isEditingInline, setIsEditingInline] = useState<{ slideIndex: number; element: ElementType } | null>(null);
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);

  /** Busca / upload */
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<Record<number, string>>({});

  /** Modal */
  const [imageModal, setImageModal] = useState<ImageEditModalState>({ open: false });
  const [modalZoom, setModalZoom] = useState(0.5);          // zoom inicial 50%
  const [modalPan, setModalPan] = useState({ x: 0, y: 0 });
  const [modalIsDragging, setModalIsDragging] = useState(false);
  const [modalDragStart, setModalDragStart] = useState({ x: 0, y: 0 });

  /** Refs */
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const modalContainerRef = useRef<HTMLDivElement>(null);

  /** Dimensões slide/canvas */
  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  /** Hotkeys globais */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (imageModal.open) { setImageModal({ open: false }); document.documentElement.style.overflow=''; return; }
        if (selectedElement.element !== null) {
          setSelectedElement({ slideIndex: selectedElement.slideIndex, element: null });
        } else onClose();
      }
      if (e.key === 'ArrowRight') handleSlideClick(Math.min(focusedSlide + 1, slides.length - 1));
      if (e.key === 'ArrowLeft')  handleSlideClick(Math.max(focusedSlide - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageModal.open, selectedElement, onClose, focusedSlide, slides.length]);

  /** ========== Injeção de estilos/ids em cada srcDoc ========== */
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
      img[data-editable]{display:block!important}
      video[data-editable]{display:block!important}
    `);

    result = result.replace(
      /<body([^>]*)>/i,
      (m, attrs) => /id=/.test(attrs) ? m : `<body${attrs} id="slide-${slideIndex}-background" data-editable="background">`
    );
    return result;
  };

  useEffect(() => {
    setRenderedSlides(slides.map((s, i) => injectEditableIds(s, i)));
  }, [slides, carouselData.conteudos]);

  /** Posiciona no slide 0 */
  useEffect(() => {
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = 0 * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
    setFocusedSlide(0);
  }, []); // mount only

  /** Helpers de estilo de texto */
  const rgbToHex = (rgb: string): string => {
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return rgb;
    const [r, g, b] = m.map(v => parseInt(v, 10));
    const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  };
  const extractTextStyles = (doc: Document, el: HTMLElement): ElementStyles => {
    const cs = doc.defaultView?.getComputedStyle(el);
    if (!cs) return { fontSize: '16px', fontWeight: '400', textAlign: 'left', color: '#FFFFFF' };
    const color = cs.color || '#FFFFFF';
    return {
      fontSize: cs.fontSize || '16px',
      fontWeight: cs.fontWeight || '400',
      textAlign: (cs.textAlign as any) || 'left',
      color: color.startsWith('rgb') ? rgbToHex(color) : color,
    };
  };

  /** Maior elemento visual */
  const findLargestVisual = (doc: Document): { type: 'img' | 'bg' | 'vid', el: HTMLElement } | null => {
    let best: { type: 'img' | 'bg' | 'vid', el: HTMLElement, area: number } | null = null;
    const push = (type: 'img'|'bg'|'vid', el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area <= 9000) return;
      if (!best || area > best.area) best = { type, el, area };
    };

    // vídeos
    Array.from(doc.querySelectorAll('video')).forEach(v => push('vid', v as HTMLElement));
    // imgs
    Array.from(doc.querySelectorAll('img')).forEach((im) => {
      const img = im as HTMLImageElement;
      if (img.getAttribute('data-protected') === 'true' || isImgurUrl(img.src)) return;
      push('img', img);
    });
    // bg
    Array.from(doc.querySelectorAll<HTMLElement>('body,div,section,header,main,figure,article')).forEach(el => {
      const cs = doc.defaultView?.getComputedStyle(el);
      if (cs?.backgroundImage && cs.backgroundImage.includes('url(')) push('bg', el);
    });

    return best ? { type: best.type, el: best.el } : null;
  };

  /** Aplica BG instantâneo */
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
        img.style.objectFit = 'cover'; img.style.width = '100%'; img.style.height = '100%';
        return img;
      }
    }

    const best = findLargestVisual(doc);
    if (best) {
      if (best.type === 'img') {
        const img = best.el as HTMLImageElement;
        img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.loading = 'eager';
        img.src = imageUrl; img.setAttribute('data-bg-image-url', imageUrl);
        img.style.objectFit = 'cover'; img.style.width = '100%'; img.style.height = '100%';
        return img;
      } else if (best.type === 'bg') {
        best.el.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
        best.el.style.setProperty('background-repeat', 'no-repeat', 'important');
        best.el.style.setProperty('background-size', 'cover', 'important');
        best.el.style.setProperty('background-position', '50% 50%', 'important');
        return best.el;
      } else {
        return best.el;
      }
    }

    doc.body.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
    doc.body.style.setProperty('background-repeat', 'no-repeat', 'important');
    doc.body.style.setProperty('background-size', 'cover', 'important');
    doc.body.style.setProperty('background-position', '50% 50%', 'important');
    return doc.body;
  };

  /** ===== aplica estilos/conteúdo de texto e bg inicial quando iframe muda ===== */
  useEffect(() => {
    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe || !iframe.contentWindow) return;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;

      // marca imagens/vídeos editáveis
      const imgs = Array.from(doc.querySelectorAll('img'));
      let imgIdx = 0;
      imgs.forEach((im) => {
        const img = im as HTMLImageElement;
        if (isImgurUrl(img.src) && !img.getAttribute('data-protected')) img.setAttribute('data-protected', 'true');
        if (img.getAttribute('data-protected') !== 'true') {
          img.setAttribute('data-editable', 'image');
          if (!img.id) img.id = `slide-${index}-img-${imgIdx++}`;
        }
      });
      const vids = Array.from(doc.querySelectorAll('video'));
      let vidIdx = 0;
      vids.forEach(v => {
        (v as HTMLVideoElement).setAttribute('data-editable', 'video');
        if (!v.id) v.id = `slide-${index}-vid-${vidIdx++}`;
        (v as HTMLVideoElement).style.objectFit = 'cover';
        (v as HTMLVideoElement).style.width = '100%';
        (v as HTMLVideoElement).style.height = '100%';
      });

      // aplica texto/estilo
      const titleEl = doc.getElementById(`slide-${index}-title`);
      const subtitleEl = doc.getElementById(`slide-${index}-subtitle`);

      if (titleEl) {
        const styles = elementStyles[`${index}-title`];
        const content = editedContent[`${index}-title`];
        if (styles) {
          if (styles.fontSize) titleEl.setAttribute('style', `${titleEl.getAttribute('style') ?? ''};font-size:${styles.fontSize} !important;`);
          if (styles.fontWeight) titleEl.setAttribute('style', `${titleEl.getAttribute('style') ?? ''};font-weight:${styles.fontWeight} !important;`);
          if (styles.textAlign) titleEl.setAttribute('style', `${titleEl.getAttribute('style') ?? ''};text-align:${styles.textAlign} !important;`);
          if (styles.color) titleEl.setAttribute('style', `${titleEl.getAttribute('style') ?? ''};color:${styles.color} !important;`);
        }
        if (content !== undefined && titleEl.getAttribute('contenteditable') !== 'true') {
          titleEl.textContent = content;
        }
      }

      if (subtitleEl) {
        const styles = elementStyles[`${index}-subtitle`];
        const content = editedContent[`${index}-subtitle`];
        if (styles) {
          if (styles.fontSize) subtitleEl.setAttribute('style', `${subtitleEl.getAttribute('style') ?? ''};font-size:${styles.fontSize} !important;`);
          if (styles.fontWeight) subtitleEl.setAttribute('style', `${subtitleEl.getAttribute('style') ?? ''};font-weight:${styles.fontWeight} !important;`);
          if (styles.textAlign) subtitleEl.setAttribute('style', `${subtitleEl.getAttribute('style') ?? ''};text-align:${styles.textAlign} !important;`);
          if (styles.color) subtitleEl.setAttribute('style', `${subtitleEl.getAttribute('style') ?? ''};color:${styles.color} !important;`);
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

      // aplica bg salvo (se houver)
      const bg = editedContent[`${index}-background`];
      if (bg) {
        const best = findLargestVisual(doc);
        if (best) {
          if (best.type === 'img') {
            const img = best.el as HTMLImageElement;
            img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.loading = 'eager';
            img.src = bg; img.setAttribute('data-bg-image-url', bg);
            img.style.objectFit = 'cover'; img.style.width = '100%'; img.style.height = '100%';
          } else if (best.type === 'bg') {
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

  /** ========== Interações dentro dos iframes (seleção / inline edit) ========== */
  useEffect(() => {
    const setupIframe = (iframe: HTMLIFrameElement, slideIndex: number) => {
      if (!iframe.contentWindow) return;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;

      const clearAllSelections = () => {
        iframeRefs.current.forEach((f) => {
          const d = f?.contentDocument || f?.contentWindow?.document;
          if (!d) return;
          d.querySelectorAll('[data-editable]').forEach(x => x.classList.remove('selected'));
        });
      };

      const editable = doc.querySelectorAll('[data-editable]');
      editable.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const type = htmlEl.getAttribute('data-editable') as string;

        htmlEl.style.pointerEvents = 'auto';
        htmlEl.style.cursor = 'pointer';

        // Single click -> seleciona e abre Properties
        htmlEl.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          clearAllSelections();
          htmlEl.classList.add('selected');

          if (type === 'image' || type === 'video' || type === 'background') {
            setSelectedElement({ slideIndex, element: 'background' });
          } else if (type === 'title') {
            setSelectedElement({ slideIndex, element: 'title' });
          } else if (type === 'subtitle') {
            setSelectedElement({ slideIndex, element: 'subtitle' });
          } else {
            setSelectedElement({ slideIndex, element: null });
          }

          setFocusedSlide(slideIndex);
          if (!expandedLayers.has(slideIndex)) {
            setExpandedLayers(prev => new Set(prev).add(slideIndex));
          }
          setIsLoadingProperties(true);
          setTimeout(() => setIsLoadingProperties(false), 80);
        };

        // Double click -> inline edit (fica verde)
        if (type === 'title' || type === 'subtitle') {
          htmlEl.ondblclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            // seleciona para garantir borda azul antes de ficar verde
            clearAllSelections();
            htmlEl.classList.add('selected');

            htmlEl.setAttribute('contenteditable', 'true');
            htmlEl.focus();
            setIsEditingInline({ slideIndex, element: type as ElementType });

            const range = doc.createRange();
            range.selectNodeContents(htmlEl);
            const sel = iframe.contentWindow?.getSelection();
            if (sel) { sel.removeAllRanges(); sel.addRange(range); }
          };

          // Salva no blur
          htmlEl.onblur = () => {
            if (htmlEl.getAttribute('contenteditable') === 'true') {
              htmlEl.setAttribute('contenteditable', 'false');
              const newContent = htmlEl.textContent || '';
              const k = `${slideIndex}-${type}`;
              setEditedContent(prev => ({ ...prev, [k]: newContent }));
              setIsEditingInline(null);
            }
          };

          // Enter = salvar / Esc = cancelar foco
          htmlEl.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); }
            if (e.key === 'Escape') { e.preventDefault(); (e.target as HTMLElement).blur(); }
          };
        }
      });
    };

    // attach
    const timer = setTimeout(() => {
      iframeRefs.current.forEach((iframe, idx) => {
        if (!iframe) return;
        iframe.onload = () => setTimeout(() => setupIframe(iframe, idx), 60);
        if (iframe.contentDocument?.readyState === 'complete') setupIframe(iframe, idx);
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [renderedSlides, expandedLayers]);

  /** ====================== Slide click, seleção, setters ======================= */
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

  /** ====================== Busca / Upload / Download ======================= */
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

  /** ====================== Troca BG ======================= */
  const handleBackgroundImageChange = (slideIndex: number, imageUrl: string) => {
    const updatedEl = applyBackgroundImageImmediate(slideIndex, imageUrl);

    // limpa seleções
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

  /** ====================== Abrir / aplicar Modal ======================= */
  const computeCover = (natW: number, natH: number, contW: number, contH: number) => {
    const scale = Math.max(contW / Math.max(1, natW), contH / Math.max(1, natH));
    return { displayW: Math.ceil(natW * scale), displayH: Math.ceil(natH * scale) };
  };

  const openImageEditModal = (slideIndex: number) => {
    setModalZoom(0.5);
    setModalPan({ x: 0, y: 0 });

    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!doc) return;

    const selected = doc.querySelector('[data-editable].selected') as HTMLElement | null;
    const largest = findLargestVisual(doc)?.el || null;
    const chosen = selected || largest || (doc.body as HTMLElement);
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
      const m = cs?.backgroundImage?.match(/url\(["']?(.+?)["']?\)/i);
      imageUrl = m?.[1] || '';
      targetType = 'bg';
    }
    if (!imageUrl) return;

    const r = chosen.getBoundingClientRect();
    const bodyRect = doc.body.getBoundingClientRect();
    const targetLeftPx = r.left - bodyRect.left;
    const targetTopPx  = r.top  - bodyRect.top;
    const targetWidthPx = r.width;
    const targetHeightPx = r.height;

    if (isVideo) {
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
        cropX: 0, cropY: 0, cropW: targetWidthPx, cropH: targetHeightPx,
      });
      document.documentElement.style.overflow = 'hidden';
      return;
    }

    // IMAGEM / BG
    const tmp = new Image();
    tmp.src = imageUrl;
    const done = () => {
      const natW = tmp.naturalWidth || targetWidthPx || 1;
      const natH = tmp.naturalHeight || targetHeightPx || 1;

      // cover central como ponto de partida
      const { displayW, displayH } = computeCover(natW, natH, targetWidthPx, targetHeightPx);
      const startLeft = (targetWidthPx - displayW) / 2;
      const startTop = (targetHeightPx - displayH) / 2;

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
        videoTargetW: 0, videoTargetH: 0, videoTargetLeft: 0, videoTargetTop: 0,
        cropX: 0, cropY: 0, cropW: 0, cropH: 0,
      });
      document.documentElement.style.overflow = 'hidden';
    };
    if (tmp.complete && tmp.naturalWidth && tmp.naturalHeight) done();
    else tmp.onload = done;
  };

  const applyImageEditModal = () => {
    if (!imageModal.open) return;

    const {
      slideIndex, targetType, targetSelector, imageUrl,
      containerHeightPx, imgOffsetTopPx, imgOffsetLeftPx,
      naturalW, naturalH, targetWidthPx,
      isVideo, videoTargetW, videoTargetH, cropX, cropY, cropW, cropH
    } = imageModal;

    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!doc) { setImageModal({ open: false }); document.documentElement.style.overflow = ''; return; }

    const el = doc.querySelector(targetSelector) as HTMLElement | null;
    if (!el) { setImageModal({ open: false }); document.documentElement.style.overflow = ''; return; }

    if (isVideo && targetType === 'vid') {
      const vid = el as HTMLVideoElement;
      // wrapper de crop
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

    // IMAGEM
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

      const scale = Math.max(targetWidthPx / naturalW, containerHeightPx / naturalH);
      const displayW = Math.ceil(naturalW * scale) + 2;
      const displayH = Math.ceil(naturalH * scale) + 2;
      const minLeft = targetWidthPx - displayW;
      const minTop  = containerHeightPx - displayH;

      const safeLeft = clamp(isNaN(imgOffsetLeftPx) ? (minLeft/2) : imgOffsetLeftPx, minLeft, 0);
      const safeTop  = clamp(isNaN(imgOffsetTopPx)  ? (minTop/2)  : imgOffsetTopPx,  minTop,  0);

      (el as HTMLElement).style.position = 'absolute';
      (el as HTMLElement).style.width  = `${displayW}px`;
      (el as HTMLElement).style.height = `${displayH}px`;
      (el as HTMLElement).style.left   = `${safeLeft}px`;
      (el as HTMLElement).style.top    = `${safeTop}px`;
      (el as HTMLImageElement).removeAttribute('srcset');
      (el as HTMLImageElement).removeAttribute('sizes');
      (el as HTMLImageElement).loading = 'eager';
      if ((el as HTMLImageElement).src !== imageUrl) (el as HTMLImageElement).src = imageUrl;
      (el as HTMLImageElement).style.objectFit = 'cover';
      (el as HTMLImageElement).style.backfaceVisibility = 'hidden';
      (el as HTMLImageElement).style.transform = 'translateZ(0)';
    }

    // BACKGROUND
    if (targetType === 'bg') {
      const scale = Math.max(targetWidthPx / naturalW, containerHeightPx / naturalH);
      const displayW = Math.ceil(naturalW * scale);
      const displayH = Math.ceil(naturalH * scale);
      const maxOffsetX = Math.max(0, displayW - targetWidthPx);
      const maxOffsetY = Math.max(0, displayH - containerHeightPx);
      let xPerc = maxOffsetX ? (-imgOffsetLeftPx / maxOffsetX) * 100 : 50;
      let yPerc = maxOffsetY ? (-imgOffsetTopPx  / maxOffsetY) * 100 : 50;
      if (!isFinite(xPerc)) xPerc = 50;
      if (!isFinite(yPerc)) yPerc = 50;

      el.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
      el.style.setProperty('background-repeat', 'no-repeat', 'important');
      el.style.setProperty('background-size', 'cover', 'important');
      el.style.setProperty('background-position-x', `${xPerc}%`, 'important');
      el.style.setProperty('background-position-y', `${yPerc}%`, 'important');
      el.style.setProperty('height', `${containerHeightPx}px`, 'important');
      if ((doc.defaultView?.getComputedStyle(el).position || 'static') === 'static') el.style.position = 'relative';
    }

    setImageModal({ open: false });
    document.documentElement.style.overflow = '';
  };

  /** ====================== Render ======================= */
  return (
    <div className="fixed top-14 left-16 right-0 bottom-0 bg-neutral-900 flex" style={{ zIndex: 99 }}>
      {/* MODAL */}
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
                {/* Topbar modal */}
                <div className="h-12 px-4 flex items-center justify-between border-b border-neutral-800">
                  <div className="text-white font-medium text-sm">
                    {imageModal.isVideo ? 'Crop do vídeo' : 'Edição da imagem'} — Slide {imageModal.slideIndex + 1}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setModalZoom(z => Math.max(0.1, z - 0.1))}
                      className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <div className="bg-neutral-800 text-white px-3 py-1.5 rounded text-xs min-w-[70px] text-center">
                      {Math.round(modalZoom * 100)}%
                    </div>
                    <button
                      onClick={() => setModalZoom(z => Math.min(2, z + 0.1))}
                      className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <div className="w-px h-6 bg-neutral-800 mx-2" />
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

                {/* Conteúdo modal com CANVAS (um slide) */}
                <div className="w-full h-[calc(100%-3rem)] overflow-hidden">
                  {/* Instruções */}
                  <div className="p-3 text-neutral-400 text-xs border-b border-neutral-800">
                    {imageModal.isVideo ? (
                      <>
                        <div>• Arraste o retângulo para mover o crop.</div>
                        <div>• Use os handles nas bordas/cantos para redimensionar.</div>
                      </>
                    ) : (
                      <>
                        <div>• Arraste a imagem para ajustar o enquadramento (com bleed visível).</div>
                        <div>• Arraste a borda inferior da máscara para ajustar a altura visível.</div>
                      </>
                    )}
                  </div>

                  {/* Canvas do popup */}
                  <div
                    ref={modalContainerRef}
                    className="relative w-full h-[calc(100%-44px)] bg-neutral-900 overflow-hidden"
                    onWheel={(e) => {
                      e.preventDefault();
                      if (e.ctrlKey) {
                        const rect = modalContainerRef.current!.getBoundingClientRect();
                        const mouseX = (e.clientX - rect.left - modalPan.x) / modalZoom;
                        const mouseY = (e.clientY - rect.top  - modalPan.y) / modalZoom;
                        const delta = e.deltaY > 0 ? -0.05 : 0.05;
                        const newZoom = Math.min(Math.max(0.1, modalZoom + delta), 2);
                        setModalZoom(newZoom);
                        setModalPan({
                          x: e.clientX - rect.left - mouseX * newZoom,
                          y: e.clientY - rect.top  - mouseY * newZoom,
                        });
                      } else {
                        setModalPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
                      }
                    }}
                    onMouseDown={(e) => {
                      // pan do canvas do modal — só se clicar fora da área de edição
                      if ((e.target as HTMLElement).closest('[data-modal-editor-area]')) return;
                      setModalIsDragging(true);
                      setModalDragStart({ x: e.clientX - modalPan.x, y: e.clientY - modalPan.y });
                    }}
                    onMouseMove={(e) => {
                      if (modalIsDragging) {
                        setModalPan({ x: e.clientX - modalDragStart.x, y: e.clientY - modalDragStart.y });
                      }
                    }}
                    onMouseUp={() => setModalIsDragging(false)}
                    onMouseLeave={() => setModalIsDragging(false)}
                  >
                    <div
                      className="absolute"
                      style={{
                        transform: `translate(${modalPan.x}px, ${modalPan.y}px) scale(${modalZoom})`,
                        transformOrigin: 'center center',
                        left: '50%', top: '50%',
                        marginLeft: `-${slideWidth/2}px`,
                        marginTop: `-${slideHeight/2}px`,
                        transition: modalIsDragging ? 'none' : 'transform 0.2s ease-out'
                      }}
                    >
                      {/* SLIDE PREVIEW (um iframe) */}
                      <div
                        className="relative bg-neutral-100 rounded-xl shadow-xl border border-neutral-800"
                        data-modal-editor-area
                        style={{ width: slideWidth, height: slideHeight, overflow: 'hidden' }}
                      >
                        <iframe
                          srcDoc={renderedSlides[imageModal.slideIndex]}
                          className="absolute inset-0 w-full h-full pointer-events-none"
                          sandbox="allow-same-origin allow-scripts"
                          title={`Slide Preview ${imageModal.slideIndex + 1}`}
                        />

                        {/* Overlay editor IMAGEM/BG */}
                        {!imageModal.isVideo ? (() => {
                          const containerLeft = imageModal.targetLeftPx;
                          const containerTop  = imageModal.targetTopPx;
                          const containerWidth  = imageModal.targetWidthPx;
                          const containerHeight = imageModal.containerHeightPx;

                          // cover + bleed
                          const scale = Math.max(containerWidth / Math.max(1, imageModal.naturalW), containerHeight / Math.max(1, imageModal.naturalH));
                          const displayW = Math.ceil(imageModal.naturalW * scale) + 2;
                          const displayH = Math.ceil(imageModal.naturalH * scale) + 2;

                          // limites para manter o container sempre coberto
                          const minLeft = containerWidth  - displayW;
                          const minTop  = containerHeight - displayH;
                          const maxLeft = 0;
                          const maxTop  = 0;

                          // offsets clampados
                          const safeLeft = clamp(imageModal.imgOffsetLeftPx, minLeft, maxLeft);
                          const safeTop  = clamp(imageModal.imgOffsetTopPx,  minTop,  maxTop);

                          // bleeding visual (partes fora do container aparecem com 40% opacidade)
                          const bleedLeft   = safeLeft < 0 ? Math.abs(safeLeft) : 0;
                          const bleedTop    = safeTop  < 0 ? Math.abs(safeTop)  : 0;
                          const bleedRight  = Math.max(0, (safeLeft + displayW) - containerWidth);
                          const bleedBottom = Math.max(0, (safeTop  + displayH) - containerHeight);

                          return (
                            <>
                              {/* Destaque do contêiner */}
                              <div
                                className="absolute rounded-lg pointer-events-none"
                                style={{
                                  left: containerLeft - 2,
                                  top:  containerTop  - 2,
                                  width: containerWidth + 4,
                                  height: containerHeight + 4,
                                  boxShadow: '0 0 0 2px rgba(59,130,246,0.9)'
                                }}
                              />

                              {/* 4 áreas esmaecidas fora do contêiner (escurecem o SLIDE) */}
                              <div className="absolute top-0 left-0 bg-black/30 pointer-events-none" style={{ width: '100%', height: containerTop }} />
                              <div className="absolute left-0 bg-black/30 pointer-events-none" style={{ top: containerTop, width: containerLeft, height: containerHeight }} />
                              <div className="absolute bg-black/30 pointer-events-none" style={{ top: containerTop, right: 0, width: slideWidth - (containerLeft + containerWidth), height: containerHeight }} />
                              <div className="absolute left-0 bottom-0 bg-black/30 pointer-events-none" style={{ width: '100%', height: slideHeight - (containerTop + containerHeight) }} />

                              {/* IMAGEM com bleed visível */}
                              {/* camada "fora" do container (40%) */}
                              <img
                                src={imageModal.imageUrl}
                                alt="outside-bleed"
                                draggable={false}
                                style={{
                                  position: 'absolute',
                                  left: containerLeft + safeLeft,
                                  top:  containerTop  + safeTop,
                                  width: displayW,
                                  height: displayH,
                                  opacity: 0.4,
                                  pointerEvents: 'none',
                                  objectFit: 'cover',
                                  backfaceVisibility: 'hidden',
                                  transform: 'translateZ(0)',
                                }}
                              />
                              {/* máscara do container recortando a imagem em 100% */}
                              <div
                                className="absolute"
                                style={{
                                  left: containerLeft,
                                  top:  containerTop,
                                  width: containerWidth,
                                  height: containerHeight,
                                  overflow: 'hidden',
                                  borderRadius: 8
                                }}
                              >
                                <img
                                  src={imageModal.imageUrl}
                                  alt="inside-mask"
                                  draggable={false}
                                  style={{
                                    position: 'absolute',
                                    left: safeLeft,
                                    top:  safeTop,
                                    width: displayW,
                                    height: displayH,
                                    opacity: 1,
                                    pointerEvents: 'none',
                                    objectFit: 'cover',
                                    backfaceVisibility: 'hidden',
                                    transform: 'translateZ(0)',
                                  }}
                                />
                                {/* drag surface (somente enquanto botão pressionado) */}
                                <DragSurface
                                  onDrag={(dx, dy) => {
                                    // mover e manter cobertura (clamp)
                                    const nextLeft = clamp(imageModal.imgOffsetLeftPx + dx, minLeft, maxLeft);
                                    const nextTop  = clamp(imageModal.imgOffsetTopPx  + dy, minTop,  maxTop);
                                    if (nextLeft !== imageModal.imgOffsetLeftPx || nextTop !== imageModal.imgOffsetTopPx) {
                                      setImageModal({ ...imageModal, imgOffsetLeftPx: nextLeft, imgOffsetTopPx: nextTop });
                                    }
                                  }}
                                />
                                {/* barra de resize inferior do container */}
                                <ResizeBar
                                  position="bottom"
                                  onResize={(dy) => {
                                    const newH = Math.max(60, containerHeight + dy);
                                    const newScale = Math.max(containerWidth / Math.max(1, imageModal.naturalW), newH / Math.max(1, imageModal.naturalH));
                                    const newDisplayW = Math.ceil(imageModal.naturalW * newScale) + 2;
                                    const newDisplayH = Math.ceil(imageModal.naturalH * newScale) + 2;
                                    const newMinLeft = containerWidth - newDisplayW;
                                    const newMinTop  = newH - newDisplayH;
                                    const adjLeft = clamp(imageModal.imgOffsetLeftPx, newMinLeft, 0);
                                    const adjTop  = clamp(imageModal.imgOffsetTopPx,  newMinTop,  0);
                                    setImageModal({
                                      ...imageModal,
                                      containerHeightPx: newH,
                                      imgOffsetLeftPx: adjLeft,
                                      imgOffsetTopPx:  adjTop,
                                    });
                                  }}
                                />
                              </div>
                            </>
                          );
                        })() : (
                          // ======= VÍDEO =======
                          (() => {
                            const vLeft = imageModal.videoTargetLeft;
                            const vTop  = imageModal.videoTargetTop;
                            const vW    = imageModal.videoTargetW;
                            const vH    = imageModal.videoTargetH;

                            return (
                              <>
                                {/* destaque do vídeo e escurecimento do resto */}
                                <div className="absolute top-0 left-0 bg-black/30 pointer-events-none" style={{ width: '100%', height: vTop }} />
                                <div className="absolute left-0 bg-black/30 pointer-events-none" style={{ top: vTop, width: vLeft, height: vH }} />
                                <div className="absolute bg-black/30 pointer-events-none" style={{ top: vTop, right: 0, width: slideWidth - (vLeft + vW), height: vH }} />
                                <div className="absolute left-0 bottom-0 bg-black/30 pointer-events-none" style={{ width: '100%', height: slideHeight - (vTop + vH) }} />
                                <div
                                  className="absolute rounded-lg pointer-events-none"
                                  style={{
                                    left: vLeft - 2, top: vTop - 2, width: vW + 4, height: vH + 4,
                                    boxShadow: '0 0 0 2px rgba(59,130,246,0.9)'
                                  }}
                                />
                                {/* cropper retangular */}
                                <VideoCropper imageModal={imageModal} setImageModal={setImageModal} />
                              </>
                            );
                          })()
                        )}
                      </div>
                    </div>

                    {/* HUD de zoom do popup */}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-neutral-950/90 backdrop-blur-sm text-neutral-400 px-3 py-1.5 rounded text-xs z-[2]">
                      Zoom: {Math.round(modalZoom * 100)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Sidebar esquerda (Layers) */}
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
                  onClick={() => { toggleLayer(index); handleSlideClick(index); }}
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

      {/* Área central (Canvas com todos os slides) */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
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

        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative bg-neutral-800"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onWheel={(e) => {
            e.preventDefault();
            if (imageModal.open) return;

            const rect = containerRef.current!.getBoundingClientRect();
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
            if (isDragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
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

      {/* Sidebar direita (Properties) */}
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
                  {isLoadingProperties ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    </div>
                  ) : (
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
                        <button
                          onClick={() => openImageEditModal(selectedElement.slideIndex)}
                          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
                          title="Abrir popup de edição"
                        >
                          Editar
                        </button>
                      </div>

                      <div className="space-y-2">
                        {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo && (() => {
                          const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo!;
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
                            <div
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}
                            >
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
                            <div
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}
                            >
                              <div className="text-neutral-400 text-xs mb-1">{isVid ? 'Video 3' : 'Image 3'}</div>
                              <img src={bgUrl} alt="BG 3" className="w-full h-24 object-cover rounded" />
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
                              <img src={bgUrl} alt="Uploaded" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}
                      </div>

                      {/* Busca */}
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

                      {/* Upload */}
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

/** ========== DragSurface (arrasta enquanto o mouse está pressionado) ========== */
const DragSurface: React.FC<{ onDrag: (dx: number, dy: number) => void; cursor?: React.CSSProperties['cursor'] }> = ({ onDrag, cursor }) => {
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (dragging.current) onDrag(e.movementX, e.movementY); };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onDrag]);

  return (
    <div
      onMouseDown={(e) => { e.preventDefault(); dragging.current = true; }}
      className="absolute inset-0"
      style={{ zIndex: 10, background: 'transparent', cursor: cursor || 'move', pointerEvents: 'auto' }}
    />
  );
};

/** ========== ResizeBar (ajuste da altura visível do container) ========== */
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
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
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

/** ========== Crop de vídeo (handles + drag) ========== */
const VideoCropper: React.FC<{
  imageModal: ImageEditModalState & { open: true; isVideo: true };
  setImageModal: React.Dispatch<React.SetStateAction<ImageEditModalState>>;
}> = ({ imageModal, setImageModal }) => {
  const cropResizeRef = useRef<{ active: boolean; pos: HandlePos | null }>({ active: false, pos: null });
  const cropDragRef = useRef<boolean>(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!imageModal.open || !imageModal.isVideo) return;

      // resize pelos handles
      if (cropResizeRef.current.active && cropResizeRef.current.pos) {
        const pos = cropResizeRef.current.pos;
        const dx = e.movementX;
        const dy = e.movementY;

        setImageModal(prev => {
          if (!prev.open || !prev.isVideo) return prev;
          const vW = prev.videoTargetW; const vH = prev.videoTargetH;
          let { cropX:x, cropY:y, cropW:w, cropH:h } = prev;

          if (pos.includes('w')) { const nx = x + dx; const dw = x - nx; x = nx; w = w + dw; }
          if (pos.includes('e')) { w = w + dx; }
          if (pos.includes('n')) { const ny = y + dy; const dh = y - ny; y = ny; h = h + dh; }
          if (pos.includes('s')) { h = h + dy; }

          // clamp
          w = Math.max(40, Math.min(w, vW));
          h = Math.max(40, Math.min(h, vH));
          x = clamp(x, 0, vW - w);
          y = clamp(y, 0, vH - h);

          return { ...prev, cropX: x, cropY: y, cropW: w, cropH: h };
        });
        return;
      }

      // drag do retangulo
      if (cropDragRef.current) {
        const dx = e.movementX;
        const dy = e.movementY;
        setImageModal(prev => {
          if (!prev.open || !prev.isVideo) return prev;
          const vW = prev.videoTargetW; const vH = prev.videoTargetH;
          let nx = prev.cropX + dx;
          let ny = prev.cropY + dy;
          nx = clamp(nx, 0, vW - prev.cropW);
          ny = clamp(ny, 0, vH - prev.cropH);
          return { ...prev, cropX: nx, cropY: ny };
        });
      }
    };

    const onUp = () => { cropDragRef.current = false; cropResizeRef.current.active = false; cropResizeRef.current.pos = null; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [imageModal.open, imageModal.isVideo, setImageModal]);

  if (!imageModal.open || !imageModal.isVideo) return null;

  const vLeft = imageModal.videoTargetLeft;
  const vTop  = imageModal.videoTargetTop;

  const handleStyles: Record<HandlePos, React.CSSProperties> = {
    n:  { top: -6, left: '50%', marginLeft: -6, width: 12, height: 12, cursor: 'ns-resize' },
    s:  { bottom: -6, left: '50%', marginLeft: -6, width: 12, height: 12, cursor: 'ns-resize' },
    e:  { right: -6, top: '50%', marginTop: -6, width: 12, height: 12, cursor: 'ew-resize' },
    w:  { left: -6, top: '50%', marginTop: -6, width: 12, height: 12, cursor: 'ew-resize' },
    ne: { top: -6, right: -6, width: 12, height: 12, cursor: 'nesw-resize' },
    nw: { top: -6, left: -6, width: 12, height: 12, cursor: 'nwse-resize' },
    se: { bottom: -6, right: -6, width: 12, height: 12, cursor: 'nwse-resize' },
    sw: { bottom: -6, left: -6, width: 12, height: 12, cursor: 'nesw-resize' },
  };

  return (
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
      }}
      onMouseDown={(e) => { e.preventDefault(); cropDragRef.current = true; }}
    >
      {(Object.keys(handleStyles) as HandlePos[]).map((pos) => (
        <div
          key={pos}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); cropResizeRef.current.active = true; cropResizeRef.current.pos = pos; }}
          style={{
            position: 'absolute',
            background: 'white',
            borderRadius: 999,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
            ...handleStyles[pos],
          }}
        />
      ))}
    </div>
  );
};

type HandlePos = 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw';

export default CarouselViewer;