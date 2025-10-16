import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, ZoomOut, Download, ChevronDown, ChevronRight, Image as ImageIcon, Type } from 'lucide-react';

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

const CarouselViewer: React.FC<CarouselViewerProps> = ({ slides, carouselData, onClose }) => {
  const [zoom, setZoom] = useState(0.6);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [focusedSlide, setFocusedSlide] = useState<number | null>(null);
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.min(Math.max(0.2, prev + delta), 2));
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
    setZoom((prev) => Math.min(prev + 0.2, 2));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.2, 0.2));
  };

  const handleDownloadAll = () => {
    slides.forEach((slide, index) => {
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
    const slideWidth = 1080;
    const gap = 40;
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = index * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;

    setPan({ x: -slidePosition * zoom, y: 0 });
  };

  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-800 flex">
      <div className="flex-1 flex flex-col">
        <div className="h-16 bg-neutral-900 border-b border-neutral-700 flex items-center justify-between px-6 z-10">
          <div className="flex items-center space-x-4">
            <h2 className="text-white font-semibold text-lg">Carousel Editor</h2>
            <div className="text-neutral-400 text-sm">
              {slides.length} slide{slides.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleZoomOut}
              className="bg-neutral-700 hover:bg-neutral-600 text-white p-2 rounded transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <div className="bg-neutral-700 text-white px-4 py-2 rounded min-w-[80px] text-center text-sm">
              {Math.round(zoom * 100)}%
            </div>
            <button
              onClick={handleZoomIn}
              className="bg-neutral-700 hover:bg-neutral-600 text-white p-2 rounded transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <div className="w-px h-8 bg-neutral-700 mx-2" />
            <button
              onClick={handleDownloadAll}
              className="bg-neutral-700 hover:bg-neutral-600 text-white px-4 py-2 rounded transition-colors flex items-center space-x-2"
              title="Download All Slides"
            >
              <Download className="w-5 h-5" />
              <span>Download All</span>
            </button>
            <button
              onClick={onClose}
              className="bg-neutral-700 hover:bg-neutral-600 text-white p-2 rounded transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative"
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
              {slides.map((slide, index) => (
                <div
                  key={index}
                  className={`relative bg-white rounded-lg shadow-2xl overflow-hidden flex-shrink-0 cursor-pointer transition-all ${
                    focusedSlide === index ? 'ring-4 ring-blue-500' : ''
                  }`}
                  style={{
                    width: `${slideWidth}px`,
                    height: `${slideHeight}px`,
                  }}
                  onClick={() => handleSlideClick(index)}
                >
                  <div className="absolute top-3 left-3 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium z-10">
                    {index + 1}
                  </div>
                  <iframe
                    srcDoc={slide}
                    className="w-full h-full border-0"
                    title={`Slide ${index + 1}`}
                    sandbox="allow-same-origin"
                    style={{ pointerEvents: 'none' }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="h-12 bg-neutral-900 border-t border-neutral-700 flex items-center justify-center">
          <div className="text-neutral-400 text-sm">
            Use mouse wheel to zoom • Drag to pan • Click slide to focus
          </div>
        </div>
      </div>

      <div className="w-80 bg-neutral-900 border-l border-neutral-700 flex flex-col">
        <div className="h-16 border-b border-neutral-700 flex items-center px-4">
          <h3 className="text-white font-semibold">Layers</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          {slides.map((_, index) => {
            const conteudo = carouselData.conteudos[index];
            const isExpanded = expandedLayers.has(index);
            const isFocused = focusedSlide === index;

            return (
              <div key={index} className={`border-b border-neutral-700 ${isFocused ? 'bg-blue-900/20' : ''}`}>
                <button
                  onClick={() => {
                    toggleLayer(index);
                    handleSlideClick(index);
                  }}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-800 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-neutral-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-neutral-400" />
                    )}
                    <span className="text-white font-medium">Slide {index + 1}</span>
                  </div>
                </button>

                {isExpanded && conteudo && (
                  <div className="px-4 pb-3 space-y-3">
                    <div className="ml-6 space-y-2">
                      <div className="flex items-start space-x-2 text-sm">
                        <Type className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-neutral-400 text-xs mb-1">Title</div>
                          <div className="text-white break-words">{conteudo.title}</div>
                        </div>
                      </div>

                      {conteudo.subtitle && (
                        <div className="flex items-start space-x-2 text-sm">
                          <Type className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="text-neutral-400 text-xs mb-1">Subtitle</div>
                            <div className="text-white break-words">{conteudo.subtitle}</div>
                          </div>
                        </div>
                      )}

                      {conteudo.imagem_fundo && (
                        <div className="flex items-start space-x-2 text-sm">
                          <ImageIcon className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="text-neutral-400 text-xs mb-1">Background Image</div>
                            <img
                              src={conteudo.imagem_fundo}
                              alt="Background"
                              className="w-full h-20 object-cover rounded border border-neutral-700"
                            />
                          </div>
                        </div>
                      )}

                      {conteudo.imagem_fundo2 && (
                        <div className="flex items-start space-x-2 text-sm">
                          <ImageIcon className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="text-neutral-400 text-xs mb-1">Image 2</div>
                            <img
                              src={conteudo.imagem_fundo2}
                              alt="Image 2"
                              className="w-full h-20 object-cover rounded border border-neutral-700"
                            />
                          </div>
                        </div>
                      )}

                      {conteudo.imagem_fundo3 && (
                        <div className="flex items-start space-x-2 text-sm">
                          <ImageIcon className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="text-neutral-400 text-xs mb-1">Image 3</div>
                            <img
                              src={conteudo.imagem_fundo3}
                              alt="Image 3"
                              className="w-full h-20 object-cover rounded border border-neutral-700"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CarouselViewer;
