import React, { useRef } from 'react';

interface CanvasAreaProps {
  zoom: number;
  pan: { x: number; y: number };
  isDragging: boolean;
  dragStart: { x: number; y: number };
  slideWidth: number;
  slideHeight: number;
  gap: number;
  slides: string[];
  renderedSlides: string[];
  focusedSlide: number;
  iframeRefs: React.MutableRefObject<(HTMLIFrameElement | null)[]>;
  onWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
}

export const CanvasArea: React.FC<CanvasAreaProps> = ({
  zoom,
  pan,
  isDragging,
  slideWidth,
  slideHeight,
  gap,
  slides,
  renderedSlides,
  focusedSlide,
  iframeRefs,
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-neutral-800 min-h-0"
        style={{ 
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none' // Previne comportamento padrão de gestos
        }}
        onWheel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onWheel(e);
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
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
                  sandbox="allow-same-origin allow-scripts allow-autoplay"
                  style={{ pointerEvents: 'auto' }}
                />
                {/* Camada transparente para capturar eventos de scroll */}
                <div 
                  className="absolute inset-0 pointer-events-none"
                  style={{ zIndex: 10 }}
                  onWheel={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
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
  );
};
