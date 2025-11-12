import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Edit, Save, MessageCircle, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CarouselData } from '../../types/carousel';
import { templateService, templateRenderer } from '../../services/carousel';

interface CarouselPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  carouselData: CarouselData | null;
  onEdit: (data: CarouselData) => void;
  onSave: (data: CarouselData) => void;
  onContinue: () => void;
}

const SLIDE_W = 1085;
const SLIDE_H = 1354;
const GAP_X = 60;

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.05;

const MODAL_MAX_W_PX = 1200;
const MODAL_MAX_H_PX = 860;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round2 = (v: number) => Number(v.toFixed(2));

function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const btnCls =
    "p-2 rounded-lg border border-zinc-800/50 hover:bg-zinc-800/30 focus:outline-none focus:ring-2 ring-white/10 transition-colors pointer-events-auto";
  return (
    <div className="flex items-center gap-2 mr-2">
      <button onClick={onZoomOut} className={btnCls} aria-label="Diminuir zoom">
        <ZoomOut className="w-4 h-4" />
      </button>
      <span className="text-xs font-medium tabular-nums w-12 text-center select-none text-zinc-400">
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={onZoomIn} className={btnCls} aria-label="Aumentar zoom">
        <ZoomIn className="w-4 h-4 mr-[20px]" />
      </button>
    </div>
  );
}

