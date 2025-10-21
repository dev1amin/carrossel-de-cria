import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  X, ZoomIn, ZoomOut, Download, ChevronDown, ChevronRight, Layers,
  Image as ImageIcon, Type, Upload, Search, Play
} from 'lucide-react';
import { CarouselData, ElementType, ElementStyles } from '../types';
import { searchImages } from '../services';

/* =================== Utils =================== */
const isVideoUrl = (url: string): boolean => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
const isImgurUrl = (url: string): boolean => url.includes('i.imgur.com');

interface CarouselViewerProps {
  slides: string[];
  carouselData: CarouselData;
  onClose: () => void;
}

type TargetKind = 'img' | 'bg';

type ImageModalState =
  | {
      open: true;
      slideIndex: number;
      targetType: TargetKind;
      targetId: string;
      imageUrl: string;
      naturalW: number;
      naturalH: number;

      // container alvo (no slide) – dimensões e posição:
      targetWidthPx: number;         // largura do container no slide (px)
      containerHeightPx: number;     // altura visível (recorte) no slide (px)
      containerLeftPx: number;       // posição X do container dentro do slide (px)
      containerTopPx: number;        // posição Y do container dentro do slide (px)

      // posição Y da imagem dentro do container (px; <= 0)
      imgOffsetTopPx: number;

      // altura do modal
      modalHeightPx: number;
    }
  | { open: false };

/* =============== Modal Portal =============== */
const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const elRef = useRef<HTMLElement | null>(null);
  if (!elRef.current) elRef.current = document.createElement('div');
  useEffect(() => {
    const el = elRef.current!;
    el.style.zIndex = '9999';
    document.body.appendChild(el);
    return () => { document.body.removeChild(el); };
  }, []);
  return ReactDOM.createPortal(children, elRef.current);
};

