// src/components/CarouselViewer/Canvas.tsx
import React from "react";

type Props = {
  renderedSlides: string[];
  iframeRefs: React.MutableRefObject<(HTMLIFrameElement | null)[]>;
  containerRef: React.RefObject<HTMLDivElement>;

  zoom: number;
  pan: { x: number; y: number };
  setPan: (p: { x: number; y: number }) => void;

  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  dragStart: { x: number; y: number };
  setDragStart: (p: { x: number; y: number }) => void;

  focusedSlide: number;

  slideWidth: number;
  slideHeight: number;
  gap: number;

  imageModalOpen: boolean;
};

const Canvas: React.FC<Props> = ({
  renderedSlides,
  iframeRefs,
  containerRef,

  zoom,
  pan,
  setPan,

  isDragging,
  setIsDragging,
  dragStart,
  setDragStart,

  focusedSlide,

  slideWidth,
  slideHeight,
  gap,

  imageModalOpen,
}) => {
  const totalWidth = slideWidth * renderedSlides.length + gap * (renderedSlides.length - 1);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative bg-neutral-800"
      style={{ cursor: imageModalOpen ? "default" : isDragging ? "grabbing" : "grab" }}
      onWheel={(e) => {
        if (imageModalOpen) return;
        e.preventDefault();
        setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }}
      onMouseDown={(e) => {
        if (imageModalOpen) return;
        if (e.button === 0 && e.currentTarget === e.target) {
          setIsDragging(true);
          setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
      }}
      onMouseMove={(e) => {
        if (imageModalOpen) return;
        if (isDragging) {
          setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
      }}
      onMouseUp={() => !imageModalOpen && setIsDragging(false)}
      onMouseLeave={() => !imageModalOpen && setIsDragging(false)}
    >
      <div
        className="absolute"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center center",
          transition: isDragging ? "none" : "transform 0.25s ease-out",
          left: "50%",
          top: "50%",
          marginLeft: `-${totalWidth / 2}px`,
          marginTop: `-${slideHeight / 2}px`,
          zIndex: 1,
          pointerEvents: imageModalOpen ? "none" : "auto",
        }}
      >
        <div className="flex items-start" style={{ gap: `${gap}px` }}>
          {renderedSlides.map((slide, i) => (
            <div
              key={i}
              className={`relative bg-white rounded-lg shadow-2xl overflow-hidden flex-shrink-0 transition-all ${
                focusedSlide === i ? "ring-4 ring-blue-500" : ""
              }`}
              style={{ width: `${slideWidth}px`, height: `${slideHeight}px` }}
            >
              <iframe
                ref={(el) => (iframeRefs.current[i] = el)}
                srcDoc={slide}
                className="w-full h-full border-0"
                title={`Slide ${i + 1}`}
                // restringe o mínimo necessário pra edição dentro do iframe
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
  );
};

export default Canvas;