export const CarouselPreviewModal: React.FC<CarouselPreviewModalProps> = ({
  isOpen,
  onClose,
  carouselData,
  onEdit,
  onSave,
  onContinue,
}) => {
  const [slidesHtml, setSlidesHtml] = useState<string[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [zoom, setZoom] = useState(0.30);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const modalRootRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const dragState = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number }>({
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
  });

  // Portal root
  useEffect(() => {
    let existing = document.getElementById("modal-root");
    if (!existing) {
      const el = document.createElement("div");
      el.id = "modal-root";
      document.body.appendChild(el);
      existing = el;
    }
    modalRootRef.current = existing as HTMLElement;
  }, []);

  // Fetch e renderiza slides
  useEffect(() => {
    if (!isOpen || !carouselData) return;
    let cancelled = false;
    
    (async () => {
      setIsLoadingPreview(true);
      try {
        const templateId = carouselData.dados_gerais?.template || '1';
        const slides = await templateService.fetchTemplate(templateId);
        
        if (!cancelled && Array.isArray(slides)) {
          const renderedSlides = templateRenderer.renderAllSlides(slides, carouselData);
          setSlidesHtml(renderedSlides);
          
          // Centraliza após carregar
          setTimeout(() => {
            fitToHeight();
          }, 100);
        }
      } catch (error) {
        console.error('Erro ao carregar preview do carrossel:', error);
        if (!cancelled) setSlidesHtml([]);
      } finally {
        if (!cancelled) setIsLoadingPreview(false);
      }
    })();
    
    return () => { cancelled = true; };
  }, [isOpen, carouselData]);

  // Clamp pan
  const clampPan = useCallback((x: number, y: number) => {
    if (!viewportRef.current) return { x, y };
    const vw = viewportRef.current.clientWidth;
    const vh = viewportRef.current.clientHeight;
    const count = Math.max(1, slidesHtml.length);
    const contentW = count * SLIDE_W + Math.max(0, count - 1) * GAP_X;
    const contentH = SLIDE_H;
    const scaledW = contentW * zoom;
    const scaledH = contentH * zoom;
    
    const minX = Math.min(0, vw - scaledW - 100);
    const maxX = Math.max(0, 100);
    const minY = Math.min(0, vh - scaledH - 100);
    const maxY = Math.max(0, 100);
    
    return {
      x: clamp(x, minX, maxX),
      y: clamp(y, minY, maxY),
    };
  }, [zoom, slidesHtml.length]);

  // Fit to height
  const fitToHeight = useCallback(() => {
    if (!viewportRef.current) return;
    const vh = viewportRef.current.clientHeight;
    const count = Math.max(1, slidesHtml.length);
    const contentW = count * SLIDE_W + Math.max(0, count - 1) * GAP_X;
    const z = Math.min((vh - 100) / SLIDE_H, 1);
    setZoom(round2(clamp(z, ZOOM_MIN, ZOOM_MAX)));
    
    setTimeout(() => {
      if (!viewportRef.current) return;
      const vw = viewportRef.current.clientWidth;
      const scaledW = contentW * z;
      const centerX = (vw - scaledW) / 2;
      setPan(clampPan(centerX, 50));
    }, 0);
  }, [slidesHtml.length, clampPan]);

  // Zoom
  const zoomIn = useCallback(() => {
    setZoom((z) => {
      const nz = round2(clamp(z + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
      setPan((p) => clampPan(p.x, p.y));
      return nz;
    });
  }, [clampPan]);

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const nz = round2(clamp(z - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
      setPan((p) => clampPan(p.x, p.y));
      return nz;
    });
  }, [clampPan]);

  // Pan (canvas)
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [pan.x, pan.y]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPan(clampPan(dragState.current.startPanX + dx, dragState.current.startPanY + dy));
  }, [isDragging, clampPan]);

  const endPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
  }, []);

  // Wheel
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const dir = Math.sign(e.deltaY);
      setZoom((z) => {
        const nz = round2(clamp(z - dir * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
        setPan((p) => clampPan(p.x, p.y));
        return nz;
      });
    } else if (e.shiftKey) {
      e.preventDefault();
      setPan((p) => clampPan(p.x - e.deltaY, p.y));
    } else {
      e.preventDefault();
      setPan((p) => clampPan(p.x - e.deltaX, p.y - e.deltaY));
    }
  }, [clampPan]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen || !modalRootRef.current || !carouselData) return null;

  const count = Math.max(1, slidesHtml.length);
  const contentW = count * SLIDE_W + Math.max(0, count - 1) * GAP_X;

  const modal = (
    <AnimatePresence>
      <motion.div
        key="carousel-preview-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        onClick={handleBackdropClick}
        className="fixed inset-0 flex items-center justify-center p-4 md:pl-20 md:pt-16"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.90)', zIndex: 9999999 }}
      >
        <motion.div
          key="carousel-preview-modal"
          ref={containerRef}
          initial={{ y: 12, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 8, opacity: 0, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-black text-white shadow-2xl rounded-2xl border border-zinc-700/50 overflow-hidden relative w-full"
          style={{
            maxWidth: `${MODAL_MAX_W_PX}px`,
            height: `min(85vh, ${MODAL_MAX_H_PX}px)`,
            display: "grid",
            gridTemplateRows: "auto 1fr auto",
            zIndex: 10000000,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-zinc-800/50 bg-black/40 backdrop-blur-sm relative z-20 pointer-events-auto">
            <div className="flex items-center gap-3">
              <h2 className="text-lg md:text-xl font-bold">Preview do Carrossel</h2>
              <span className="text-sm text-zinc-400">
                {carouselData.dados_gerais?.nome || 'Sem título'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ZoomControls zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} />
              <button
                onClick={onClose}
                className="p-2 rounded-lg border border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Canvas */}
          <section className="relative bg-zinc-950" style={{ gridRow: "2 / 3" }}>
            {/* BG grid pattern */}
            <div className="absolute inset-0 z-0 pointer-events-none">
              <div className="w-full h-full bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:20px_20px]" />
            </div>

            {/* Viewport */}
            <div
              ref={viewportRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
              onWheel={onWheel}
              className={`${isDragging ? "cursor-grabbing" : "cursor-grab"} absolute inset-0 z-10`}
              style={{ touchAction: "none", overflow: "hidden", pointerEvents: "auto" }}
            >
              {/* Loader */}
              {isLoadingPreview && (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-300 z-20 pointer-events-none">
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin" />
                    <p className="text-sm font-medium">Carregando slides…</p>
                  </div>
                </div>
              )}

              {/* Pan + Escala */}
              <div
                className="absolute top-0 left-0"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px)`,
                  transformOrigin: "top left",
                  willChange: "transform",
                }}
              >
                <div
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    willChange: "transform",
                  }}
                >
                  {slidesHtml.length > 0 ? (
                    <div
                      className="flex"
                      style={{
                        gap: GAP_X,
                        height: SLIDE_H,
                        width: contentW,
                        marginTop: "34px",
                        marginLeft: "60px",
                        marginRight: "100px",
                      }}
                    >
                      {slidesHtml.map((html, idx) => (
                        <div
                          key={idx}
                          className="relative shadow-2xl rounded-lg overflow-hidden bg-white border border-zinc-800/20"
                          style={{ width: SLIDE_W, height: SLIDE_H, zIndex: 10000001 }}
                        >
                          <iframe
                            title={`Slide ${idx + 1}`}
                            srcDoc={html}
                            className="w-full h-full pointer-events-none"
                            style={{ border: "none" }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    !isLoadingPreview && (
                      <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
                        <p className="text-sm">Nenhum slide para exibir</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Footer com Botões */}
          <div className="px-4 md:px-6 py-3 md:py-4 border-t border-zinc-800/50 bg-black/40 backdrop-blur-sm flex items-center justify-end gap-3 pointer-events-auto">
            <button
              onClick={onContinue}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-black rounded-lg transition-all border border-gray-300"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden md:inline">Continuar no Chat</span>
              <span className="md:hidden">Chat</span>
            </button>
            <button
              onClick={() => onSave(carouselData)}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-black rounded-lg transition-all border border-gray-300"
            >
              <Save className="w-4 h-4" />
              <span className="hidden md:inline">Salvar Carrossel</span>
              <span className="md:hidden">Salvar</span>
            </button>
            <button
              onClick={() => onEdit(carouselData)}
              className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-gray-900 text-white rounded-lg transition-all border border-white/20"
            >
              <Edit className="w-4 h-4" />
              <span className="hidden md:inline">Editar Carrossel</span>
              <span className="md:hidden">Editar</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(modal, modalRootRef.current);
};
