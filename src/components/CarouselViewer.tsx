import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, ZoomOut, Download, ChevronDown, ChevronRight, Layers, Image as ImageIcon, Type, Upload, Search, Play, Crop } from 'lucide-react';

interface CarouselData {
  dados_gerais: {
    nome: string;
    arroba: string;
    foto_perfil: string;
    template: string;
  };
  conteudos: Array<{
    title: string;
    subtitle?: string;
    imagem_fundo: string;
    thumbnail_url?: string;
    imagem_fundo2?: string;
    imagem_fundo3?: string;
    imagem_fundo4?: string;
    imagem_fundo5?: string;
    imagem_fundo6?: string;
  }>;
}

const isVideoUrl = (url: string): boolean => {
  return url.toLowerCase().match(/\.(mp4|webm|ogg|mov)($|\?)/) !== null;
};

const isProtectedSrc = (url?: string | null): boolean => {
  if (!url) return false;
  const clean = String(url).trim().replace(/^url\((['"]?)(.*)\1\)$/i, '$2');
  // Match exatamente i.imgur.com (com http ou https), independente de querystring
  return /^https?:\/\/i\.imgur\.com\//i.test(clean);
};

interface CarouselViewerProps {
  slides: string[];
  carouselData: CarouselData;
  onClose: () => void;
}

type ElementType = 'title' | 'subtitle' | 'background' | null;

interface ElementStyles {
  fontSize: string;
  fontWeight: string;
  textAlign: string;
  color: string;
}

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
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
  }, [selectedElement, cropMode, onClose]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'enterCropMode') {
        setCropMode({ slideIndex: event.data.slideIndex, videoId: event.data.videoId });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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
      if (video) {
        container = video.parentElement as HTMLElement;
      }
    }

    if (!container || !video) return;

    const currentWidth = videoDimensions[cropMode.videoId]?.width || video.offsetWidth;
    const currentHeight = videoDimensions[cropMode.videoId]?.height || video.offsetHeight;

    container.style.width = `${currentWidth}px`;
    container.style.height = `${currentHeight}px`;
    container.style.border = '3px solid #3B82F6';
    container.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.5)';

    const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
    const handleElements: HTMLElement[] = [];

    handles.forEach(position => {
      const handle = iframeDoc.createElement('div');
      handle.className = `resize-handle resize-handle-${position}`;
      handle.style.cssText = `position: absolute; background: #3B82F6; border: 2px solid white; z-index: 1000;`;

      if (position === 'nw' || position === 'ne' || position === 'sw' || position === 'se') {
        handle.style.width = '12px';
        handle.style.height = '12px';
        handle.style.borderRadius = '50%';
        handle.style.cursor = `${position}-resize`;
      } else {
        if (position === 'n' || position === 's') {
          handle.style.width = '40px';
          handle.style.height = '8px';
          handle.style.borderRadius = '4px';
          handle.style.cursor = `${position}-resize`;
          handle.style.left = '50%';
          handle.style.transform = 'translateX(-50%)';
        } else {
          handle.style.width = '8px';
          handle.style.height = '40px';
          handle.style.borderRadius = '4px';
          handle.style.cursor = `${position}-resize`;
          handle.style.top = '50%';
          handle.style.transform = 'translateY(-50%)';
        }
      }

      switch(position) {
        case 'nw': handle.style.top = '-6px'; handle.style.left = '-6px'; break;
        case 'ne': handle.style.top = '-6px'; handle.style.right = '-6px'; break;
        case 'sw': handle.style.bottom = '-6px'; handle.style.left = '-6px'; break;
        case 'se': handle.style.bottom = '-6px'; handle.style.right = '-6px'; break;
        case 'n': handle.style.top = '-4px'; break;
        case 's': handle.style.bottom = '-4px'; break;
        case 'e': handle.style.right = '-4px'; break;
        case 'w': handle.style.left = '-4px'; break;
      }

      let isResizing = false;
      let startX = 0;
      let startY = 0;
      let startWidth = 0;
      let startHeight = 0;

      const onMouseDown = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = container.offsetWidth;
        startHeight = container.offsetHeight;

        const onMouseMove = (e: MouseEvent) => {
          if (!isResizing) return;

          const deltaX = e.clientX - startX;
          const deltaY = e.clientY - startY;
          let newWidth = startWidth;
          let newHeight = startHeight;

          if (position.includes('e')) newWidth = startWidth + deltaX / zoom;
          if (position.includes('w')) newWidth = startWidth - deltaX / zoom;
          if (position.includes('s')) newHeight = startHeight + deltaY / zoom;
          if (position.includes('n')) newHeight = startHeight - deltaY / zoom;

          if (newWidth > 50) {
            container.style.width = `${newWidth}px`;
            video.style.width = `${newWidth}px`;
          }
          if (newHeight > 50) {
            container.style.height = `${newHeight}px`;
            video.style.height = `${newHeight}px`;
          }

          setVideoDimensions(prev => ({
            ...prev,
            [cropMode.videoId]: { width: newWidth, height: newHeight }
          }));
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
    });

    const exitBtn = iframeDoc.createElement('button');
    exitBtn.className = 'crop-exit-btn';
    exitBtn.style.cssText = 'position: absolute; top: -40px; right: 0; padding: 8px 16px; background: #3B82F6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; z-index: 1001;';
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
        [data-editable] { cursor: pointer !important; position: relative; display: inline-block !important; }
        [data-editable].selected {
          outline: 3px solid #3B82F6 !important;
          outline-offset: 2px;
          z-index: 1000;
        }
        [data-editable]:hover:not(.selected) {
          outline: 2px solid rgba(59, 130, 246, 0.5) !important;
          outline-offset: 2px;
        }
        [data-editable][contenteditable="true"] {
          outline: 3px solid #10B981 !important;
          outline-offset: 2px;
          background: rgba(16, 185, 129, 0.1) !important;
        }
        body[data-editable].selected {
          outline: 3px solid #3B82F6 !important;
          outline-offset: -3px;
        }
        body[data-editable]:hover:not(.selected) {
          outline: 2px solid rgba(59, 130, 246, 0.5) !important;
          outline-offset: -2px;
        }
        img[data-editable] {
          display: block !important;
        }
        img[data-editable].selected {
          outline: 3px solid #3B82F6 !important;
          outline-offset: 2px;
        }
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
    const slideWidth = 1080;
    const gap = 40;
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = 0 * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;

    setPan({ x: -slidePosition * zoom, y: 0 });
    setFocusedSlide(0);
  }, []);

  useEffect(() => {
    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe || !iframe.contentWindow) return;

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;

      Object.entries(videoDimensions).forEach(([videoId, dims]) => {
        const container = iframeDoc.querySelector(`[data-video-id="${videoId}"]`) as HTMLElement;
        if (container) {
          container.style.width = `${dims.width}px`;
          container.style.height = `${dims.height}px`;
          const video = container.querySelector('video') as HTMLVideoElement;
          if (video) {
            video.style.width = `${dims.width}px`;
            video.style.height = `${dims.height}px`;
          }
        }
      });

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
          if (element.getAttribute('contenteditable') !== 'true') {
            element.textContent = content;
          }
        }
      };

      const extractOriginalStyles = (element: HTMLElement): ElementStyles => {
        const computedStyle = iframeDoc.defaultView?.getComputedStyle(element);
        if (!computedStyle) return { fontSize: '16px', fontWeight: '400', textAlign: 'left', color: '#FFFFFF' };

        const rgbToHex = (rgb: string): string => {
          const result = rgb.match(/\d+/g);
          if (!result || result.length < 3) return rgb;
          const r = parseInt(result[0]).toString(16).padStart(2, '0');
          const g = parseInt(result[1]).toString(16).padStart(2, '0');
          const b = parseInt(result[2]).toString(16).padStart(2, '0');
          return `#${r}${g}${b}`.toUpperCase();
        };

        const color = computedStyle.color || '#FFFFFF';
        const hexColor = color.startsWith('rgb') ? rgbToHex(color) : color;

        return {
          fontSize: computedStyle.fontSize || '16px',
          fontWeight: computedStyle.fontWeight || '400',
          textAlign: (computedStyle.textAlign as any) || 'left',
          color: hexColor
        };
      };

      const slideKey = getElementKey(index, 'title');
      const titleStyles = elementStyles[slideKey];
      const titleContent = editedContent[`${index}-title`];

      if (titleStyles || titleContent !== undefined) {
        updateElement(`slide-${index}-title`, titleStyles, titleContent);
      }

      const subtitleKey = getElementKey(index, 'subtitle');
      const subtitleStyles = elementStyles[subtitleKey];
      const subtitleContent = editedContent[`${index}-subtitle`];

      if (subtitleStyles || subtitleContent !== undefined) {
        updateElement(`slide-${index}-subtitle`, subtitleStyles, subtitleContent);
      }

      const bgImage = editedContent[`${index}-background`];
      if (bgImage) {
        const conteudo = carouselData.conteudos[index];

        const originalImages = [
          conteudo?.imagem_fundo,
          conteudo?.imagem_fundo2,
          conteudo?.imagem_fundo3,
          conteudo?.imagem_fundo4,
          conteudo?.imagem_fundo5,
          conteudo?.imagem_fundo6,
        ].filter(Boolean) as string[];
        
        const matchesTemplateImage = (candidate: string) =>
        originalImages.some((u) => typeof candidate === 'string' && candidate.includes(u));
        
        const allElements = iframeDoc.querySelectorAll('*');

        let processedMainImage = false;

        allElements.forEach(el => {
          const element = el as HTMLElement;

          if (element.tagName === 'IMG') {
            const imgElement = element as HTMLImageElement;

            if (isProtectedSrc(imgElement.src)) {
              processedMainImage = true; // marque como processado
              return;
            }

            if (!matchesTemplateImage(imgElement.src)) {
              return; // não é a “foto principal” do template, ignore
            }
            
            const imgWidth = imgElement.width;
            const imgHeight = imgElement.height;
            const isLargeImage = imgWidth > 100 || imgHeight > 100;

            if (isLargeImage) {
              const previousBgImage = imgElement.getAttribute('data-bg-image-url');
              const needsUpdate = !previousBgImage || previousBgImage !== bgImage;

              if (needsUpdate && !isProtectedSrc(imgElement.src)) {
                imgElement.setAttribute('data-bg-image-url', bgImage);
                processedMainImage = true;

                const isVideoUrl = bgImage.toLowerCase().match(/\.(mp4|webm|ogg|mov)($|\?)/);

                if (isVideoUrl) {
                  const videoId = `video-${index}-${Date.now()}`;
                  const container = iframeDoc.createElement('div');
                  container.className = 'video-container';
                  container.setAttribute('data-bg-container', 'true');
                  container.setAttribute('data-video-id', videoId);
                  container.style.cssText = `position: relative; display: inline-block; ${imgElement.style.cssText}`;

                  const video = iframeDoc.createElement('video');
                  video.src = bgImage;
                  video.className = imgElement.className;
                  video.id = videoId;
                  video.style.cssText = `width: 100%; border-radius: 24px; ${imgElement.style.cssText}`;
                  video.setAttribute('data-video-src', bgImage);

                  const playBtn = iframeDoc.createElement('button');
                  playBtn.className = 'video-play-btn';
                  playBtn.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 60px; height: 60px; border-radius: 50%; background: rgba(0,0,0,0.7); border: 3px solid white; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10;';
                  playBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="white" style="margin-left: 3px;"><path d="M8 5v14l11-7z"/></svg>';

                  const cropBtn = iframeDoc.createElement('button');
                  cropBtn.className = 'video-crop-btn';
                  cropBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; border-radius: 8px; background: rgba(0,0,0,0.7); border: 2px solid white; cursor: pointer; display: none; align-items: center; justify-content: center; z-index: 11;';
                  cropBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>';

                  playBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    video.play();
                    playBtn.style.display = 'none';
                    cropBtn.style.display = 'flex';

                    video.onended = () => {
                      playBtn.style.display = 'flex';
                      cropBtn.style.display = 'none';
                    };

                    video.onclick = () => {
                      if (!video.paused) {
                        video.pause();
                        playBtn.style.display = 'flex';
                        cropBtn.style.display = 'none';
                      }
                    };
                  };

                  cropBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.parent.postMessage({ type: 'enterCropMode', slideIndex: index, videoId: videoId }, '*');
                  };

                  container.appendChild(video);
                  container.appendChild(playBtn);
                  container.appendChild(cropBtn);

                  if (imgElement.parentNode) {
                    imgElement.parentNode.replaceChild(container, imgElement);
                  }
                } else {
                  imgElement.src = bgImage;
                }
              } else if (!needsUpdate) {
                processedMainImage = true;
              }
            }
          }

          if (element.classList && element.classList.contains('video-container') && element.getAttribute('data-bg-container')) {
            const video = element.querySelector('video') as HTMLVideoElement;
            if (video) {
              processedMainImage = true;
              const isVideoUrl = bgImage.toLowerCase().match(/\.(mp4|webm|ogg|mov)($|\?)/);

              if (isVideoUrl) {
                video.src = bgImage;
                video.setAttribute('data-video-src', bgImage);
                video.style.cssText = `width: 100%; border-radius: 24px; ${video.style.cssText.replace(/width:\s*[^;]+;?/gi, '').replace(/border-radius:\s*[^;]+;?/gi, '')}`;
                const playBtn = element.querySelector('.video-play-btn') as HTMLButtonElement;
                if (playBtn) {
                  playBtn.style.display = 'flex';
                }
              } else {
                const img = iframeDoc.createElement('img');
                img.src = bgImage;
                img.className = video.className;
                img.setAttribute('data-processed-bg', 'true');

                const containerStyle = element.style.cssText;
                const videoStyles = video.style.cssText
                  .replace(/width:\s*[^;]+;?/gi, '')
                  .replace(/border-radius:\s*[^;]+;?/gi, '');

                img.style.cssText = containerStyle || videoStyles;

                if (element.parentNode) {
                  element.parentNode.replaceChild(img, element);
                }
              }
            }
          }

          const computedStyle = iframeDoc.defaultView?.getComputedStyle(element);

          if (computedStyle && !processedMainImage) {
            const bgImageStyle = computedStyle.backgroundImage;

            if (bgImageStyle && bgImageStyle !== 'none' && bgImageStyle.includes('url')) {
              if (element.getAttribute('data-has-bg-image')) {
                const isVideoUrl = bgImage.toLowerCase().match(/\.(mp4|webm|ogg|mov)($|\?)/);

                if (isVideoUrl) {
                  const videoId = `video-bg-${index}-${Date.now()}`;
                  let video = element.querySelector('video');
                  let playBtn = element.querySelector('.video-play-btn-bg') as HTMLButtonElement;
                  let cropBtn = element.querySelector('.video-crop-btn') as HTMLButtonElement;

                  if (!video) {
                    video = iframeDoc.createElement('video');
                    video.loop = true;
                    video.muted = true;
                    video.playsInline = true;
                    video.id = videoId;
                    video.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: -1;';
                    video.src = bgImage;
                    video.setAttribute('data-video-src', bgImage);

                    playBtn = iframeDoc.createElement('button');
                    playBtn.className = 'video-play-btn-bg';
                    playBtn.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80px; height: 80px; border-radius: 50%; background: rgba(0,0,0,0.7); border: 3px solid white; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10;';
                    playBtn.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="white" style="margin-left: 4px;"><path d="M8 5v14l11-7z"/></svg>';

                    cropBtn = iframeDoc.createElement('button');
                    cropBtn.className = 'video-crop-btn';
                    cropBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; border-radius: 8px; background: rgba(0,0,0,0.7); border: 2px solid white; cursor: pointer; display: none; align-items: center; justify-content: center; z-index: 11;';
                    cropBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>';

                    playBtn.onclick = (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      video!.play();
                      playBtn!.style.display = 'none';
                      cropBtn!.style.display = 'flex';

                      video!.onended = () => {
                        playBtn!.style.display = 'flex';
                        cropBtn!.style.display = 'none';
                      };

                      video!.onclick = () => {
                        if (!video!.paused) {
                          video!.pause();
                          playBtn!.style.display = 'flex';
                          cropBtn!.style.display = 'none';
                        }
                      };
                    };

                    cropBtn.onclick = (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.parent.postMessage({ type: 'enterCropMode', slideIndex: index, videoId: videoId }, '*');
                    };

                    element.style.position = 'relative';
                    element.setAttribute('data-video-id', videoId);
                    element.insertBefore(video, element.firstChild);
                    element.appendChild(playBtn);
                    element.appendChild(cropBtn);
                  } else {
                    video.src = bgImage;
                    video.setAttribute('data-video-src', bgImage);
                    if (playBtn) {
                      playBtn.style.display = 'flex';
                    }
                  }
                  element.style.setProperty('background-image', 'none', 'important');
                } else {
                  const existingVideo = element.querySelector('video');
                  if (existingVideo) {
                    existingVideo.remove();
                  }
                  const existingPlayBtn = element.querySelector('.video-play-btn-bg');
                  if (existingPlayBtn) {
                    existingPlayBtn.remove();
                  }
                  element.style.setProperty('background-image', `url('${bgImage}')`, 'important');
                }
                processedMainImage = true;
              } else {
                const matches = bgImageStyle.match(/url\(['"]?([^'"\)]+)['"]?\)/);
                if (matches && matches[1]) {
                  const bgUrl = matches[1];
              
                  // 1) não toque se for Imgur
                  if (isProtectedSrc(bgUrl)) {
                    processedMainImage = true; // evita cair no fallback do <body>
                    return;
                  }
              
                  // 2) só mexa se bater com alguma das imagens originais do template
                  if (!matchesTemplateImage(bgUrl)) {
                    return;
                  }
              
                  // OK, agora podemos trocar
                  element.setAttribute('data-has-bg-image', 'true');
                  element.style.setProperty('background-image', `url('${bgImage}')`, 'important');
                  processedMainImage = true;
                }
              }
            }
          }
        });

        if (!processedMainImage) {
          const body = iframeDoc.body;
          if (body) {
            body.style.setProperty('background-image', `url('${bgImage}')`, 'important');
          }
        }
      }

      const videoBgUrl = iframeDoc.body.getAttribute('data-video-bg');
      if (videoBgUrl) {
        const allDivs = iframeDoc.querySelectorAll('div, section');
        allDivs.forEach(el => {
          const element = el as HTMLElement;
          const computedStyle = iframeDoc.defaultView?.getComputedStyle(element);

          if (computedStyle && computedStyle.backgroundImage && computedStyle.backgroundImage === 'none') {
            const hasBackgroundProperty = element.style.background || element.style.backgroundImage;

            if (hasBackgroundProperty) {
              let video = element.querySelector('video');
              if (!video) {
                const videoId = `video-bg-attr-${index}-${Date.now()}`;
                video = iframeDoc.createElement('video');
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                video.id = videoId;
                video.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: -1;';
                video.src = videoBgUrl;
                video.setAttribute('data-video-src', videoBgUrl);

                const playBtn = iframeDoc.createElement('button');
                playBtn.className = 'video-play-btn-bg';
                playBtn.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80px; height: 80px; border-radius: 50%; background: rgba(0,0,0,0.7); border: 3px solid white; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10;';
                playBtn.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="white" style="margin-left: 4px;"><path d="M8 5v14l11-7z"/></svg>';

                const cropBtn = iframeDoc.createElement('button');
                cropBtn.className = 'video-crop-btn';
                cropBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; border-radius: 8px; background: rgba(0,0,0,0.7); border: 2px solid white; cursor: pointer; display: none; align-items: center; justify-content: center; z-index: 11;';
                cropBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>';

                playBtn.onclick = (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  video!.play();
                  playBtn.style.display = 'none';
                  cropBtn.style.display = 'flex';

                  video!.onended = () => {
                    playBtn.style.display = 'flex';
                    cropBtn.style.display = 'none';
                  };

                  video!.onclick = () => {
                    if (!video!.paused) {
                      video!.pause();
                      playBtn.style.display = 'flex';
                      cropBtn.style.display = 'none';
                    }
                  };
                };

                cropBtn.onclick = (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.parent.postMessage({ type: 'enterCropMode', slideIndex: index, videoId: videoId }, '*');
                };

                element.style.position = 'relative';
                element.setAttribute('data-video-id', videoId);
                element.insertBefore(video, element.firstChild);
                element.appendChild(playBtn);
                element.appendChild(cropBtn);
              }
            }
          }
        });
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

      const allElements = iframeDoc.querySelectorAll('[data-editable]');
      allElements.forEach(el => {
        (el as HTMLElement).style.pointerEvents = 'auto';
      });
    });
  }, [elementStyles, editedContent, videoDimensions]);

  useEffect(() => {
    const setupIframeInteraction = (iframe: HTMLIFrameElement, slideIndex: number) => {
      if (!iframe.contentWindow) return;

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;

      const playButtons = iframeDoc.querySelectorAll('.video-play-btn');
      playButtons.forEach(btn => {
        const button = btn as HTMLButtonElement;
        button.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          const container = button.parentElement;
          if (container) {
            const video = container.querySelector('video') as HTMLVideoElement;
            if (video) {
              video.play();
              button.style.display = 'none';

              video.onended = () => {
                button.style.display = 'flex';
              };

              video.onclick = () => {
                if (!video.paused) {
                  video.pause();
                  button.style.display = 'flex';
                }
              };
            }
          }
        };
      });

      const editableElements = iframeDoc.querySelectorAll('[data-editable]');

      editableElements.forEach((element) => {
        const editableType = element.getAttribute('data-editable');
        const htmlElement = element as HTMLElement;

        htmlElement.style.pointerEvents = 'auto';
        htmlElement.style.cursor = 'pointer';

        htmlElement.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (htmlElement.getAttribute('contenteditable') === 'true') {
            return;
          }

          iframeDoc.querySelectorAll('[data-editable]').forEach(el => {
            el.classList.remove('selected');
            if (el.getAttribute('contenteditable') === 'true') {
              el.setAttribute('contenteditable', 'false');
            }
          });

          element.classList.add('selected');

          handleElementClick(slideIndex, editableType as ElementType);
        };

        if (editableType === 'title' || editableType === 'subtitle') {
          htmlElement.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            htmlElement.setAttribute('contenteditable', 'true');
            htmlElement.focus();
            setIsEditingInline({ slideIndex, element: editableType as ElementType });

            const range = iframeDoc.createRange();
            range.selectNodeContents(htmlElement);
            const selection = iframe.contentWindow?.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
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
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              htmlElement.blur();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              htmlElement.blur();
            }
          };
        }
      });
    };

    const timer = setTimeout(() => {
      iframeRefs.current.forEach((iframe, index) => {
        if (iframe) {
          iframe.onload = () => {
            setTimeout(() => setupIframeInteraction(iframe, index), 100);
          };
          if (iframe.contentDocument?.readyState === 'complete') {
            setupIframeInteraction(iframe, index);
          }
        }
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [renderedSlides]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom((prev) => Math.min(Math.max(0.1, prev + delta), 2));
    } else {
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && e.currentTarget === e.target) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.1, 2));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.1, 0.1));
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

  const handleBackgroundImageChange = (slideIndex: number, imageUrl: string) => {
    const conteudo = carouselData.conteudos[slideIndex];
  
    const originalImages = [
      conteudo?.imagem_fundo,
      conteudo?.imagem_fundo2,
      conteudo?.imagem_fundo3,
      conteudo?.imagem_fundo4,
      conteudo?.imagem_fundo5,
      conteudo?.imagem_fundo6,
    ].filter(Boolean) as string[];
  
    const templateHasProtected = originalImages.some(isProtectedSrc);
  
    // 1) Se o template tem imgur, não altere. 2) Também não aceite novo bg vindo do imgur.
    if (templateHasProtected || isProtectedSrc(imageUrl)) {
      return; // silêncio: não muda nada
    }
  
    updateEditedValue(slideIndex, 'background', imageUrl);
  };

  const handleSearchImages = async () => {
    if (!searchKeyword.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch('https://webhook.workez.online/webhook/searchImages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyword: searchKeyword }),
      });

      if (!response.ok) {
        throw new Error('Failed to search images');
      }

      const data = await response.json();
      if (data) {
        const imageUrls = [
          data.imagem_fundo,
          data.imagem_fundo2,
          data.imagem_fundo3,
          data.imagem_fundo4,
          data.imagem_fundo5,
          data.imagem_fundo6,
        ].filter(Boolean);
        setSearchResults(imageUrls);
      }
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

  const toggleLayer = (index: number) => {
    const newExpanded = new Set(expandedLayers);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedLayers(newExpanded);
  };

  const handleSlideClick = (index: number) => {
    setFocusedSlide(index);
    setSelectedElement({ slideIndex: index, element: null });
    const slideWidth = 1080;
    const gap = 40;
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = index * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;

    setPan({ x: -slidePosition * zoom, y: 0 });
  };

  const handleElementClick = (slideIndex: number, element: ElementType) => {
    setIsLoadingProperties(true);

    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe || !iframe.contentWindow) return;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;

      iframeDoc.querySelectorAll('[data-editable]').forEach(el => {
        el.classList.remove('selected');
      });
    });

    setPreviousSelection(selectedElement);
    setSelectedElement({ slideIndex, element });
    setFocusedSlide(slideIndex);
    if (!expandedLayers.has(slideIndex)) {
      toggleLayer(slideIndex);
    }

    setTimeout(() => setIsLoadingProperties(false), 100);
  };

  const getElementKey = (slideIndex: number, element: ElementType) => {
    return `${slideIndex}-${element}`;
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
    const key = getElementKey(slideIndex, element);
    if (elementStyles[key]) {
      return elementStyles[key];
    }
    if (originalStyles[key]) {
      return originalStyles[key];
    }
    return {
      fontSize: element === 'title' ? '24px' : '16px',
      fontWeight: element === 'title' ? '700' : '400',
      textAlign: 'left',
      color: '#FFFFFF'
    };
  };

  const updateElementStyle = (slideIndex: number, element: ElementType, property: keyof ElementStyles, value: string) => {
    const key = getElementKey(slideIndex, element);
    setElementStyles(prev => ({
      ...prev,
      [key]: {
        ...getElementStyle(slideIndex, element),
        [property]: value
      }
    }));
  };

  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  const getElementIcon = (element: string) => {
    if (element.includes('title') || element.includes('subtitle')) {
      return <Type className="w-4 h-4 text-neutral-500" />;
    }
    return <ImageIcon className="w-4 h-4 text-neutral-500" />;
  };

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
                        selectedElement.slideIndex === index && selectedElement.element === 'background' ? 'bg-neutral-800' : ''
                      }`}
                    >
                      {getElementIcon('background')}
                      <span className="text-neutral-300 text-xs">Background Image</span>
                    </button>

                    <button
                      onClick={() => handleElementClick(index, 'title')}
                      className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                        selectedElement.slideIndex === index && selectedElement.element === 'title' ? 'bg-neutral-800' : ''
                      }`}
                    >
                      {getElementIcon('title')}
                      <span className="text-neutral-300 text-xs">Title</span>
                    </button>

                    {conteudo.subtitle && (
                      <button
                        onClick={() => handleElementClick(index, 'subtitle')}
                        className={`w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-neutral-900 transition-colors ${
                          selectedElement.slideIndex === index && selectedElement.element === 'subtitle' ? 'bg-neutral-800' : ''
                        }`}
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
            <div className="text-neutral-500 text-sm">
              {slides.length} slides
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleZoomOut}
              className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="bg-neutral-800 text-white px-3 py-1.5 rounded text-xs min-w-[70px] text-center">
              {Math.round(zoom * 100)}%
            </div>
            <button
              onClick={handleZoomIn}
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
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
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
                  className={`relative bg-white rounded-lg shadow-2xl overflow-hidden flex-shrink-0 transition-all ${
                    focusedSlide === index ? 'ring-4 ring-blue-500' : ''
                  }`}
                  style={{
                    width: `${slideWidth}px`,
                    height: `${slideHeight}px`,
                  }}
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
                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Background Images</label>
                    <div className="space-y-2">
                      {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo && (() => {
                        const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo;
                        const isVideo = isVideoUrl(bgUrl);
                        const thumbnailUrl = carouselData.conteudos[selectedElement.slideIndex]?.thumbnail_url;
                        const displayUrl = isVideo && thumbnailUrl ? thumbnailUrl : bgUrl;
                        const currentBg = getEditedValue(selectedElement.slideIndex, 'background', bgUrl);

                        return (
                          <div
                            className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${
                              currentBg === bgUrl
                                ? 'border-blue-500'
                                : 'border-neutral-800 hover:border-blue-400'
                            }`}
                            onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}
                          >
                            <div className="text-neutral-400 text-xs mb-1 flex items-center justify-between">
                              <span>{isVideo ? 'Video 1' : 'Image 1'}</span>
                              {isVideo && <Play className="w-3 h-3" />}
                            </div>
                            <div className="relative">
                              <img
                                src={displayUrl}
                                alt="Background 1"
                                className="w-full h-24 object-cover rounded"
                              />
                              {isVideo && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded">
                                  <Play className="w-8 h-8 text-white" fill="white" />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo2 && (() => {
                        const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo2!;
                        const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);

                        return (
                          <div
                            className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${
                              currentBg === bgUrl
                                ? 'border-blue-500'
                                : 'border-neutral-800 hover:border-blue-400'
                            }`}
                            onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}
                          >
                            <div className="text-neutral-400 text-xs mb-1">Image 2</div>
                            <img
                              src={bgUrl}
                              alt="Background 2"
                              className="w-full h-24 object-cover rounded"
                            />
                          </div>
                        );
                      })()}

                      {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3 && (() => {
                        const bgUrl = carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3!;
                        const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);

                        return (
                          <div
                            className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${
                              currentBg === bgUrl
                                ? 'border-blue-500'
                                : 'border-neutral-800 hover:border-blue-400'
                            }`}
                            onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}
                          >
                            <div className="text-neutral-400 text-xs mb-1">Image 3</div>
                            <img
                              src={bgUrl}
                              alt="Background 3"
                              className="w-full h-24 object-cover rounded"
                            />
                          </div>
                        );
                      })()}

                      {uploadedImages[selectedElement.slideIndex] && (() => {
                        const bgUrl = uploadedImages[selectedElement.slideIndex];
                        const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);

                        return (
                          <div
                            className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${
                              currentBg === bgUrl
                                ? 'border-blue-500'
                                : 'border-neutral-800 hover:border-blue-400'
                            }`}
                            onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, bgUrl)}
                          >
                            <div className="text-neutral-400 text-xs mb-1">Image 4 (Uploaded)</div>
                            <img
                              src={bgUrl}
                              alt="Background 4 (Uploaded)"
                              className="w-full h-24 object-cover rounded"
                            />
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Search Images</label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded pl-10 pr-20 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        placeholder="Search for images..."
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSearchImages();
                          }
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
                        {searchResults.map((imageUrl, index) => {
                          const currentBg = getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo);

                          return (
                            <div
                              key={index}
                              className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${
                                currentBg === imageUrl
                                  ? 'border-blue-500'
                                  : 'border-neutral-800 hover:border-blue-400'
                              }`}
                              onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, imageUrl)}
                            >
                              <div className="text-neutral-400 text-xs mb-1">Search Result {index + 1}</div>
                              <img
                                src={imageUrl}
                                alt={`Search result ${index + 1}`}
                                className="w-full h-24 object-cover rounded"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Upload Image (Image 4)</label>
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

                  <div>
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
