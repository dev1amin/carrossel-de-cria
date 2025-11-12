import React, { useState, useEffect, useRef } from 'react';

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
  onBackgroundClick?: () => void;
}

export const CanvasArea: React.FC<CanvasAreaProps> = ({
  zoom,
  pan,
  isDragging,
  dragStart,
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
  onBackgroundClick,
}) => {
  const [currentPan, setPan] = useState(pan); // Estado para pan
  const containerRef = useRef<HTMLDivElement>(null);
  const isMouseDown = useRef(false); // Flag para detectar mouseDown
  const lastClientPosition = useRef({ x: 0, y: 0 });

  const speedFactor = 2; // Fator de velocidade (aumente o valor para mais rápido)

  // Função para atualização de pan
  const updatePan = (newPan: { x: number; y: number }) => {
    setPan(newPan);
    console.log("Pan atualizado:", newPan); // Log do pan atualizado
  };

  // Função que lida com o movimento do scroll (wheel)
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault(); // Previne o comportamento padrão do scroll

    console.log("Evento de wheel detectado", e); // Log do evento wheel

    if (isDragging) {
      console.log("Ignorando wheel enquanto arrastando"); // Log quando estiver arrastando
      // Se estiver arrastando, não faz nada
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      console.log("Zoom com Ctrl/Meta + Scroll", e.deltaY); // Log de zoom
      // Zoom com Ctrl ou Meta + Scroll
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      // Você pode atualizar o zoom aqui
      // setZoom(zoom + delta);
    } else if (e.shiftKey) {
      console.log("Pan horizontal com Shift + Scroll", e.deltaY); // Log de pan horizontal com Shift
      // Pan horizontal com Shift + Scroll
      setPan((prevPan) => ({
        x: prevPan.x - e.deltaY, // Movimento horizontal com deltaY
        y: prevPan.y,
      }));
    } else {
      console.log("Pan geral com Scroll normal", e.deltaX, e.deltaY); // Log de pan normal
      // Pan normal (horizontal e vertical)
      setPan((prevPan) => ({
        x: prevPan.x - e.deltaX, // Movimento horizontal com deltaX
        y: prevPan.y - e.deltaY, // Movimento vertical com deltaY
      }));
    }
  };

  // Função de mouseDown (início do drag)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log("Mouse Down detectado", e); // Log de mouseDown
    isMouseDown.current = true;
    lastClientPosition.current = { x: e.clientX, y: e.clientY };
    // Iniciar o arraste
    onMouseDown(e);
  };

  // Função de mouseMove (movimento durante o drag)
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMouseDown.current) return; // Se não estiver pressionado, não faz nada

    // Diferença no movimento do mouse, multiplicado pelo fator de velocidade
    const dx = (e.clientX - lastClientPosition.current.x) * speedFactor;
    const dy = (e.clientY - lastClientPosition.current.y) * speedFactor;

    console.log("Movimento do mouse:", dx, dy); // Log de movimento do mouse

    // Atualiza a posição de pan com base na diferença do movimento do mouse
    updatePan({
      x: currentPan.x + dx,
      y: currentPan.y + dy,
    });

    // Atualiza a última posição do mouse
    lastClientPosition.current = { x: e.clientX, y: e.clientY };
  };

  // Função de mouseUp (final do drag)
  const handleMouseUp = () => {
    console.log("Mouse Up detectado, arraste terminado"); // Log de mouseUp
    isMouseDown.current = false;
    onMouseUp();
  };

  // Função de mouseLeave (deixar área do canvas)
  const handleMouseLeave = () => {
    console.log("Mouse Leave detectado, cancelando arraste"); // Log de mouseLeave
    isMouseDown.current = false;
    onMouseLeave();
  };

  useEffect(() => {
    const container = containerRef.current;

    // Adicionando o listener de 'wheel'
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    // Limpeza do efeito
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [isDragging]);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-zinc-950 min-h-0"
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none', // Impede o comportamento padrão de gestos
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).className?.includes('bg-[radial-gradient')) {
            onBackgroundClick?.();
          }
        }}
      >
        {/* BG grid pattern */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="w-full h-full bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:20px_20px]" />
        </div>

        {/* Container com slides */}
        <div
          className="absolute"
          style={{
            transform: `translate(${currentPan.x}px, ${currentPan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.3s ease-out',
            left: '50%',
            top: '50%',
            // Posiciona para mostrar o primeiro slide à esquerda
            // Ajuste fino: centro - slideWidth - gap (ajustado para -4060px)
            marginLeft: `-${(slideWidth * slides.length + gap * (slides.length - 1)) / 2 - slideWidth - gap * 11}px`,
            marginTop: `-${slideHeight / 2}px`,
            zIndex: 10,
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