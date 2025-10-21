import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, ZoomOut, Download, ChevronDown, ChevronRight, Layers, Image as ImageIcon, Type, Upload, Search, Play } from 'lucide-react';
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

type ImageEditState = { slideIndex: number; type: 'img' | 'bg'; targetId: string } | null;

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
  const [imageEdit, setImageEdit] = useState<ImageEditState>(null);

  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({});

  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  // ===== ESC / mensagens
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (cropMode) {
          setCropMode(null);
        } else if (imageEdit) {
          cleanupImageEdit(imageEdit.slideIndex);
          setImageEdit(null);
        } else if (selectedElement.element !== null) {
          setSelectedElement({ slideIndex: selectedElement.slideIndex, element: null });
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement, cropMode, onClose, imageEdit]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'enterCropMode') {
        setCropMode({ slideIndex: event.data.slideIndex, videoId: event.data.videoId });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // ========= Video crop (já existente)
  useEffect(() => {
    if (!cropMode) return;

    const iframe = iframeRefs.current[cropMode.slideIndex];
    if (!iframe || !iframe.contentWindow) return;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    if (!iframeDoc) return;

    let container = iframeDoc.querySelector(`[data-video-id="${cropMode.videoId}"]`) as HTMLElement;
    let video = container?.querySelector('video') as HTMLVideoElement;

    if (!container) {
      video = iframeDoc.getElementById(cropMode.videoId) as HTMLVideoElement;
      if (video) container = video.parentElement as HTMLElement;
    }
    if (!container || !video) return;

    const currentWidth = videoDimensions[cropMode.videoId]?.width || video.offsetWidth;
    const currentHeight = videoDimensions[cropMode.videoId]?.height || video.offsetHeight;

    container.style.width = `${currentWidth}px`;
    container.style.height = `${currentHeight}px`;
    container.style.border = '3px solid #3B82F6';
    container.style.boxShadow = '0 0 20px rgba(59,130,246,.5)';

    const handles = ['nw','ne','sw','se','n','s','e','w'] as const;
    const handleElements: HTMLElement[] = [];

    const addHandle = (position: typeof handles[number]) => {
      const handle = iframeDoc.createElement('div');
      handle.className = `resize-handle resize-handle-${position}`;
      handle.style.cssText = `position:absolute;background:#3B82F6;border:2px solid #fff;z-index:1000;`;
      if (['nw','ne','sw','se'].includes(position)) { handle.style.width='12px';handle.style.height='12px';handle.style.borderRadius='50%';handle.style.cursor=`${position}-resize`; }
      else if (['n','s'].includes(position)) { handle.style.width='40px';handle.style.height='8px';handle.style.borderRadius='4px';handle.style.cursor=`${position}-resize`;handle.style.left='50%';handle.style.transform='translateX(-50%)'; }
      else { handle.style.width='8px';handle.style.height='40px';handle.style.borderRadius='4px';handle.style.cursor=`${position}-resize`;handle.style.top='50%';handle.style.transform='translateY(-50%)'; }
      if (position==='nw'){handle.style.top='-6px';handle.style.left='-6px';}
      if (position==='ne'){handle.style.top='-6px';handle.style.right='-6px';}
      if (position==='sw'){handle.style.bottom='-6px';handle.style.left='-6px';}
      if (position==='se'){handle.style.bottom='-6px';handle.style.right='-6px';}
      if (position==='n'){handle.style.top='-4px';}
      if (position==='s'){handle.style.bottom='-4px';}
      if (position==='e'){handle.style.right='-4px';}
      if (position==='w'){handle.style.left='-4px';}

      let isResizing = false;
      let startX = 0, startY = 0, startWidth = 0, startHeight = 0;

      const onMouseDown = (e: MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        isResizing = true;
        startX = e.clientX; startY = e.clientY;
        startWidth = container.offsetWidth; startHeight = container.offsetHeight;

        const onMouseMove = (e: MouseEvent) => {
          if (!isResizing) return;
          const deltaX = (e.clientX - startX) / zoom;
          const deltaY = (e.clientY - startY) / zoom;
          let newWidth = startWidth;
          let newHeight = startHeight;

          if (position.includes('e')) newWidth = startWidth + deltaX;
          if (position.includes('w')) newWidth = startWidth - deltaX;
          if (position.includes('s')) newHeight = startHeight + deltaY;
          if (position.includes('n')) newHeight = startHeight - deltaY;

          if (newWidth > 50) { container.style.width = `${newWidth}px`; video.style.width = `${newWidth}px`; }
          if (newHeight > 50) { container.style.height = `${newHeight}px`; video.style.height = `${newHeight}px`; }

          setVideoDimensions(prev => ({ ...prev, [cropMode.videoId]: { width: newWidth, height: newHeight } }));
        };

        const onMouseUp = () => {
          isResizing = false;
          iframeDoc.removeEventListener('mousemove', onMouseMove);
          iframeDoc.removeEventListener('mouseup', onMouseUp);
        };

        iframeDoc.addEventListener('mousemove', onMouseMove);
        iframeDoc.addEventListener('mouseup', onMouseUp);
      };

      handle.addEventListener('mousedown', onMouseDown);
      container.appendChild(handle);
      handleElements.push(handle);
    };

    handles.forEach(addHandle);

    const exitBtn = iframeDoc.createElement('button');
    exitBtn.className = 'crop-exit-btn';
    exitBtn.style.cssText = 'position:absolute;top:-40px;right:0;padding:8px 16px;background:#3B82F6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;z-index:1001;';
    exitBtn.textContent = 'Done';
    exitBtn.onclick = () => setCropMode(null);
    container.appendChild(exitBtn);

    return () => {
      handleElements.forEach(h => h.remove());
      exitBtn.remove();
      container.style.border = '';
      container.style.boxShadow = '';
      container.style.width = '';
      container.style.height = '';
    };
  }, [cropMode, zoom, videoDimensions]);

  // ===== Helpers
  const isImgurUrl = (url: string): boolean => url.includes('i.imgur.com');

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
        [data-editable]:hover:not(.selected){outline:2px solid rgba(59,130,246,.5)!important;outline-offset:2px}
        [data-editable][contenteditable="true"]{outline:3px solid #10B981!important;outline-offset:2px;background:rgba(16,185,129,.1)!important}
        body[data-editable].selected{outline:3px solid #3B82F6!important;outline-offset:-3px}
        body[data-editable]:hover:not(.selected){outline:2px solid rgba(59,130,246,.5)!important;outline-offset:-2px}
        img[data-editable]{display:block!important}
        img[data-editable].selected{outline:3px solid #3B82F6!important;outline-offset:2px}
        .img-edit-wrapper{position:relative;display:inline-block;overflow:hidden;border-radius:inherit}
        .img-edit-overlay{position:absolute;inset:0;z-index:1002;cursor:move;pointer-events:auto;background:transparent}
        .img-edit-handle{position:absolute;background:#3B82F6;border:2px solid #fff;z-index:1003}
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

  // ===== Aplicação no iframe (troca de texto/cores + marca imagens/bg como editáveis)
  useEffect(() => {
    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe || !iframe.contentWindow) return;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;

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
            // garante estilo pra poder ficar absoluta quando entrar no modo edição
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
            if (r.width * r.height > 9000) {
              el.setAttribute('data-editable', 'image');
              if (!el.id) el.id = `slide-${index}-bg-${Math.random().toString(36).slice(2,7)}`;
              el.style.willChange = 'background-position,width,height';
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

      const titleKey = getElementKey(index, 'title');
      const subtitleKey = getElementKey(index, 'subtitle');
      const titleStyles = elementStyles[titleKey];
      const subtitleStyles = elementStyles[subtitleKey];
      const titleContent = editedContent[`${index}-title`];
      const subtitleContent = editedContent[`${index}-subtitle`];
      if (titleStyles || titleContent !== undefined) updateElement(`slide-${index}-title`, titleStyles, titleContent);
      if (subtitleStyles || subtitleContent !== undefined) updateElement(`slide-${index}-subtitle`, subtitleStyles, subtitleContent);

      // se tiver background já escolhido, sincroniza
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
      }, 100);

      iframeDoc.querySelectorAll('[data-editable]').forEach(el => { (el as HTMLElement).style.pointerEvents = 'auto'; });
    });
  }, [elementStyles, editedContent, originalStyles]);

  // ===== Image edit robusto (overlay + doc listeners)
  const cleanupImageEdit = (slideIndex: number) => {
    const iframe = iframeRefs.current[slideIndex];
    if (!iframe || !iframe.contentWindow) return;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return;

    doc.querySelectorAll('.img-edit-overlay, .img-edit-handle, .img-edit-done-btn').forEach(el => el.remove());
    doc.querySelectorAll('[data-img-editing="true"]').forEach(el => {
      (el as HTMLElement).style.outline = '';
      el.removeAttribute('data-img-editing');
    });
    const dragging = doc.querySelector('[data-img-dragging="true"]') as HTMLElement | null;
    if (dragging) dragging.removeAttribute('data-img-dragging');
  };

  const startImageEdit = (slideIndex: number, target: HTMLElement, type: 'img'|'bg') => {
    const iframe = iframeRefs.current[slideIndex];
    if (!iframe || !iframe.contentWindow) return;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc) return;

    cleanupImageEdit(slideIndex);

    // define wrapper (para img) ou o próprio elemento (para bg)
    let wrapper: HTMLElement;
    let imgEl: HTMLImageElement | null = null;
    let bgEl: HTMLElement | null = null;

    if (type === 'img') {
      imgEl = target as HTMLImageElement;

      // garante wrapper com overflow hidden
      if (!imgEl.parentElement || !imgEl.parentElement.classList.contains('img-edit-wrapper')) {
        const w = doc.createElement('div');
        w.className = 'img-edit-wrapper';
        const rect = imgEl.getBoundingClientRect();
        w.style.width = `${rect.width || imgEl.width}px`;
        w.style.height = `${rect.height || imgEl.height}px`;
        w.style.borderRadius = getComputedStyle(imgEl).borderRadius;
        w.style.display = 'inline-block';
        w.style.overflow = 'hidden';
        w.style.position = 'relative';

        // imagem absoluta pra poder arrastar
        imgEl.style.position = 'absolute';
        if (!imgEl.style.left) imgEl.style.left = '0px';
        if (!imgEl.style.top) imgEl.style.top = '0px';
        imgEl.style.maxWidth = 'unset';
        imgEl.style.maxHeight = 'unset';

        if (imgEl.parentNode) imgEl.parentNode.replaceChild(w, imgEl);
        w.appendChild(imgEl);
        wrapper = w;
      } else {
        wrapper = imgEl.parentElement as HTMLElement;
      }
      wrapper.setAttribute('data-img-editing', 'true');
      wrapper.style.outline = '3px solid #3B82F6';
    } else {
      bgEl = target as HTMLElement;
      wrapper = bgEl;
      wrapper.setAttribute('data-img-editing', 'true');
      wrapper.style.outline = '3px solid #3B82F6';
      const cs = doc.defaultView?.getComputedStyle(wrapper);
      if (cs && (!cs.backgroundSize || cs.backgroundSize === 'auto auto')) wrapper.style.backgroundSize = 'cover';
      if (cs && (!cs.backgroundPosition || cs.backgroundPosition === '0% 0%')) wrapper.style.backgroundPosition = 'center center';
      if (cs && cs.position === 'static') wrapper.style.position = 'relative';
    }

    // overlay que cobre o wrapper — captura drag independente do HTML interno
    const overlay = doc.createElement('div');
    overlay.className = 'img-edit-overlay';
    overlay.style.pointerEvents = 'auto';
    wrapper.appendChild(overlay);

    const start = { x: 0, y: 0, imgLeft: 0, imgTop: 0, bgPosX: 0, bgPosY: 0 };
    const onOverlayDown = (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      start.x = e.clientX;
      start.y = e.clientY;

      if (type === 'img' && wrapper.querySelector('img')) {
        const img = wrapper.querySelector('img') as HTMLImageElement;
        start.imgLeft = parseFloat(img.style.left || '0');
        start.imgTop = parseFloat(img.style.top || '0');
        img.setAttribute('data-img-dragging', 'true');
      } else if (type === 'bg') {
        const cs = doc.defaultView?.getComputedStyle(wrapper);
        const pos = (cs?.backgroundPosition || '0px 0px').split(' ');
        const toPx = (v: string, total: number) => (v.endsWith('%') ? (parseFloat(v) / 100) * total : parseFloat(v));
        start.bgPosX = toPx(pos[0] || '0px', wrapper.clientWidth);
        start.bgPosY = toPx(pos[1] || '0px', wrapper.clientHeight);
      }

      const onMove = (e: MouseEvent) => {
        const dx = (e.clientX - start.x) / zoom;
        const dy = (e.clientY - start.y) / zoom;

        if (type === 'img') {
          const img = wrapper.querySelector('img') as HTMLImageElement;
          if (img) {
            img.style.left = `${start.imgLeft + dx}px`;
            img.style.top = `${start.imgTop + dy}px`;
          }
        } else {
          const newX = start.bgPosX + dx;
          const newY = start.bgPosY + dy;
          wrapper.style.backgroundPosition = `${newX}px ${newY}px`;
        }
      };

      const onUp = () => {
        doc.removeEventListener('mousemove', onMove);
        doc.removeEventListener('mouseup', onUp);
        const img = wrapper.querySelector('img') as HTMLImageElement | null;
        if (img) img.removeAttribute('data-img-dragging');
      };

      doc.addEventListener('mousemove', onMove);
      doc.addEventListener('mouseup', onUp);
    };
    overlay.addEventListener('mousedown', onOverlayDown);

    // alças de resize
    const handles = ['nw','ne','sw','se','n','s','e','w'] as const;
    const makeHandle = (pos: typeof handles[number]) => {
      const h = doc.createElement('div');
      h.className = `img-edit-handle img-edit-h-${pos}`;
      if (['nw','ne','sw','se'].includes(pos)) {
        h.style.width='12px'; h.style.height='12px'; h.style.borderRadius='50%'; h.style.cursor=`${pos}-resize`;
      } else if (['n','s'].includes(pos)) {
        h.style.width='40px'; h.style.height='8px'; h.style.borderRadius='4px'; h.style.cursor=`${pos}-resize`; h.style.left='50%'; h.style.transform='translateX(-50%)';
      } else {
        h.style.width='8px'; h.style.height='40px'; h.style.borderRadius='4px'; h.style.cursor=`${pos}-resize`; h.style.top='50%'; h.style.transform='translateY(-50%)';
      }
      if (pos==='nw'){h.style.top='-6px'; h.style.left='-6px';}
      if (pos==='ne'){h.style.top='-6px'; h.style.right='-6px';}
      if (pos==='sw'){h.style.bottom='-6px'; h.style.left='-6px';}
      if (pos==='se'){h.style.bottom='-6px'; h.style.right='-6px';}
      if (pos==='n'){h.style.top='-4px';}
      if (pos==='s'){h.style.bottom='-4px';}
      if (pos==='e'){h.style.right='-4px';}
      if (pos==='w'){h.style.left='-4px';}

      let isResizing = false;
      let startX = 0, startY = 0, startW = 0, startH = 0;

      const onDown = (e: MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        isResizing = true;
        startX = e.clientX; startY = e.clientY;
        startW = wrapper.offsetWidth; startH = wrapper.offsetHeight;

        const onMove = (e: MouseEvent) => {
          if (!isResizing) return;
          const dx = (e.clientX - startX) / zoom;
          const dy = (e.clientY - startY) / zoom;
          let newW = startW;
          let newH = startH;
          if (pos.includes('e')) newW = startW + dx;
          if (pos.includes('w')) newW = startW - dx;
          if (pos.includes('s')) newH = startH + dy;
          if (pos.includes('n')) newH = startH - dy;

          if (newW > 50) wrapper.style.width = `${newW}px`;
          if (newH > 50) wrapper.style.height = `${newH}px`;
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

    // botão Done
    const done = doc.createElement('button');
    done.className = 'img-edit-done-btn';
    done.textContent = 'Done';
    done.style.cssText = 'position:absolute;top:-40px;right:0;padding:8px 16px;background:#3B82F6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;z-index:1004;';
    done.onclick = (e) => { e.preventDefault(); e.stopPropagation(); cleanupImageEdit(slideIndex); setImageEdit(null); };
    wrapper.appendChild(done);

    // salva estado pro painel
    const targetId = (type === 'img' ? (wrapper.querySelector('img') as HTMLElement) : wrapper).id || `img-edit-${Date.now()}`;
    (type === 'img' ? (wrapper.querySelector('img') as HTMLElement) : wrapper).id = targetId;
    setImageEdit({ slideIndex, type, targetId });
  };

  const enableImageEditFromElement = (slideIndex: number, el: HTMLElement) => {
    const isImg = el.tagName === 'IMG';
    // atrasa um tick pra não conflitar com seleções
    setTimeout(() => startImageEdit(slideIndex, isImg ? (el as HTMLImageElement) : el, isImg ? 'img' : 'bg'), 0);
  };

  // ===== Setup click dentro do iframe
  useEffect(() => {
    const setupIframeInteraction = (iframe: HTMLIFrameElement, slideIndex: number) => {
      if (!iframe.contentWindow) return;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;

      // clique em elementos editáveis
      const editableElements = iframeDoc.querySelectorAll('[data-editable]');
      editableElements.forEach((element) => {
        const editableType = element.getAttribute('data-editable');
        const htmlElement = element as HTMLElement;
        htmlElement.style.pointerEvents = 'auto';
        htmlElement.style.cursor = 'pointer';

        htmlElement.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          if (htmlElement.getAttribute('contenteditable') === 'true') return;

          // limpa seleções visuais
          iframeRefs.current.forEach((f) => {
            if (!f || !f.contentWindow) return;
            const d = f.contentDocument || f.contentWindow.document;
            if (!d) return;
            d.querySelectorAll('[data-editable]').forEach(el => el.classList.remove('selected'));
            d.body.classList.remove('selected');
          });

          element.classList.add('selected');

          if (editableType === 'image') {
            const isImg = htmlElement.tagName === 'IMG';
            if (isImg) selectedImageRefs.current[slideIndex] = htmlElement as HTMLImageElement;
            else selectedImageRefs.current[slideIndex] = null;

            handleElementClick(slideIndex, 'background');
            enableImageEditFromElement(slideIndex, htmlElement);
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
          iframe.onload = () => { setTimeout(() => setupIframeInteraction(iframe, index), 100); };
          if (iframe.contentDocument?.readyState === 'complete') setupIframeInteraction(iframe, index);
        }
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [renderedSlides]);

  // ===== util: achar maior visual
  const findLargestVisual = (iframeDoc: Document): { type: 'img' | 'bg', el: HTMLElement } | null => {
    let best: { type: 'img' | 'bg', el: HTMLElement, area: number } | null = null;

    const imgs = Array.from(iframeDoc.querySelectorAll('img')) as HTMLImageElement[];
    imgs.forEach(img => {
      if (img.getAttribute('data-protected') === 'true' || isImgurUrl(img.src)) return;
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > 9000) {
        if (!best || area > best.area) best = { type: 'img', el: img, area };
      }
    });

    const allEls = Array.from(iframeDoc.querySelectorAll<HTMLElement>('body, div, section, header, main, figure, article'));
    allEls.forEach(el => {
      const cs = iframeDoc.defaultView?.getComputedStyle(el);
      if (!cs) return;
      if (cs.backgroundImage && cs.backgroundImage.includes('url(')) {
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > 9000) {
          if (!best || area > best.area) best = { type: 'bg', el, area };
        }
      }
    });

    return best ? { type: best.type, el: best.el } : null;
  };

  // ===== Troca imediata + entra em edição
  const applyBackgroundImageImmediate = (slideIndex: number, imageUrl: string): HTMLElement | null => {
    const iframe = iframeRefs.current[slideIndex];
    if (!iframe || !iframe.contentWindow) return null;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    if (!iframeDoc) return null;

    const targetImg = selectedImageRefs.current[slideIndex];
    if (targetImg && targetImg.getAttribute('data-protected') !== 'true') {
      const asVideo = /\.(mp4|webm|ogg|mov)($|\?)/i.test(imageUrl);
      if (!asVideo) {
        targetImg.removeAttribute('srcset'); targetImg.removeAttribute('sizes'); targetImg.loading = 'eager';
        targetImg.src = imageUrl;
        targetImg.setAttribute('data-bg-image-url', imageUrl);
        return targetImg;
      }
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
    const iframe = iframeRefs.current[slideIndex];
    if (!iframe || !iframe.contentWindow) return;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    if (!iframeDoc) return;

    const updatedEl = applyBackgroundImageImmediate(slideIndex, imageUrl);

    // selecionar e entrar no modo edição
    iframeRefs.current.forEach((f) => {
      if (!f || !f.contentWindow) return;
      const d = f.contentDocument || f.contentWindow.document;
      if (!d) return;
      d.querySelectorAll('[data-editable]').forEach(el => el.classList.remove('selected'));
      d.body.classList.remove('selected');
    });

    if (updatedEl) {
      updatedEl.classList.add('selected');
      const isImg = updatedEl.tagName === 'IMG';
      if (isImg) selectedImageRefs.current[slideIndex] = updatedEl as HTMLImageElement;
      else selectedImageRefs.current[slideIndex] = null;

      enableImageEditFromElement(slideIndex, updatedEl);
    }

    setSelectedElement({ slideIndex, element: 'background' });
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setFocusedSlide(slideIndex);

    updateEditedValue(slideIndex, 'background', imageUrl);
  };

  // ===== Busca / Upload
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

  // ===== UI auxiliares
  const toggleLayer = (index: number) => {
    const newExpanded = new Set(expandedLayers);
    if (newExpanded.has(index)) newExpanded.delete(index);
    else newExpanded.add(index);
    setExpandedLayers(newExpanded);
  };
  const handleSlideClick = (index: number) => {
    iframeRefs.current.forEach((iframe) => {
      if (!iframe || !iframe.contentWindow) return;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;
      doc.querySelectorAll('[data-editable]').forEach(el => el.classList.remove('selected'));
      doc.body.classList.remove('selected');
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
    iframeRefs.current.forEach((iframe) => {
      if (!iframe || !iframe.contentWindow) return;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;
      iframeDoc.querySelectorAll('[data-editable]').forEach(el => el.classList.remove('selected'));
      iframeDoc.body.classList.remove('selected');
    });

    const targetIframe = iframeRefs.current[slideIndex];
    if (targetIframe && targetIframe.contentWindow) {
      const targetDoc = targetIframe.contentDocument || targetIframe.contentWindow.document;
      if (targetDoc && element) {
        const targetElement = targetDoc.getElementById(`slide-${slideIndex}-${element}`);
        if (targetElement) targetElement.classList.add('selected');
        else if (element === 'background') targetDoc.body.classList.add('selected');
      }
    }

    setPreviousSelection(selectedElement);
    setSelectedElement({ slideIndex, element });
    setFocusedSlide(slideIndex);
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setTimeout(() => setIsLoadingProperties(false), 100);
  };

  const getElementKey = (slideIndex: number, element: ElementType) => `${slideIndex}-${element}`;
  const getEditedValue = (slideIndex: number, field: string, defaultValue: any) => {
    const key = `${slideIndex}-${field}`;
    return editedContent[key] !== undefined ? editedContent[key] : defaultValue;
  };
  const updateEditedValue = (slideIndex: number, field: string, value: any) => {
    const key = `${slideIndex}-${field}`;
    setEditedContent(prev => ({ ...prev, [key]: value }));
  };
  const getElementStyle = (slideIndex: number, element: ElementType): ElementStyles => {
    const key = getElementKey(slideIndex, element);
    if (elementStyles[key]) return elementStyles[key];
    if (originalStyles[key]) return originalStyles[key];
    return { fontSize: element === 'title' ? '24px' : '16px', fontWeight: element === 'title' ? '700' : '400', textAlign: 'left', color: '#FFFFFF' };
  };
  const updateElementStyle = (slideIndex: number, element: ElementType, property: keyof ElementStyles, value: string) => {
    const key = getElementKey(slideIndex, element);
    setElementStyles(prev => ({ ...prev, [key]: { ...getElementStyle(slideIndex, element), [property]: value } }));
  };

  const findLargestVisual = (iframeDoc: Document): { type: 'img' | 'bg', el: HTMLElement } | null => {
    let best: { type: 'img' | 'bg', el: HTMLElement, area: number } | null = null;

    const imgs = Array.from(iframeDoc.querySelectorAll('img')) as HTMLImageElement[];
    imgs.forEach(img => {
      if (img.getAttribute('data-protected') === 'true' || isImgurUrl(img.src)) return;
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > 9000) {
        if (!best || area > best.area) best = { type: 'img', el: img, area };
      }
    });

    const allEls = Array.from(iframeDoc.querySelectorAll<HTMLElement>('body, div, section, header, main, figure, article'));
    allEls.forEach(el => {
      const cs = iframeDoc.defaultView?.getComputedStyle(el);
      if (!cs) return;
      if (cs.backgroundImage && cs.backgroundImage.includes('url(')) {
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > 9000) {
          if (!best || area > best.area) best = { type: 'bg', el, area };
        }
      }
    });

    return best ? { type: best.type, el: best.el } : null;
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

  // ===== JSX
  return (
    <div className="fixed top-14 left-16 right-0 bottom-0 z-[90] bg-neutral-900 flex">
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

      <div className="flex-1 flex flex-col">
        <div className="h-14 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-white font-semibold">Carousel Editor</h2>
            <div className="text-neutral-500 text-sm">{slides.length} slides</div>
          </div>

          <div className="flex items-center space-x-2">
            <button onClick={handleZoomOut} className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors" title="Zoom Out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="bg-neutral-800 text-white px-3 py-1.5 rounded text-xs min-w-[70px] text-center">{Math.round(zoom * 100)}%</div>
            <button onClick={handleZoomIn} className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors" title="Zoom In">
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-neutral-800 mx-2" />
            <button onClick={handleDownloadAll} className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded transition-colors flex items-center space-x-2 text-sm" title="Download All Slides">
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
            if (e.ctrlKey) {
              const delta = e.deltaY > 0 ? -0.05 : 0.05;
              setZoom((prev) => Math.min(Math.max(0.1, prev + delta), 2));
            } else {
              setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
            }
          }}
          onMouseDown={(e) => {
            if (e.button === 0 && e.currentTarget === e.target) {
              setIsDragging(true);
              setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            }
          }}
          onMouseMove={(e) => {
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
                          onClick={() => {
                            // tenta reativar edição no maior visual se não tiver um selecionado
                            const iframe = iframeRefs.current[selectedElement.slideIndex];
                            const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
                            if (!doc) return;
                            const currentSelected = doc.querySelector('[data-editable].selected') as HTMLElement | null;
                            const target = currentSelected || (findLargestVisual(doc)?.el ?? null);
                            if (target) enableImageEditFromElement(selectedElement.slideIndex, target);
                          }}
                          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
                          title="Entrar no modo de edição da imagem selecionada"
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