/* =============== Componente principal =============== */
const CarouselViewer: React.FC<CarouselViewerProps> = ({ slides, carouselData, onClose }) => {
  /* Canvas */
  const [zoom, setZoom] = useState(0.35);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [focusedSlide, setFocusedSlide] = useState<number | null>(0);

  /* Seleção & estilos */
  const [selectedElement, setSelectedElement] = useState<{ slideIndex: number; element: ElementType }>({ slideIndex: 0, element: null });
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set([0]));
  const [editedContent, setEditedContent] = useState<Record<string, any>>({});
  const [elementStyles, setElementStyles] = useState<Record<string, ElementStyles>>({});
  const [originalStyles, setOriginalStyles] = useState<Record<string, ElementStyles>>({});
  const [renderedSlides, setRenderedSlides] = useState<string[]>(slides);

  /* Busca / Upload */
  const [isEditingInline, setIsEditingInline] = useState<{ slideIndex: number; element: ElementType } | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<Record<number, string>>({});
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);

  /* Vídeo crop legado (mantido) */
  const [cropMode, setCropMode] = useState<{ slideIndex: number; videoId: string } | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<Record<string, { width: number; height: number }>>({});

  /* MODAL de edição de imagem */
  const [imageModal, setImageModal] = useState<ImageModalState>({ open: false });

  /* Refs */
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({});

  /* Layout slide */
  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  /* ======== Keybindings ======== */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (imageModal.open) { closeImageModal(); return; }
        if (cropMode) { setCropMode(null); return; }
        if (selectedElement.element !== null) setSelectedElement({ slideIndex: selectedElement.slideIndex, element: null });
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cropMode, imageModal, selectedElement, onClose]);

  /* ======== Injeção de ids editáveis ======== */
  const injectEditableIds = (html: string, slideIndex: number): string => {
    let result = html;
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

  useEffect(() => {
    setRenderedSlides(slides.map((s, i) => injectEditableIds(s, i)));
  }, [slides]);

  useEffect(() => {
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = 0 * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
    setFocusedSlide(0);
  }, []);

  /* ======== Helpers DOM no iframe ======== */
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

  const applyBackgroundImageImmediate = (slideIndex: number, imageUrl: string): HTMLElement | null => {
    const iframe = iframeRefs.current[slideIndex];
    if (!iframe || !iframe.contentWindow) return null;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return null;

    const targetImg = selectedImageRefs.current[slideIndex];
    if (targetImg && targetImg.getAttribute('data-protected') !== 'true') {
      if (!isVideoUrl(imageUrl)) {
        targetImg.removeAttribute('srcset'); targetImg.removeAttribute('sizes'); targetImg.loading = 'eager';
        targetImg.src = imageUrl;
        targetImg.setAttribute('data-bg-image-url', imageUrl);
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
        return best.el;
      }
    }

    doc.body.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
    return doc.body;
  };

  /* ======== Efeitos no iframe (aplicação de estilos e bg) ======== */
  useEffect(() => {
    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe || !iframe.contentWindow) return;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;

      // tornar imagens editáveis
      const imgs = Array.from(doc.querySelectorAll('img'));
      let imgIdx = 0;
      imgs.forEach((im) => {
        const el = im as HTMLImageElement;
        if (isImgurUrl(el.src) && !el.getAttribute('data-protected')) el.setAttribute('data-protected', 'true');
        if (el.getAttribute('data-protected') !== 'true') {
          el.setAttribute('data-editable', 'image');
          if (!el.id) el.id = `slide-${index}-img-${imgIdx++}`;
        }
      });

      // estilos de texto + conteúdo
      const titleEl = doc.getElementById(`slide-${index}-title`);
      const subtitleEl = doc.getElementById(`slide-${index}-subtitle`);
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

      // captura estilos originais (1x)
      setTimeout(() => {
        if (titleEl && !originalStyles[`${index}-title`]) setOriginalStyles(p => ({ ...p, [`${index}-title`]: extractTextStyles(doc, titleEl as HTMLElement) }));
        if (subtitleEl && !originalStyles[`${index}-subtitle`]) setOriginalStyles(p => ({ ...p, [`${index}-subtitle`]: extractTextStyles(doc, subtitleEl as HTMLElement) }));
      }, 50);

      // aplicar bg do estado (se houver)
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
          }
        } else {
          doc.body.style.setProperty('background-image', `url('${bg}')`, 'important');
        }
      }
    });
  }, [elementStyles, editedContent, originalStyles]);

  /* ======== Interações (seleção / inline) no iframe ======== */
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

  /* ======== Lateral: trocar imagem e abrir modal ======== */
  const handleBackgroundImageChange = (slideIndex: number, imageUrl: string) => {
    const updatedEl = applyBackgroundImageImmediate(slideIndex, imageUrl);

    // seleção visual
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

  const handleSearchImages = async () => {
    if (!searchKeyword.trim()) return;
    setIsSearching(true);
    try {
      const imageUrls = await searchImages(searchKeyword);
      setSearchResults(imageUrls);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
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

  /* ===================== IMAGE EDIT MODAL ===================== */

  const closeImageModal = () => {
    setImageModal({ open: false });
    document.documentElement.style.overflow = '';
  };

  const openImageEditModal = (slideIndex: number) => {
    const ifr = iframeRefs.current[slideIndex];
    const doc = ifr?.contentDocument || ifr?.contentWindow?.document;
    if (!doc) return;

    // 1) alvo selecionado
    let target = doc.querySelector('[data-editable].selected') as HTMLElement | null;
    // 2) maior visual
    if (!target) {
      const best = findLargestVisual(doc);
      target = best?.el || null;
    }
    // 3) primeira img
    if (!target) target = doc.querySelector('img[data-editable]') as HTMLElement | null;
    if (!target) return;

    if (!target.id) target.id = `img-target-${Date.now()}`;

    // descobre URL + tipo
    let imageUrl = '';
    let targetType: TargetKind = 'img';
    const cs = doc.defaultView?.getComputedStyle(target);
    if (target.tagName === 'IMG') {
      imageUrl = (target as HTMLImageElement).src;
      targetType = 'img';
    } else if (cs?.backgroundImage && cs.backgroundImage.includes('url(')) {
      const m = cs.backgroundImage.match(/url\(["']?(.+?)["']?\)/i);
      imageUrl = m?.[1] || '';
      targetType = 'bg';
    }
    if (!imageUrl) {
      const fb = editedContent[`${slideIndex}-background`]
        || carouselData.conteudos[slideIndex]?.imagem_fundo
        || carouselData.conteudos[slideIndex]?.imagem_fundo2
        || carouselData.conteudos[slideIndex]?.imagem_fundo3
        || '';
      imageUrl = fb;
    }
    if (!imageUrl) return;

    // medidas reais do container/elemento (relativas ao slide)
    const slideRect = (doc.body.getBoundingClientRect());
    const r = target.getBoundingClientRect();
    const targetWidthPx = r.width;
    const containerHeightPx = Math.max(60, r.height);
    const containerLeftPx = r.left - slideRect.left;
    const containerTopPx = r.top - slideRect.top;

    // offset inicial
    let imgOffsetTopPx = 0;
    if (targetType === 'img') {
      const top = parseFloat((target as HTMLImageElement).style.top || '0');
      imgOffsetTopPx = isNaN(top) ? 0 : top;
    } else {
      // para bg, começamos com 0 e ajustamos após saber natural sizes
      imgOffsetTopPx = 0;
    }

    const tmp = new Image();
    tmp.src = imageUrl;

    const finalize = (natW: number, natH: number) => {
      setImageModal({
        open: true,
        slideIndex,
        targetType,
        targetId: target!.id,
        imageUrl,
        naturalW: natW || 1000,
        naturalH: natH || 1000,
        targetWidthPx,
        containerHeightPx,
        containerLeftPx,
        containerTopPx,
        imgOffsetTopPx,
        modalHeightPx: 820,
      });
      document.documentElement.style.overflow = 'hidden';
    };

    if (tmp.complete && tmp.naturalWidth && tmp.naturalHeight) {
      finalize(tmp.naturalWidth, tmp.naturalHeight);
    } else {
      tmp.onload = () => finalize(tmp.naturalWidth, tmp.naturalHeight);
      tmp.onerror = () => finalize(1000, 1000);
    }
  };

  const applyImageEditModal = () => {
    if (!imageModal.open) return;

    const {
      slideIndex, targetType, targetId, imageUrl,
      containerHeightPx, imgOffsetTopPx, naturalW, naturalH, targetWidthPx
    } = imageModal;

    const ifr = iframeRefs.current[slideIndex];
    const doc = ifr?.contentDocument || ifr?.contentWindow?.document;
    if (!doc) { closeImageModal(); return; }

    const el = doc.getElementById(targetId) as HTMLElement | null;
    if (!el) { closeImageModal(); return; }

    if (targetType === 'img') {
      // garantir wrapper com overflow hidden no slide real
      let wrapper = el.parentElement;
      if (!wrapper || !wrapper.classList.contains('img-crop-wrapper')) {
        const w = doc.createElement('div');
        w.className = 'img-crop-wrapper';
        w.style.display = 'inline-block';
        w.style.position = 'relative';
        w.style.overflow = 'hidden';
        w.style.borderRadius = getComputedStyle(el).borderRadius;

        if (el.parentNode) el.parentNode.replaceChild(w, el);
        w.appendChild(el);
        wrapper = w;
      }

      (wrapper as HTMLElement).style.width = `${targetWidthPx}px`;
      (wrapper as HTMLElement).style.height = `${containerHeightPx}px`;

      el.style.position = 'absolute';
      el.style.left = '0px';
      el.style.maxWidth = 'unset';
      el.style.maxHeight = 'unset';
      el.style.width = `${targetWidthPx}px`;
      el.style.height = `${targetWidthPx * (naturalH / naturalW)}px`;

      const imgH = targetWidthPx * (naturalH / naturalW);
      const minTop = Math.min(0, containerHeightPx - imgH);
      const clampedTop = Math.max(minTop, Math.min(0, imgOffsetTopPx));
      el.style.top = `${clampedTop}px`;

      (el as HTMLImageElement).removeAttribute('srcset');
      (el as HTMLImageElement).removeAttribute('sizes');
      (el as HTMLImageElement).loading = 'eager';
      if ((el as HTMLImageElement).src !== imageUrl) (el as HTMLImageElement).src = imageUrl;

    } else {
      // background
      const imgDisplayH = targetWidthPx * (naturalH / naturalW);
      const maxOffset = Math.max(0, imgDisplayH - containerHeightPx);
      const perc = maxOffset ? (-imgOffsetTopPx / maxOffset) * 100 : 0;

      el.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
      el.style.setProperty('background-repeat', 'no-repeat', 'important');
      el.style.setProperty('background-size', '100% auto', 'important');
      el.style.setProperty('background-position-x', 'center', 'important');
      el.style.setProperty('background-position-y', `${perc}%`, 'important');
      el.style.setProperty('height', `${containerHeightPx}px`, 'important');
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    }

    closeImageModal();
  };

  /* ===================== Render ===================== */

  return (
    <div className="fixed top-14 left-16 right-0 bottom-0 z-[90] bg-neutral-900 flex">
      {/* ================== MODAL (portal) ================== */}
      {imageModal.open && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999]">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70" />
            {/* Shell redimensionável (altura) */}
            <div
              className="absolute left-1/2 -translate-x-1/2 top-8 w-[min(98vw,1400px)]"
              style={{ height: imageModal.modalHeightPx }}
            >
              <div className="relative h-full bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col">
                {/* Header */}
                <div className="h-12 px-4 flex items-center justify-between border-b border-neutral-800">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium text-sm">Edição da imagem — Slide {imageModal.slideIndex + 1}</span>
                    <span className="text-neutral-400 text-xs hidden md:inline">
                      Arraste a imagem (vertical) • Arraste as alças azuladas para ajustar a altura do recorte
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={applyImageEditModal}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded"
                    >
                      Aplicar
                    </button>
                    <button
                      onClick={closeImageModal}
                      className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded"
                      title="Fechar (Esc)"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Ajuda */}
                <div className="px-4 py-2 text-neutral-400 text-xs border-b border-neutral-800">
                  <ul className="list-disc pl-4 space-y-1">
                    <li>O slide abaixo é mostrado em tamanho real (1080×1350).</li>
                    <li>A área clara é a parte que aparecerá no slide; o restante da imagem está com opacidade reduzida.</li>
                  </ul>
                </div>

                {/* === Corpo: SLIDE 1080×1350 em iframe === */}
                <ModalSlideEditor
                  html={renderedSlides[imageModal.slideIndex]}
                  state={imageModal}
                  onStateChange={setImageModal}
                />

                {/* Barra de resize do MODAL (altura) */}
                <ModalBottomResize onResize={(dy) => {
                  setImageModal({
                    ...imageModal,
                    modalHeightPx: Math.max(560, imageModal.modalHeightPx + dy),
                  });
                }}/>
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
                      <span className="text-neutral-300 text-xs">Background Image</span>
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

      {/* ============ Canvas (centro) ============ */}
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
            if (e.ctrlKey) {
              const delta = e.deltaY > 0 ? -0.05 : 0.05;
              setZoom(prev => Math.min(Math.max(0.1, prev + delta), 2));
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
                        <label className="text-neutral-400 text-xs mb-2 block font-medium">Background Images</label>
                        <button
                          onClick={() => openImageEditModal(selectedElement.slideIndex)}
                          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
                          title="Abrir popup de edição da imagem"
                        >
                          Editar imagem
                        </button>
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
                          return (
                            <div
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}
                            >
                              <div className="text-neutral-400 text-xs mb-1">Image 2</div>
                              <img src={bgUrl} alt="Background 2" className="w-full h-24 object-cover rounded" />
                            </div>
                          );
                        })()}

                        {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3 && (() => {
                          const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3!;
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);
                          return (
                            <div
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${currentBg === bgUrl ? 'border-blue-500' : 'border-neutral-800 hover:border-blue-400'}`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}
                            >
                              <div className="text-neutral-400 text-xs mb-1">Image 3</div>
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

                      <div className="mt-3 text-[11px] text-neutral-500">
                        Dica: clique em <span className="text-blue-400">Editar imagem</span> para ajustar enquadramento e altura do recorte.
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

/* ============= Componentes de apoio do MODAL ============= */

// Barra inferior para redimensionar a ALTURA do modal
const ModalBottomResize: React.FC<{ onResize: (dy: number) => void }> = ({ onResize }) => {
  const resizing = useRef(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (resizing.current) onResize(e.movementY); };
    const onUp = () => { resizing.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onResize]);
  return (
    <div
      className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize"
      onMouseDown={(e) => { e.preventDefault(); resizing.current = true; }}
    >
      <div className="mx-auto mt-1 w-14 h-1.5 rounded-full bg-neutral-700" />
    </div>
  );
};

/* ================= ModalSlideEditor =================
   Mostra o slide a 1080×1350 e cria OVERLAYS para edição:
   - Uma camada de imagem full (opacity .3) fora do container;
   - Uma camada recortada (dentro) com opacity 1.0;
   Ambas sincronizadas por drag vertical e resize de altura do recorte.
*/
const ModalSlideEditor: React.FC<{
  html: string;
  state: Extract<ImageModalState, { open: true }>;
  onStateChange: (s: ImageModalState) => void;
}> = ({ html, state, onStateChange }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const setup = () => {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      // Fixar body exatamente em 1080x1350 (sem scroll, sem escala)
      doc.body.style.margin = '0';
      doc.documentElement.style.margin = '0';
      doc.documentElement.style.overflow = 'hidden';
      doc.body.style.width = '1080px';
      doc.body.style.height = '1350px';
      doc.body.style.position = 'relative';

      // garantir alvo
      const target = doc.getElementById(state.targetId) as HTMLElement | null;
      if (!target) return;

      // Remover qualquer overlay antigo
      ['__overlayRoot','__imgFull','__clip','__clipImg','__handleTop','__handleBot'].forEach(id => {
        const node = doc.getElementById(id);
        if (node) node.remove();
      });

      // ROOT overlay cobrindo o slide todo (posição absoluta)
      const root = doc.createElement('div');
      root.id = '__overlayRoot';
      root.style.position = 'absolute';
      root.style.left = '0';
      root.style.top = '0';
      root.style.width = '1080px';
      root.style.height = '1350px';
      root.style.pointerEvents = 'none'; // eventos serão nas áreas específicas
      root.style.zIndex = '999';
      doc.body.appendChild(root);

      // CÁLCULOS
      const w = state.targetWidthPx;
      const imgH = w * (state.naturalH / state.naturalW);

      // clamp de top
      const minTop = Math.min(0, state.containerHeightPx - imgH);
      const curTop = Math.max(minTop, Math.min(0, state.imgOffsetTopPx));

      // Camada FULL (fora) — imagem com opacity .3 ocupando o slide
      const imgFull = doc.createElement('img');
      imgFull.id = '__imgFull';
      imgFull.src = state.imageUrl;
      imgFull.style.position = 'absolute';
      imgFull.style.left = `${state.containerLeftPx}px`;
      imgFull.style.top = `${state.containerTopPx + curTop}px`;
      imgFull.style.width = `${w}px`;
      imgFull.style.height = `${imgH}px`;
      imgFull.style.opacity = '0.3';
      imgFull.style.userSelect = 'none';
      imgFull.style.pointerEvents = 'none'; // não captura para deixar drag na máscara
      root.appendChild(imgFull);

      // Camada CLIP (dentro) — área visível (opacity 1.0)
      const clip = doc.createElement('div');
      clip.id = '__clip';
      clip.style.position = 'absolute';
      clip.style.left = `${state.containerLeftPx}px`;
      clip.style.top = `${state.containerTopPx}px`;
      clip.style.width = `${w}px`;
      clip.style.height = `${state.containerHeightPx}px`;
      clip.style.overflow = 'hidden';
      clip.style.boxShadow = '0 0 0 3px rgba(59,130,246,.9)';
      clip.style.borderRadius = getComputedStyle(target).borderRadius || '16px';
      clip.style.pointerEvents = 'auto';
      clip.style.cursor = 'grab';
      root.appendChild(clip);

      const clipImg = doc.createElement('img');
      clipImg.id = '__clipImg';
      clipImg.src = state.imageUrl;
      clipImg.style.position = 'absolute';
      clipImg.style.left = '0';
      clipImg.style.top = `${curTop}px`;
      clipImg.style.width = `${w}px`;
      clipImg.style.height = `${imgH}px`;
      clipImg.style.opacity = '1';
      clipImg.style.userSelect = 'none';
      clip.appendChild(clipImg);

      // HANDLES (resize da altura do container) — top e bottom
      const mkHandle = (id: string, pos: 'top'|'bottom') => {
        const h = doc.createElement('div');
        h.id = id;
        h.style.position = 'absolute';
        h.style.left = '50%';
        h.style.transform = 'translateX(-50%)';
        h.style.width = '96px';
        h.style.height = '8px';
        h.style.borderRadius = '999px';
        h.style.background = 'rgba(59,130,246,.95)';
        h.style.cursor = pos === 'top' ? 'n-resize' : 's-resize';
        h.style.zIndex = '1000';
        if (pos === 'top') h.style.top = '-6px'; else h.style.bottom = '-6px';
        h.style.boxShadow = '0 0 12px rgba(59,130,246,.6)';
        return h;
      };
      const handleTop = mkHandle('__handleTop','top');
      const handleBot = mkHandle('__handleBot','bottom');
      clip.appendChild(handleTop);
      clip.appendChild(handleBot);

      // Drag vertical da imagem (dentro do clip)
      let dragging = false;
      let lastY = 0;
      const onDown = (e: MouseEvent) => {
        if (e.target === handleTop || e.target === handleBot) return; // resize pega em outro handler
        dragging = true;
        lastY = e.clientY;
        clip.style.cursor = 'grabbing';
      };
      const onMove = (e: MouseEvent) => {
        if (!dragging) return;
        const dy = e.clientY - lastY;
        lastY = e.clientY;
        const cur = parseFloat(clipImg.style.top || '0');
        const next = Math.max(minTop, Math.min(0, cur + dy));
        clipImg.style.top = `${next}px`;
        imgFull.style.top = `${state.containerTopPx + next}px`;
        onStateChange({ ...state, imgOffsetTopPx: next });
      };
      const onUp = () => {
        dragging = false;
        clip.style.cursor = 'grab';
      };
      clip.addEventListener('mousedown', onDown);
      doc.addEventListener('mousemove', onMove);
      doc.addEventListener('mouseup', onUp);

      // Resize superior/inferior (altura do container)
      const startResize = (pos: 'top'|'bottom') => (e: MouseEvent) => {
        e.stopPropagation();
        let resizing = true;
        let lastY2 = e.clientY;

        const onMove2 = (ev: MouseEvent) => {
          if (!resizing) return;
          const dy = ev.clientY - lastY2;
          lastY2 = ev.clientY;

          let newH = state.containerHeightPx;
          if (pos === 'top') {
            newH = Math.max(60, state.containerHeightPx - dy);
            // ao mexer no topo, deslocamos a imagem ao contrário para manter o contexto
            const curTop2 = parseFloat(clipImg.style.top || '0');
            const newMinTop = Math.min(0, newH - imgH);
            const adjTop = Math.max(newMinTop, Math.min(0, curTop2 + dy));
            clipImg.style.top = `${adjTop}px`;
            imgFull.style.top = `${state.containerTopPx + adjTop}px`;
            onStateChange({ ...state, containerHeightPx: newH, imgOffsetTopPx: adjTop });
          } else {
            newH = Math.max(60, state.containerHeightPx + dy);
            const curTop2 = parseFloat(clipImg.style.top || '0');
            const newMinTop = Math.min(0, newH - imgH);
            const adjTop = Math.max(newMinTop, Math.min(0, curTop2));
            clipImg.style.top = `${adjTop}px`;
            imgFull.style.top = `${state.containerTopPx + adjTop}px`;
            onStateChange({ ...state, containerHeightPx: newH, imgOffsetTopPx: adjTop });
          }
          clip.style.height = `${newH}px`;
        };
        const onUp2 = () => {
          resizing = false;
          doc.removeEventListener('mousemove', onMove2);
          doc.removeEventListener('mouseup', onUp2);
        };
        doc.addEventListener('mousemove', onMove2);
        doc.addEventListener('mouseup', onUp2);
      };
      handleTop.addEventListener('mousedown', startResize('top'));
      handleBot.addEventListener('mousedown', startResize('bottom'));
    };

    const onLoad = () => setTimeout(setup, 40);
    iframe.addEventListener('load', onLoad);
    if (iframe.contentDocument?.readyState === 'complete') onLoad();

    return () => {
      iframe.removeEventListener('load', onLoad);
    };
  }, [html, state, onStateChange]);

  return (
    <div className="relative flex-1 overflow-auto px-4 py-3">
      <div className="mx-auto w-[1080px]">
        {/* Moldura do slide em tamanho real */}
        <div
          className="relative border border-neutral-800 rounded-lg overflow-hidden bg-white"
          style={{ width: 1080, height: 1350 }}
        >
          <iframe
            ref={iframeRef}
            className="w-[1080px] h-[1350px] border-0 bg-white block"
            sandbox="allow-same-origin allow-scripts"
            srcDoc={html}
            title="Slide Edit Preview"
          />
        </div>
      </div>
    </div>
  );
};

export default CarouselViewer;