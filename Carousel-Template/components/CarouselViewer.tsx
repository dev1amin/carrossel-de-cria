import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  X, ZoomIn, ZoomOut, Download, ChevronDown, ChevronRight,
  Layers, Image as ImageIcon, Type, Upload, Search, Play
} from 'lucide-react';
import { CarouselData, ElementType, ElementStyles } from '../types';
import { searchImages } from '../services';

const isVideoUrl = (url: string): boolean => {
  return url.toLowerCase().match(/\.(mp4|webm|ogg|mov)($|\?)/) !== null;
};

interface CarouselViewerProps {
  slides: string[];
  carouselData: CarouselData;
  onClose: () => void;
}

type ImageEditorModalState = {
  slideIndex: number;
  targetHint?: 'img' | 'bg';
} | null;

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
  const [previousSelection, setPreviousSelection] = useState<{ slideIndex: number; element: ElementType }>({ slideIndex: 0, element: null });
  const [cropMode, setCropMode] = useState<{ slideIndex: number; videoId: string } | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<Record<string, { width: number; height: number }>>({});

  const [imageEditorModal, setImageEditorModal] = useState<ImageEditorModalState>(null);
  const modalIframeRef = useRef<HTMLIFrameElement | null>(null);

  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({});

  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  const isImgurUrl = (url: string): boolean => url.includes('i.imgur.com');

  const findLargestVisual = (iframeDoc: Document): { type: 'img' | 'bg', el: HTMLElement } | null => {
    let best: { type: 'img' | 'bg', el: HTMLElement, area: number } | null = null;

    // imgs
    const imgs = Array.from(iframeDoc.querySelectorAll('img')) as HTMLImageElement[];
    imgs.forEach(img => {
      if (img.getAttribute('data-protected') === 'true' || isImgurUrl(img.src)) return;
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > 8000) {
        if (!best || area > best.area) best = { type: 'img', el: img, area };
      }
    });

    // bg-image
    const allEls = Array.from(iframeDoc.querySelectorAll<HTMLElement>('body, div, section, header, main, figure, article'));
    allEls.forEach(el => {
      const cs = iframeDoc.defaultView?.getComputedStyle(el);
      if (!cs) return;
      if (cs.backgroundImage && cs.backgroundImage.includes('url(')) {
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > 8000) {
          if (!best || area > best.area) best = { type: 'bg', el, area };
        }
      }
    });

    return best ? { type: best.type, el: best.el } : null;
  };

  // ====== Keydown / eventos globais ==========================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (imageEditorModal) {
          // fechar modal sem aplicar
          closeImageEditor(false);
          return;
        }
        if (cropMode) {
          setCropMode(null);
        } else if (selectedElement.element !== null) {
          setSelectedElement({ slideIndex: selectedElement.slideIndex, element: null });
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement, cropMode, onClose, imageEditorModal]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'enterCropMode') {
        setCropMode({ slideIndex: event.data.slideIndex, videoId: event.data.videoId });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // ====== Injeção de IDs editáveis (texto/bg) ===============================================
  const injectEditableIds = (html: string, slideIndex: number): string => {
    let result = html;
    const conteudo = carouselData.conteudos[slideIndex];

    const titleText = conteudo?.title || '';
    const subtitleText = conteudo?.subtitle || '';

    if (titleText) {
      const lines = titleText.split('\n').filter(line => line.trim());
      lines.forEach(line => {
        const escapedLine = line.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(>[^<]*)(${escapedLine})([^<]*<)`, 'gi');
        result = result.replace(regex, (match, before, text, after) => {
          return `${before}<span id="slide-${slideIndex}-title" data-editable="title" contenteditable="false">${text}</span>${after}`;
        });
      });
    }

    if (subtitleText) {
      const lines = subtitleText.split('\n').filter(line => line.trim());
      lines.forEach(line => {
        const escapedLine = line.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(>[^<]*)(${escapedLine})([^<]*<)`, 'gi');
        result = result.replace(regex, (match, before, text, after) => {
          return `${before}<span id="slide-${slideIndex}-subtitle" data-editable="subtitle" contenteditable="false">${text}</span>${after}`;
        });
      });
    }

    result = result.replace(
      /<style>/i,
      `<style>
        [data-editable]{cursor:pointer!important;position:relative;display:inline-block!important}
        [data-editable].selected{outline:3px solid #3B82F6!important;outline-offset:2px;z-index:1000}
        [data-editable][contenteditable="true"]{outline:3px solid #10B981!important;outline-offset:2px;background:rgba(16,185,129,.1)!important}
        img[data-editable]{display:block!important}
        img[data-editable].selected{outline:3px solid #3B82F6!important;outline-offset:2px}
        .cv-mask-wrapper{position:relative;display:inline-block}
        .cv-mask-overlay{position:absolute;inset:0;cursor:move;z-index:1003;background:transparent}
        .cv-handle{position:absolute;background:#3B82F6;border:2px solid #fff;z-index:1004}
        .cv-dim{position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:1002}
        .cv-dim-block{position:fixed;background:rgba(0,0,0,.55);pointer-events:none;z-index:1002}
      `
    );

    result = result.replace(
      /<body([^>]*)>/i,
      `<body$1 id="slide-${slideIndex}-background" data-editable="background">`
    );

    return result;
  };

  useEffect(() => {
    const newSlides = slides.map((slide, index) => injectEditableIds(slide, index));
    setRenderedSlides(newSlides);
  }, [slides]);

  useEffect(() => {
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = 0 * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
    setFocusedSlide(0);
  }, []);

  // ====== Aplicações no iframe principal (texto/bg) ==========================================
  useEffect(() => {
    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe || !iframe.contentWindow) return;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;

      // marca editáveis
      const markEditables = () => {
        const allImages = iframeDoc.querySelectorAll('img');
        let imgIdx = 0;
        allImages.forEach(img => {
          const imgElement = img as HTMLImageElement;
          if (isImgurUrl(imgElement.src) && !imgElement.getAttribute('data-protected')) {
            imgElement.setAttribute('data-protected', 'true');
          }
          if (imgElement.getAttribute('data-protected') !== 'true') {
            imgElement.setAttribute('data-editable', 'image');
            if (!imgElement.id) imgElement.id = `slide-${index}-img-${imgIdx++}`;
            (imgElement as HTMLElement).style.willChange = 'transform,left,top,width,height';
          }
        });

        const candidates = Array.from(
          iframeDoc.querySelectorAll<HTMLElement>('body, div, section, header, main, figure, article')
        );
        candidates.forEach(el => {
          const cs = iframeDoc.defaultView?.getComputedStyle(el);
          if (!cs) return;
          if (cs.backgroundImage && cs.backgroundImage.includes('url(')) {
            const r = el.getBoundingClientRect();
            if (r.width * r.height > 8000) {
              el.setAttribute('data-editable', 'image');
              if (!el.id) el.id = `slide-${index}-bg-${Math.random().toString(36).slice(2,7)}`;
              if (cs.position === 'static') el.style.position = 'relative';
            }
          }
        });
      };

      markEditables();

      const updateElement = (elementId: string, styles?: ElementStyles, content?: string) => {
        const element = iframeDoc.getElementById(elementId);
        if (!element) return;
        if (styles) {
          if (styles.fontSize) element.style.setProperty('font-size', styles.fontSize, 'important');
          if (styles.fontWeight) element.style.setProperty('font-weight', styles.fontWeight, 'important');
          if (styles.textAlign) element.style.setProperty('text-align', styles.textAlign, 'important');
          if (styles.color) element.style.setProperty('color', styles.color, 'important');
        }
        if (content !== undefined) {
          if (element.getAttribute('contenteditable') !== 'true') element.textContent = content;
        }
      };

      const extractOriginalStyles = (element: HTMLElement): ElementStyles => {
        const computedStyle = iframeDoc.defaultView?.getComputedStyle(element);
        if (!computedStyle) return { fontSize: '16px', fontWeight: '400', textAlign: 'left', color: '#FFFFFF' };
        const rgbToHex = (rgb: string): string => {
          const result = rgb.match(/\d+/g); if (!result || result.length < 3) return rgb;
          const r = parseInt(result[0]).toString(16).padStart(2, '0');
          const g = parseInt(result[1]).toString(16).padStart(2, '0');
          const b = parseInt(result[2]).toString(16).padStart(2, '0');
          return `#${r}${g}${b}`.toUpperCase();
        };
        const color = computedStyle.color || '#FFFFFF';
        const hexColor = color.startsWith('rgb') ? rgbToHex(color) : color;
        return { fontSize: computedStyle.fontSize || '16px', fontWeight: computedStyle.fontWeight || '400', textAlign: (computedStyle.textAlign as any) || 'left', color: hexColor };
      };

      const titleKey = `${index}-title`;
      const subtitleKey = `${index}-subtitle`;

      const titleStyles = elementStyles[titleKey];
      const subtitleStyles = elementStyles[subtitleKey];
      const titleContent = editedContent[`${index}-title`];
      const subtitleContent = editedContent[`${index}-subtitle`];

      if (titleStyles || titleContent !== undefined) updateElement(`slide-${index}-title`, titleStyles, titleContent);
      if (subtitleStyles || subtitleContent !== undefined) updateElement(`slide-${index}-subtitle`, subtitleStyles, subtitleContent);

      const bgImage = editedContent[`${index}-background`];
      if (bgImage) {
        const best = findLargestVisual(iframeDoc);
        if (best) {
          if (best.type === 'img') {
            const img = best.el as HTMLImageElement;
            img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.loading = 'eager';
            img.src = bgImage; img.setAttribute('data-bg-image-url', bgImage);
          } else {
            best.el.style.setProperty('background-image', `url('${bgImage}')`, 'important');
          }
        } else {
          iframeDoc.body.style.setProperty('background-image', `url('${bgImage}')`, 'important');
        }
      }

      setTimeout(() => {
        const titleElement = iframeDoc.getElementById(`slide-${index}-title`);
        if (titleElement && !originalStyles[`${index}-title`]) {
          const styles = extractOriginalStyles(titleElement as HTMLElement);
          setOriginalStyles(prev => ({ ...prev, [`${index}-title`]: styles }));
        }
        const subtitleElement = iframeDoc.getElementById(`slide-${index}-subtitle`);
        if (subtitleElement && !originalStyles[`${index}-subtitle`]) {
          const styles = extractOriginalStyles(subtitleElement as HTMLElement);
          setOriginalStyles(prev => ({ ...prev, [`${index}-subtitle`]: styles }));
        }
      }, 80);
    });
  }, [elementStyles, editedContent, originalStyles]);

  // ====== UI helpers =========================================================================
  const toggleLayer = (index: number) => {
    const newExpanded = new Set(expandedLayers);
    if (newExpanded.has(index)) newExpanded.delete(index);
    else newExpanded.add(index);
    setExpandedLayers(newExpanded);
  };

  const handleSlideClick = (index: number) => {
    setFocusedSlide(index);
    setSelectedElement({ slideIndex: index, element: null });
    selectedImageRefs.current[index] = null;

    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = index * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
  };

  const handleElementClick = (slideIndex: number, element: ElementType) => {
    setIsLoadingProperties(true);
    setPreviousSelection(selectedElement);
    setSelectedElement({ slideIndex, element });
    setFocusedSlide(slideIndex);
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setTimeout(() => setIsLoadingProperties(false), 100);
  };

  const getEditedValue = (slideIndex: number, field: string, defaultValue: any) => {
    const key = `${slideIndex}-${field}`;
    return editedContent[key] !== undefined ? editedContent[key] : defaultValue;
  };

  const updateEditedValue = (slideIndex: number, field: string, value: any) => {
    const key = `${slideIndex}-${field}`;
    setEditedContent(prev => ({ ...prev, [key]: value }));
  };

  const getElementStyle = (slideIndex: number, element: ElementType): ElementStyles => {
    const key = `${slideIndex}-${element}`;
    if (elementStyles[key]) return elementStyles[key];
    if (originalStyles[key]) return originalStyles[key];
    return { fontSize: element === 'title' ? '24px' : '16px', fontWeight: element === 'title' ? '700' : '400', textAlign: 'left', color: '#FFFFFF' };
  };

  const updateElementStyle = (slideIndex: number, element: ElementType, property: keyof ElementStyles, value: string) => {
    const key = `${slideIndex}-${element}`;
    setElementStyles(prev => ({ ...prev, [key]: { ...getElementStyle(slideIndex, element), [property]: value } }));
  };

  const getElementIcon = (element: string) => {
    if (element.includes('title') || element.includes('subtitle')) return <Type className="w-4 h-4 text-neutral-500" />;
    return <ImageIcon className="w-4 h-4 text-neutral-500" />;
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

  // ====== Troca de background + abrir modal ==================================================
  const applyBackgroundImageImmediate = (slideIndex: number, imageUrl: string): HTMLElement | null => {
    const iframe = iframeRefs.current[slideIndex];
    if (!iframe || !iframe.contentWindow) return null;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    if (!iframeDoc) return null;

    const targetImg = selectedImageRefs.current[slideIndex];
    if (targetImg && targetImg.getAttribute('data-protected') !== 'true') {
      targetImg.removeAttribute('srcset'); targetImg.removeAttribute('sizes'); targetImg.loading = 'eager';
      targetImg.src = imageUrl;
      targetImg.setAttribute('data-bg-image-url', imageUrl);
      return targetImg;
    }

    const best = findLargestVisual(iframeDoc);
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

    iframeDoc.body.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
    return iframeDoc.body;
  };

  const handleBackgroundImageChange = (slideIndex: number, imageUrl: string) => {
    const updatedEl = applyBackgroundImageImmediate(slideIndex, imageUrl);
    setSelectedElement({ slideIndex, element: 'background' });
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setFocusedSlide(slideIndex);
    updateEditedValue(slideIndex, 'background', imageUrl);

    if (updatedEl) {
      const isImg = updatedEl.tagName === 'IMG';
      openImageEditor(slideIndex, isImg ? 'img' : 'bg');
    }
  };

  const handleSearchImages = async () => {
    if (!searchKeyword.trim()) return;
    setIsSearching(true);
    try {
      const imageUrls = await searchImages(searchKeyword);
      setSearchResults(imageUrls);
    } catch (error) {
      console.error('Error searching images:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleImageUpload = (slideIndex: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;
      setUploadedImages(prev => ({ ...prev, [slideIndex]: imageUrl }));
      handleBackgroundImageChange(slideIndex, imageUrl);
    };
    reader.readAsDataURL(file);
  };

  // ====== MODAL (Portal) =====================================================================
  const openImageEditor = (slideIndex: number, targetHint?: 'img' | 'bg') => {
    setImageEditorModal({ slideIndex, targetHint });
  };

  const clampDragWithin = (wrapper: HTMLElement, img: HTMLImageElement) => {
    const wW = wrapper.clientWidth;
    const wH = wrapper.clientHeight;
    const iW = img.offsetWidth;
    const iH = img.offsetHeight;
    let left = parseFloat(img.style.left || '0'); left = 0;
    let top = parseFloat(img.style.top || '0');
    const minTop = Math.min(0, wH - iH);
    const maxTop = 0;
    if (top < minTop) top = minTop;
    if (top > maxTop) top = maxTop;
    img.style.left = `${left}px`;
    img.style.top = `${top}px`;
  };

  const refreshDimmer = (doc: Document, wrapper: HTMLElement) => {
    const ensure = (cls: string) => {
      let el = doc.querySelector(`.${cls}`) as HTMLDivElement | null;
      if (!el) {
        el = doc.createElement('div'); el.className = cls; doc.body.appendChild(el);
      }
      return el;
    };
    ensure('cv-dim');
    const topB = ensure('cv-dim-top'); topB.classList.add('cv-dim-block');
    const rightB = ensure('cv-dim-right'); rightB.classList.add('cv-dim-block');
    const bottomB = ensure('cv-dim-bottom'); bottomB.classList.add('cv-dim-block');
    const leftB = ensure('cv-dim-left'); leftB.classList.add('cv-dim-block');

    const rect = wrapper.getBoundingClientRect();
    const vw = doc.defaultView?.innerWidth || 0;
    const vh = doc.defaultView?.innerHeight || 0;

    topB.style.left = '0px'; topB.style.top = '0px';
    topB.style.width = `${vw}px`; topB.style.height = `${Math.max(0, rect.top)}px`;

    bottomB.style.left = '0px'; bottomB.style.top = `${Math.max(0, rect.bottom)}px`;
    bottomB.style.width = `${vw}px`; bottomB.style.height = `${Math.max(0, vh - rect.bottom)}px`;

    leftB.style.left = '0px'; leftB.style.top = `${Math.max(0, rect.top)}px`;
    leftB.style.width = `${Math.max(0, rect.left)}px`; leftB.style.height = `${Math.max(0, rect.height)}px`;

    rightB.style.left = `${Math.max(0, rect.right)}px`; rightB.style.top = `${Math.max(0, rect.top)}px`;
    rightB.style.width = `${Math.max(0, vw - rect.right)}px`; rightB.style.height = `${Math.max(0, rect.height)}px`;
  };

  const setupModalIframe = (slideIndex: number) => {
    const iframe = modalIframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    const origIframe = iframeRefs.current[slideIndex];
    const origDoc = origIframe?.contentDocument || origIframe?.contentWindow?.document || null;

    let target: { type: 'img' | 'bg', el: HTMLElement } | null = null;

    if (origDoc) {
      const selectedOrig = origDoc.querySelector('[data-editable].selected') as HTMLElement | null;
      if (selectedOrig && selectedOrig.id) {
        const same = doc.getElementById(selectedOrig.id);
        if (same) {
          const type: 'img' | 'bg' = same.tagName === 'IMG' ? 'img' : 'bg';
          target = { type, el: same as HTMLElement };
        }
      }
    }
    if (!target) {
      const best = findLargestVisual(doc);
      if (best) target = best;
    }
    if (!target) return;

    // wrapper & img
    let wrapper: HTMLElement;
    let imgEl: HTMLImageElement | null = null;

    if (target.type === 'bg') {
      const el = target.el as HTMLElement;
      const cs = doc.defaultView?.getComputedStyle(el);
      let bg = cs?.backgroundImage || '';
      const m = bg.match(/url\(["']?(.+?)["']?\)/i);
      const bgUrl = m?.[1] || '';

      let existingImg = el.querySelector('img') as HTMLImageElement | null;
      if (!existingImg) {
        existingImg = doc.createElement('img');
        existingImg.src = bgUrl;
        existingImg.alt = 'bg-edit';
        existingImg.style.position = 'absolute';
        existingImg.style.left = '0px';
        existingImg.style.top = '0px';
        existingImg.style.maxWidth = 'unset';
        existingImg.style.maxHeight = 'unset';
        existingImg.style.userSelect = 'none';
        el.style.backgroundImage = 'none';
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.appendChild(existingImg);
      }
      wrapper = el;
      imgEl = existingImg;
    } else {
      const el = target.el as HTMLImageElement;
      if (!el.parentElement || !el.parentElement.classList.contains('cv-mask-wrapper')) {
        const w = doc.createElement('div');
        w.className = 'cv-mask-wrapper';
        const rect = el.getBoundingClientRect();
        w.style.width = `${rect.width || el.width}px`;
        w.style.height = `${rect.height || el.height}px`;
        w.style.borderRadius = getComputedStyle(el).borderRadius;
        w.style.display = 'inline-block';
        w.style.position = 'relative';
        w.style.overflow = 'hidden';
        el.style.position = 'absolute';
        el.style.maxWidth = 'unset';
        el.style.maxHeight = 'unset';
        el.style.userSelect = 'none';
        if (!el.style.left) el.style.left = '0px';
        if (!el.style.top) el.style.top = '0px';
        if (el.parentNode) el.parentNode.replaceChild(w, el);
        w.appendChild(el);
        wrapper = w;
      } else {
        wrapper = el.parentElement as HTMLElement;
        wrapper.style.overflow = 'hidden';
      }
      imgEl = wrapper.querySelector('img') as HTMLImageElement;
    }

    const fitImageToWrapperWidth = () => {
      if (!imgEl) return;
      const nW = imgEl.naturalWidth || imgEl.width;
      const nH = imgEl.naturalHeight || imgEl.height;
      const ratio = nH / nW;
      const wW = wrapper.clientWidth;
      const expectedH = wW * ratio;
      imgEl.style.width = `${wW}px`;
      imgEl.style.height = `${expectedH}px`;
      if (!imgEl.style.top) imgEl.style.top = `${(wrapper.clientHeight - expectedH) / 2}px`;
      imgEl.style.left = '0px';
      clampDragWithin(wrapper, imgEl);
      refreshDimmer(doc, wrapper);
    };
    if (imgEl?.complete) fitImageToWrapperWidth();
    else imgEl?.addEventListener('load', fitImageToWrapperWidth, { once: true });

    const overlay = doc.createElement('div');
    overlay.className = 'cv-mask-overlay';
    wrapper.appendChild(overlay);

    const start = { x: 0, y: 0, imgLeft: 0, imgTop: 0 };
    const onOverlayDown = (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (!imgEl) return;
      start.x = e.clientX; start.y = e.clientY;
      start.imgLeft = parseFloat(imgEl.style.left || '0');
      start.imgTop = parseFloat(imgEl.style.top || '0');

      const onMove = (e: MouseEvent) => {
        if (!imgEl) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        imgEl.style.left = `${start.imgLeft + dx}px`;
        imgEl.style.top = `${start.imgTop + dy}px`;
        clampDragWithin(wrapper, imgEl);
        refreshDimmer(doc, wrapper);
      };

      const onUp = () => {
        doc.removeEventListener('mousemove', onMove);
        doc.removeEventListener('mouseup', onUp);
      };

      doc.addEventListener('mousemove', onMove);
      doc.addEventListener('mouseup', onUp);
    };
    overlay.addEventListener('mousedown', onOverlayDown);

    // handles (altura/cantos)
    const handles = ['n','s','nw','ne','sw','se'] as const;
    const makeHandle = (pos: typeof handles[number]) => {
      const h = doc.createElement('div');
      h.className = `cv-handle cv-h-${pos}`;
      if (['nw','ne','sw','se'].includes(pos)) {
        h.style.width='12px'; h.style.height='12px'; h.style.borderRadius='50%'; h.style.cursor=`${pos}-resize`;
      } else {
        h.style.width='40px'; h.style.height='8px'; h.style.borderRadius='4px'; h.style.cursor=`${pos}-resize`;
        h.style.left='50%'; h.style.transform='translateX(-50%)';
      }
      if (pos==='n'){h.style.top='-6px';}
      if (pos==='s'){h.style.bottom='-6px';}
      if (pos==='nw'){h.style.top='-6px'; h.style.left='-6px';}
      if (pos==='ne'){h.style.top='-6px'; h.style.right='-6px';}
      if (pos==='sw'){h.style.bottom='-6px'; h.style.left='-6px';}
      if (pos==='se'){h.style.bottom='-6px'; h.style.right='-6px';}

      let isResizing = false;
      let startY = 0, startX = 0, startH = 0, startW = 0;

      const onDown = (e: MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        isResizing = true;
        startY = e.clientY; startX = e.clientX;
        startH = wrapper.offsetHeight; startW = wrapper.offsetWidth;

        const onMove = (e: MouseEvent) => {
          if (!isResizing) return;
          const dy = e.clientY - startY;
          const dx = e.clientX - startX;
          let newH = startH;
          let newW = startW;
          if (pos.includes('s')) newH = startH + dy;
          if (pos.includes('n')) newH = startH - dy;
          if (pos.includes('e')) newW = startW + dx;
          if (pos.includes('w')) newW = startW - dx;

          // Por padrão só altura (remova o comentário para liberar largura)
          if (newH > 40) wrapper.style.height = `${newH}px`;
          // if (newW > 80) wrapper.style.width = `${newW}px`;

          if (imgEl) {
            const nW = imgEl.naturalWidth || imgEl.width;
            const nH = imgEl.naturalHeight || imgEl.height;
            const ratio = nH / nW;
            const wW = wrapper.clientWidth;
            imgEl.style.width = `${wW}px`;
            imgEl.style.height = `${wW * ratio}px`;
            clampDragWithin(wrapper, imgEl);
          }
          refreshDimmer(doc, wrapper);
        };

        const onUp = () => {
          isResizing = false;
          doc.removeEventListener('mousemove', onMove);
          doc.removeEventListener('mouseup', onUp);
        };

        doc.addEventListener('mousemove', onMove);
        doc.addEventListener('mouseup', onUp);
      };

      h.addEventListener('mousedown', onDown);
      wrapper.appendChild(h);
    };
    handles.forEach(makeHandle);

    if (!target.el.id) target.el.id = `cv-target-${Date.now()}`;
    (doc.body as any).__cvTargetSelector = `#${target.el.id}`;
    (doc.body as any).__cvTargetType = target.type;

    const onWinResize = () => {
      fitImageToWrapperWidth();
      refreshDimmer(doc, wrapper);
    };
    doc.defaultView?.addEventListener('resize', onWinResize);
  };

  const applyToPreview = (
    slideIndex: number,
    final: {
      type: 'img' | 'bg';
      targetSelector: string;
      wrapperHeight: number;
      imgHeight: number;
      imgTop: number;
    }
  ) => {
    const iframe = iframeRefs.current[slideIndex];
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    const orig = doc.querySelector(final.targetSelector) as HTMLElement | null;
    if (!orig) return;

    let wrapper: HTMLElement;
    let imgEl: HTMLImageElement | null = null;

    if (final.type === 'bg') {
      const cs = doc.defaultView?.getComputedStyle(orig);
      let bg = cs?.backgroundImage || '';
      const m = bg.match(/url\(["']?(.+?)["']?\)/i);
      const bgUrl = m?.[1] || '';

      let existingImg = orig.querySelector('img') as HTMLImageElement | null;
      if (!existingImg) {
        existingImg = doc.createElement('img');
        existingImg.src = bgUrl;
        existingImg.alt = 'bg-final';
        existingImg.style.position = 'absolute';
        existingImg.style.userSelect = 'none';
        if (getComputedStyle(orig).position === 'static') (orig as HTMLElement).style.position = 'relative';
        orig.style.backgroundImage = 'none';
        orig.appendChild(existingImg);
      }
      wrapper = orig;
      imgEl = existingImg;

      wrapper.style.overflow = 'hidden';
      wrapper.style.height = `${final.wrapperHeight}px`;
      imgEl.style.width = `${wrapper.clientWidth}px`;
      imgEl.style.height = `${final.imgHeight}px`;
      imgEl.style.left = `0px`;
      imgEl.style.top = `${final.imgTop}px`;
    } else {
      const el = orig.tagName === 'IMG' ? (orig as HTMLImageElement) : (orig.querySelector('img') as HTMLImageElement);
      if (!el) return;

      if (!el.parentElement || !el.parentElement.classList.contains('cv-mask-wrapper')) {
        const w = doc.createElement('div');
        w.className = 'cv-mask-wrapper';
        const rect = el.getBoundingClientRect();
        w.style.width = `${rect.width || el.width}px`;
        w.style.height = `${rect.height || el.height}px`;
        w.style.borderRadius = getComputedStyle(el).borderRadius;
        w.style.display = 'inline-block';
        w.style.position = 'relative';
        w.style.overflow = 'hidden';

        el.style.position = 'absolute';
        el.style.maxWidth = 'unset';
        el.style.maxHeight = 'unset';
        el.style.userSelect = 'none';

        if (el.parentNode) el.parentNode.replaceChild(w, el);
        w.appendChild(el);
        wrapper = w;
        imgEl = el;
      } else {
        wrapper = el.parentElement as HTMLElement;
        imgEl = el;
        wrapper.style.overflow = 'hidden';
      }

      wrapper.style.height = `${final.wrapperHeight}px`;
      imgEl.style.width = `${wrapper.clientWidth}px`;
      imgEl.style.height = `${final.imgHeight}px`;
      imgEl.style.left = `0px`;
      imgEl.style.top = `${final.imgTop}px`;
    }
  };

  const closeImageEditor = (apply: boolean) => {
    const iframe = modalIframeRef.current;
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;

    if (apply && doc) {
      const selector: string = (doc.body as any).__cvTargetSelector;
      const type: 'img' | 'bg' = (doc.body as any).__cvTargetType || 'img';
      const target = selector ? (doc.querySelector(selector) as HTMLElement | null) : null;

      if (target) {
        let wrapper: HTMLElement | null = null;
        let img: HTMLImageElement | null = null;

        if (type === 'bg') {
          wrapper = target;
          img = wrapper.querySelector('img');
        } else {
          if (target.tagName === 'IMG') {
            const el = target as HTMLImageElement;
            wrapper = el.parentElement && el.parentElement.classList.contains('cv-mask-wrapper')
              ? (el.parentElement as HTMLElement)
              : null;
            img = el;
          } else {
            wrapper = target;
            img = wrapper.querySelector('img');
          }
        }

        if (wrapper && img && imageEditorModal) {
          const finalState = {
            type,
            targetSelector: selector,
            wrapperHeight: wrapper.clientHeight,
            imgHeight: img.offsetHeight,
            imgTop: parseFloat(img.style.top || '0'),
          };
          applyToPreview(imageEditorModal.slideIndex, finalState);
        }
      }
    }

    // fecha modal
    setImageEditorModal(null);
  };

  // ====== Interações no preview principal (seleção + abrir modal ao clicar na imagem) ========
  useEffect(() => {
    const setupIframeInteraction = (iframe: HTMLIFrameElement, slideIndex: number) => {
      if (!iframe.contentWindow) return;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;

      const editableElements = iframeDoc.querySelectorAll('[data-editable]');
      editableElements.forEach((element) => {
        const editableType = element.getAttribute('data-editable');
        const htmlElement = element as HTMLElement;

        htmlElement.style.pointerEvents = 'auto';
        htmlElement.style.cursor = 'pointer';

        htmlElement.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (htmlElement.getAttribute('contenteditable') === 'true') return;

          iframeRefs.current.forEach((f) => {
            if (!f || !f.contentWindow) return;
            const d = f.contentDocument || f.contentWindow.document;
            if (!d) return;
            d.querySelectorAll('[data-editable]').forEach(el => el.classList.remove('selected'));
          });

          element.classList.add('selected');

          if (editableType === 'image') {
            const isImg = htmlElement.tagName === 'IMG';
            if (isImg) selectedImageRefs.current[slideIndex] = htmlElement as HTMLImageElement;
            else selectedImageRefs.current[slideIndex] = null;

            handleElementClick(slideIndex, 'background');
            openImageEditor(slideIndex, isImg ? 'img' : 'bg');
          } else {
            selectedImageRefs.current[slideIndex] = null;
            handleElementClick(slideIndex, editableType as ElementType);
          }
        };

        if (editableType === 'title' || editableType === 'subtitle') {
          htmlElement.ondblclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            htmlElement.setAttribute('contenteditable', 'true');
            htmlElement.focus();
            setIsEditingInline({ slideIndex, element: editableType as ElementType });

            const range = iframeDoc.createRange();
            range.selectNodeContents(htmlElement);
            const selection = iframe.contentWindow?.getSelection();
            if (selection) { selection.removeAllRanges(); selection.addRange(range); }
          };

          htmlElement.onblur = () => {
            if (htmlElement.getAttribute('contenteditable') === 'true') {
              htmlElement.setAttribute('contenteditable', 'false');
              const newContent = htmlElement.textContent || '';
              updateEditedValue(slideIndex, editableType, newContent);
              setIsEditingInline(null);
            }
          };

          htmlElement.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); htmlElement.blur(); }
            if (e.key === 'Escape') { e.preventDefault(); htmlElement.blur(); }
          };
        }
      });
    };

    const timer = setTimeout(() => {
      iframeRefs.current.forEach((iframe, index) => {
        if (iframe) {
          iframe.onload = () => { setTimeout(() => setupIframeInteraction(iframe, index), 80); };
          if (iframe.contentDocument?.readyState === 'complete') setupIframeInteraction(iframe, index);
        }
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [renderedSlides]);

  // ====== UI principal =========================================================================
  return (
    <div className="fixed top-14 left-16 right-0 bottom-0 z-[90] bg-neutral-900 flex">
      {/* MODAL via PORTAL */}
      {imageEditorModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-[9999]">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70" />

            {/* Janela */}
            <div className="relative z-[10000] w-[90vw] h-[90vh] max-w-[1100px] mx-auto my-[5vh] flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="text-white text-sm">
                  Edição da imagem — Slide {imageEditorModal.slideIndex + 1}
                </div>
                <div className="space-x-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); closeImageEditor(false); }}
                    className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-white text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); closeImageEditor(true); }}
                    className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
                  >
                    Done
                  </button>
                </div>
              </div>

              <div className="relative flex-1 bg-neutral-800 rounded-lg overflow-hidden ring-2 ring-blue-500/40">
                <iframe
                  ref={modalIframeRef}
                  // renderiza apenas o slide selecionado
                  srcDoc={renderedSlides[imageEditorModal.slideIndex]}
                  className="w-full h-full border-0"
                  title={`Editor Slide ${imageEditorModal.slideIndex + 1}`}
                  sandbox="allow-same-origin allow-scripts"
                  onLoad={() => setupModalIframe(imageEditorModal.slideIndex)}
                />
                <div className="absolute bottom-2 left-2 text-neutral-300 text-xs bg-black/40 rounded px-2 py-1">
                  Arraste a imagem para ajustar • Arraste as bordas/cantos para mudar a altura do recorte • ESC para sair
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* Sidebar esquerda */}
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
                      className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${selectedElement.slideIndex === index && selectedElement.element === 'background' ? 'bg-neutral-800' : ''}`}
                    >
                      {getElementIcon('background')}
                      <span className="text-neutral-300 text-xs">Background Image</span>
                    </button>

                    <button
                      onClick={() => handleElementClick(index, 'title')}
                      className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${selectedElement.slideIndex === index && selectedElement.element === 'title' ? 'bg-neutral-800' : ''}`}
                    >
                      {getElementIcon('title')}
                      <span className="text-neutral-300 text-xs">Title</span>
                    </button>

                    {conteudo.subtitle && (
                      <button
                        onClick={() => handleElementClick(index, 'subtitle')}
                        className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${selectedElement.slideIndex === index && selectedElement.element === 'subtitle' ? 'bg-neutral-800' : ''}`}
                      >
                        {getElementIcon('subtitle')}
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

      {/* Centro */}
      <div className="flex-1 flex flex-col">
        <div className="h-14 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-white font-semibold">Carousel Editor</h2>
            <div className="text-neutral-500 text-sm">{slides.length} slides</div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setZoom((p) => Math.max(p - 0.1, 0.1))}
              className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="bg-neutral-800 text-white px-3 py-1.5 rounded text-xs min-w-[70px] text-center">{Math.round(zoom * 100)}%</div>
            <button
              onClick={() => setZoom((p) => Math.min(p + 0.1, 2))}
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

        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative bg-neutral-800"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onWheel={(e) => {
            e.preventDefault();
            if (e.ctrlKey) {
              const delta = e.deltaY > 0 ? -0.05 : 0.05;
              setZoom((prev) => Math.min(Math.max(0.1, prev + delta), 2));
            } else {
              if (imageEditorModal) return; // não arrastar canvas durante o modal
              setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
            }
          }}
          onMouseDown={(e) => {
            if (imageEditorModal) return;
            if (e.button === 0 && e.currentTarget === e.target) {
              setIsDragging(true);
              setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            }
          }}
          onMouseMove={(e) => {
            if (imageEditorModal) return;
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
            }}
          >
            <div className="flex items-start" style={{ gap: `${gap}px` }}>
              {renderedSlides.map((slide, index) => (
                <div
                  key={index}
                  className={`relative bg-white rounded-lg shadow-2xl overflow-hidden flex-shrink-0 transition-all ${focusedSlide === index ? 'ring-4 ring-blue-500' : ''}`}
                  style={{ width: `${slideWidth}px`, height: `${slideHeight}px` }}
                >
                  <iframe
                    ref={(el) => (iframeRefs.current[index] = el)}
                    srcDoc={slide}
                    className="w-full h-full border-0"
                    title={`Slide ${index + 1}`}
                    sandbox="allow-same-origin allow-scripts"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-neutral-950/90 backdrop-blur-sm text-neutral-400 px-3 py-1.5 rounded text-xs">
            Zoom: {Math.round(zoom * 100)}%
          </div>
        </div>
      </div>

      {/* Sidebar direita - Properties */}
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
                      value={getEditedValue(
                        selectedElement.slideIndex,
                        selectedElement.element,
                        carouselData.conteudos[selectedElement.slideIndex]?.[selectedElement.element] || ''
                      )}
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
                          onClick={(e) => { e.stopPropagation(); openImageEditor(selectedElement.slideIndex); }}
                          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
                        >
                          Editar esta imagem
                        </button>
                      </div>

                      <div className="space-y-2">
                        {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo && (() => {
                          const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo;
                          const isVid = isVideoUrl(bgUrl);
                          const thumbnailUrl = carouselData.conteudos[selectedElement.slideIndex]?.thumbnail_url;
                          const displayUrl = isVid && thumbnailUrl ? thumbnailUrl : bgUrl;
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
                        <label className="flex items-center justify-center w-full h-24 bg-neutral-900 border-2 border-dashed border-neutral-800 rounded cursor-pointer hover:border-blue-500 transition-colors">
                          <div className="flex flex-col items-center">
                            <Upload className="w-6 h-6 text-neutral-500 mb-1" />
                            <span className="text-neutral-500 text-xs">Click to upload</span>
                          </div>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(selectedElement.slideIndex, e)} />
                        </label>
                      </div>

                      <div className="mt-3">
                        <label className="text-neutral-400 text-xs mb-2 block font-medium">Image Size</label>
                        <select className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors">
                          <option>Cover</option>
                          <option>Contain</option>
                          <option>Auto</option>
                          <option>Stretch</option>
                        </select>
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