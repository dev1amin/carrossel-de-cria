import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, ZoomOut, Download, ChevronDown, ChevronRight, Layers, Image as ImageIcon, Type, Upload, Search } from 'lucide-react';

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
  }>;
}

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
  const [focusedSlide, setFocusedSlide] = useState<number | null>(null);
  const [selectedElement, setSelectedElement] = useState<{ slideIndex: number; element: ElementType }>({ slideIndex: 0, element: null });
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set([0]));
  const [editedContent, setEditedContent] = useState<Record<string, any>>({});
  const [elementStyles, setElementStyles] = useState<Record<string, ElementStyles>>({});
  const [renderedSlides, setRenderedSlides] = useState<string[]>(slides);
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedElement.element !== null) {
          setSelectedElement({ slideIndex: selectedElement.slideIndex, element: null });
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement, onClose]);

  const injectEditableIds = (html: string, slideIndex: number): string => {
    let result = html;

    result = result.replace(
      /(<[^>]*\{\{title\}\}[^>]*>)/gi,
      `<span id="slide-${slideIndex}-title" data-editable="title" style="display: inline-block;">`
    );

    result = result.replace(/\{\{title\}\}/g, (match) => {
      return `${carouselData.conteudos[slideIndex]?.title || ''}</span>`;
    });

    result = result.replace(
      /(<[^>]*\{\{subtitle\}\}[^>]*>)/gi,
      `<span id="slide-${slideIndex}-subtitle" data-editable="subtitle" style="display: inline-block;">`
    );

    result = result.replace(/\{\{subtitle\}\}/g, (match) => {
      return `${carouselData.conteudos[slideIndex]?.subtitle || ''}</span>`;
    });

    result = result.replace(
      /<style>/i,
      `<style>
        [data-editable] { cursor: pointer; position: relative; }
        [data-editable].selected {
          outline: 2px solid #3B82F6 !important;
          outline-offset: 2px;
        }
        [data-editable]:hover:not(.selected) {
          outline: 2px solid rgba(59, 130, 246, 0.5) !important;
          outline-offset: 2px;
        }
        .bg-element.selected {
          outline: 2px solid #3B82F6 !important;
          outline-offset: -2px;
        }
      `
    );

    result = result.replace(
      /<body([^>]*)>/i,
      `<body$1 id="slide-${slideIndex}-background" data-editable="background" class="bg-element">`
    );

    return result;
  };

  useEffect(() => {
    const newSlides = slides.map((slide, index) => injectEditableIds(slide, index));
    setRenderedSlides(newSlides);
  }, [slides]);

  useEffect(() => {
    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe || !iframe.contentWindow) return;

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;

      const updateElement = (elementId: string, styles?: ElementStyles, content?: string) => {
        const element = iframeDoc.getElementById(elementId);
        if (!element) return;

        if (styles) {
          if (styles.fontSize) element.style.fontSize = styles.fontSize;
          if (styles.fontWeight) element.style.fontWeight = styles.fontWeight;
          if (styles.textAlign) element.style.textAlign = styles.textAlign;
          if (styles.color) element.style.color = styles.color;
        }

        if (content !== undefined) {
          element.textContent = content;
        }
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
        const body = iframeDoc.body;
        if (body) {
          body.style.backgroundImage = `url('${bgImage}')`;
        }
      }
    });
  }, [elementStyles, editedContent]);

  useEffect(() => {
    const setupIframeInteraction = (iframe: HTMLIFrameElement, slideIndex: number) => {
      if (!iframe.contentWindow) return;

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;

      iframeDoc.querySelectorAll('[data-editable]').forEach((element) => {
        const editableType = element.getAttribute('data-editable');

        (element as HTMLElement).onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          iframeDoc.querySelectorAll('[data-editable]').forEach(el => {
            el.classList.remove('selected');
          });

          element.classList.add('selected');

          handleElementClick(slideIndex, editableType as ElementType);
        };
      });
    };

    iframeRefs.current.forEach((iframe, index) => {
      if (iframe) {
        iframe.onload = () => setupIframeInteraction(iframe, index);
        if (iframe.contentDocument?.readyState === 'complete') {
          setupIframeInteraction(iframe, index);
        }
      }
    });
  }, [renderedSlides]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom((prev) => Math.min(Math.max(0.1, prev + delta), 2));
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
    updateEditedValue(slideIndex, 'background', imageUrl);
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
    setSelectedElement({ slideIndex, element });
    setFocusedSlide(slideIndex);
    if (!expandedLayers.has(slideIndex)) {
      toggleLayer(slideIndex);
    }
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
    return elementStyles[key] || {
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
                  <div className="absolute top-3 left-3 bg-black/70 text-white px-2 py-1 rounded text-xs font-medium z-20">
                    {index + 1}
                  </div>
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
                    <select
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      value={getElementStyle(selectedElement.slideIndex, selectedElement.element).fontSize}
                      onChange={(e) => updateElementStyle(selectedElement.slideIndex, selectedElement.element!, 'fontSize', e.target.value)}
                    >
                      <option value="12px">12px</option>
                      <option value="14px">14px</option>
                      <option value="16px">16px</option>
                      <option value="18px">18px</option>
                      <option value="20px">20px</option>
                      <option value="24px">24px</option>
                      <option value="28px">28px</option>
                      <option value="32px">32px</option>
                      <option value="36px">36px</option>
                      <option value="42px">42px</option>
                      <option value="48px">48px</option>
                    </select>
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
                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Background Images</label>
                    <div className="space-y-2">
                      {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo && (
                        <div
                          className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${
                            getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo) === carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo
                              ? 'border-blue-500'
                              : 'border-neutral-800 hover:border-blue-400'
                          }`}
                          onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo)}
                        >
                          <div className="text-neutral-400 text-xs mb-1">Image 1</div>
                          <img
                            src={carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo}
                            alt="Background 1"
                            className="w-full h-24 object-cover rounded"
                          />
                        </div>
                      )}

                      {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo2 && (
                        <div
                          className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${
                            getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo) === carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo2
                              ? 'border-blue-500'
                              : 'border-neutral-800 hover:border-blue-400'
                          }`}
                          onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo2!)}
                        >
                          <div className="text-neutral-400 text-xs mb-1">Image 2</div>
                          <img
                            src={carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo2}
                            alt="Background 2"
                            className="w-full h-24 object-cover rounded"
                          />
                        </div>
                      )}

                      {carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3 && (
                        <div
                          className={`bg-neutral-900 border rounded p-2 cursor-pointer transition-all ${
                            getEditedValue(selectedElement.slideIndex, 'background', carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo) === carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3
                              ? 'border-blue-500'
                              : 'border-neutral-800 hover:border-blue-400'
                          }`}
                          onClick={() => handleBackgroundImageChange(selectedElement.slideIndex, carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3!)}
                        >
                          <div className="text-neutral-400 text-xs mb-1">Image 3</div>
                          <img
                            src={carouselData.conteudos[selectedElement.slideIndex]?.imagem_fundo3}
                            alt="Background 3"
                            className="w-full h-24 object-cover rounded"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Search Images</label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded pl-10 pr-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        placeholder="Search for images..."
                      />
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500" />
                    </div>
                  </div>

                  <div>
                    <label className="text-neutral-400 text-xs mb-2 block font-medium">Upload Image</label>
                    <label className="flex items-center justify-center w-full h-24 bg-neutral-900 border-2 border-dashed border-neutral-800 rounded cursor-pointer hover:border-blue-500 transition-colors">
                      <div className="flex flex-col items-center">
                        <Upload className="w-6 h-6 text-neutral-500 mb-1" />
                        <span className="text-neutral-500 text-xs">Click to upload</span>
                      </div>
                      <input type="file" className="hidden" accept="image/*" />
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CarouselViewer;
