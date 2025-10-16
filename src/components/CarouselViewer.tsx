import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, ZoomOut, Download } from 'lucide-react';

interface CarouselViewerProps {
  slides: string[];
  onClose: () => void;
}

const CarouselViewer: React.FC<CarouselViewerProps> = ({ slides, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
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
    setZoom((prev) => Math.min(Math.max(0.3, prev + delta), 3));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
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
    setZoom((prev) => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.2, 0.3));
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

  const slideWidth = 1080;
  const slideHeight = 1080;
  const gap = 40;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900">
      <div className="absolute top-0 left-0 right-0 h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6 z-10">
        <div className="flex items-center space-x-4">
          <h2 className="text-white font-semibold text-lg">Carousel Viewer</h2>
          <div className="text-slate-400 text-sm">
            {slides.length} slide{slides.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleZoomOut}
            className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <div className="bg-slate-700 text-white px-4 py-2 rounded min-w-[80px] text-center text-sm">
            {Math.round(zoom * 100)}%
          </div>
          <button
            onClick={handleZoomIn}
            className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <div className="w-px h-8 bg-slate-700 mx-2" />
          <button
            onClick={handleDownloadAll}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded transition-colors flex items-center space-x-2"
            title="Download All Slides"
          >
            <Download className="w-5 h-5" />
            <span>Download All</span>
          </button>
          <button
            onClick={onClose}
            className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="absolute inset-0 top-16 overflow-hidden"
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
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
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
                className="relative bg-white rounded-lg shadow-2xl overflow-hidden flex-shrink-0"
                style={{
                  width: `${slideWidth}px`,
                  height: `${slideHeight}px`,
                }}
              >
                <div className="absolute top-2 left-2 bg-black/60 text-white px-3 py-1 rounded-full text-sm font-medium z-10">
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

      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-800/90 backdrop-blur-sm text-slate-300 px-4 py-2 rounded-lg text-sm">
        Use mouse wheel to zoom, drag to pan
      </div>
    </div>
  );
};

export default CarouselViewer;
