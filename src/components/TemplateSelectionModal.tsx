import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ZoomIn, ZoomOut, CircleSlash } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TemplateConfig, AVAILABLE_TEMPLATES } from "../types/template";
import { templateService } from "../services/template";

interface TemplateSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
  postCode: string;
  brand?: {
    bg?: string; // container bg
    card?: string; // lista bg
    border?: string;
    text?: string;
    muted?: string;
    hover?: string;
    accent?: string; // ring/roxo sutil
  };
}

// Paleta: preto, branco, roxo mínimo
const defaultBrand = {
  bg: "bg-black",
  card: "bg-zinc-900",
  border: "border-zinc-800",
  text: "text-white",
  muted: "text-zinc-400",
  hover: "hover:bg-zinc-800/70",
  accent: "ring-purple-500/40",
};

const SLIDE_W = 1095; // tamanho real de cada slide
const SLIDE_H = 1350;
const GAP_X = 80; // espaço entre slides no canvas

const TemplateSelectionModal: React.FC<TemplateSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  postCode,
  brand,
}) => {
  const theme = useMemo(() => ({ ...defaultBrand, ...(brand || {}) }), [brand]);

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateConfig>(
    AVAILABLE_TEMPLATES[0]
  );
  const [slidesHtml, setSlidesHtml] = useState<string[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // zoom/pan do CANVAS (não escala os iframes individualmente)
  const [zoom, setZoom] = useState(0.35); // 35% para caber 1080×1350
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number }>({ startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  const modalRootRef = useRef<HTMLElement | null>(null);
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Portal root
  useEffect(() => {
    const existing = document.getElementById("modal-root");
    if (existing) { modalRootRef.current = existing as HTMLElement; return; }
    const el = document.createElement("div");
    el.id = "modal-root";
    document.body.appendChild(el);
    modalRootRef.current = el;
  }, []);

  // Carrega TODOS os slides
  useEffect(() => {
    const loadPreview = async () => {
      if (!selectedTemplate || !isOpen) return;
      setIsLoadingPreview(true);
      try {
        const slides = await templateService.fetchTemplate(selectedTemplate.id);
        setSlidesHtml(Array.isArray(slides) ? slides : []);
      } catch (err) {
        console.error("Failed to load template preview:", err);
        setSlidesHtml([]);
      } finally {
        setIsLoadingPreview(false);
      }
    };
    loadPreview();
  }, [selectedTemplate, isOpen]);

  // ESC + scroll lock
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (isOpen) {
      document.addEventListener("keydown", onEsc);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.removeEventListener("keydown", onEsc); document.body.style.overflow = prev || ""; };
    }
  }, [isOpen, onClose]);

  // Focus trap simples
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => { (firstFocusableRef.current || closeBtnRef.current)?.focus(); }, 40);
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const c = document.getElementById("template-modal");
      if (!c) return;
      const focusables = c.querySelectorAll<HTMLElement>('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    };
    document.addEventListener("keydown", handleTab);
    return () => { clearTimeout(t); document.removeEventListener("keydown", handleTab); };
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); };
  const handleGenerate = () => { onSelectTemplate(selectedTemplate.id); onClose(); };

  // Drag-to-pan 2D do viewport
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!viewportRef.current) return;
    setIsDragging(true);
    viewportRef.current.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, scrollLeft: viewportRef.current.scrollLeft, scrollTop: viewportRef.current.scrollTop };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !viewportRef.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    viewportRef.current.scrollLeft = dragState.current.scrollLeft - dx;
    viewportRef.current.scrollTop = dragState.current.scrollTop - dy;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!viewportRef.current) return;
    setIsDragging(false);
    try { viewportRef.current.releasePointerCapture(e.pointerId); } catch {}
  };

  // Wheel: nativo (trackpad ok). Ctrl/Cmd + wheel => zoom (opcional)
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const dir = Math.sign(e.deltaY);
      setZoom((z) => {
        const next = Math.min(2, Math.max(0.05, Number((z - dir * 0.05).toFixed(2))));
        return next;
      });
    }
  };

  const fitToHeight = () => {
    const vp = document.getElementById("slides-viewport");
    if (!vp) return;
    const h = vp.clientHeight - 32;
    const newZoom = Math.max(0.05, Math.min(2, h / SLIDE_H));
    setZoom(Number(newZoom.toFixed(2)));
  };

  if (!isOpen || !modalRootRef.current) return null;

  const totalCanvasWidth = slidesHtml.length * SLIDE_W + Math.max(0, slidesHtml.length - 1) * GAP_X;
  const modal = (
    <AnimatePresence>
      <motion.div
        key="template-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        aria-hidden={false}
        role="dialog"
        aria-modal="true"
        onClick={handleBackdropClick}
        className="fixed inset-0 z-[9999] flex items-center justify-center"
      >
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

        <motion.div
          key="template-modal"
          id="template-modal"
          initial={{ y: 12, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 8, opacity: 0, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          onClick={(e) => e.stopPropagation()}
          className={`relative w-[min(100%,1000px)] md:w-[min(92vw,1400px)] ${theme.bg} ${theme.text} shadow-2xl rounded-2xl border ${theme.border} overflow-hidden`}
          style={{ maxHeight: "86vh" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b sticky top-0 bg-black/90 backdrop-blur-md border-zinc-800 z-10">
            <h2 className="text-xl md:text-2xl font-bold">Selecionar Template</h2>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2 mr-2">
                <button onClick={() => setZoom((z) => Math.max(0.05, Number((z - 0.05).toFixed(2))))} className="p-2 rounded-md border border-zinc-800 hover:bg-zinc-900" aria-label="Diminuir zoom"><ZoomOut className="w-4 h-4"/></button>
                <span className="text-sm tabular-nums w-12 text-center">{Math.round(zoom*100)}%</span>
                <button onClick={() => setZoom((z) => Math.min(2, Number((z + 0.05).toFixed(2))))} className="p-2 rounded-md border border-zinc-800 hover:bg-zinc-900" aria-label="Aumentar zoom"><ZoomIn className="w-4 h-4"/></button>
                <button onClick={() => setZoom(0.35)} className="p-2 rounded-md border border-zinc-800 hover:bg-zinc-900" aria-label="Reset zoom" title="Reset zoom"><CircleSlash className="w-4 h-4"/></button>
                <button onClick={fitToHeight} className="p-2 rounded-md border border-zinc-800 hover:bg-zinc-900" aria-label="Ajustar à altura">Fit</button>
              </div>
              <button ref={closeBtnRef} onClick={onClose} aria-label="Fechar" className="p-2 rounded-xl border border-zinc-800 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Conteúdo: lista x canvas */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-0">
            {/* Lista */}
            <div className={`md:col-span-4 border-r ${theme.border} overflow-y-auto`} style={{ maxHeight: "calc(86vh - 64px - 72px)" }}>
              <div className="p-3 md:p-4 space-y-3">
                {AVAILABLE_TEMPLATES.map((template, idx) => {
                  const isActive = selectedTemplate.id === template.id;
                  return (
                    <button
                      key={template.id}
                      ref={idx === 0 ? firstFocusableRef : undefined}
                      onClick={() => setSelectedTemplate(template)}
                      className={`group w-full text-left rounded-xl border ${theme.border} ${theme.card} ${theme.hover} transition-all focus:outline-none focus:ring-2 ${theme.accent} ${isActive ? 'ring-2 ring-offset-0 border-purple-700/50' : ''}`}
                    >
                      <div className="flex items-center gap-3 p-3">
                        <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-white/10 bg-zinc-800">
                          <img src={template.thumbnail} alt={template.name} className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold truncate">{template.name}</h3>
                            {isActive && (<span className="ml-2 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-purple-600 text-white">selecionado</span>)}
                          </div>
                          <p className={`mt-1 text-sm line-clamp-2 ${theme.muted}`}>{template.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Canvas preview */}
            <div id="slides-viewport" className="md:col-span-8 relative bg-zinc-950" style={{ maxHeight: "calc(86vh - 64px - 72px)" }}>
              {/* grid de fundo */}
              <div className="absolute inset-0">
                <div className="w-full h-full bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:16px_16px]" />
              </div>

              <div className="relative h-full w-full flex flex-col">
                {/* Controles mobile */}
                <div className="md:hidden flex items-center gap-2 p-3 border-b border-zinc-900">
                  <button onClick={() => setZoom((z) => Math.max(0.05, Number((z - 0.05).toFixed(2))))} className="p-2 rounded-md border border-zinc-800"><ZoomOut className="w-4 h-4"/></button>
                  <span className="text-sm tabular-nums w-12 text-center">{Math.round(zoom*100)}%</span>
                  <button onClick={() => setZoom((z) => Math.min(2, Number((z + 0.05).toFixed(2))))} className="p-2 rounded-md border border-zinc-800"><ZoomIn className="w-4 h-4"/></button>
                  <button onClick={() => setZoom(0.35)} className="p-2 rounded-md border border-zinc-800"><CircleSlash className="w-4 h-4"/></button>
                  <button onClick={fitToHeight} className="p-2 rounded-md border border-zinc-800">Fit</button>
                </div>

                {/* Viewport com pan/scroll */}
                <div
                  ref={viewportRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onWheel={onWheel}
                  className={`relative flex-1 overflow-auto select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                >
                  {isLoadingPreview ? (
                    <div className="h-full w-full flex items-center justify-center text-zinc-300">
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-10 h-10 animate-spin" />
                        <p className="text-sm">Carregando slides…</p>
                      </div>
                    </div>
                  ) : slidesHtml.length ? (
                    <div className="min-w-full min-h-full px-6 py-4">
                      {/* CANVAS com transform scale (zoom global) e origin top-left */}
                      <div
                        className="relative origin-top-left"
                        style={{ width: totalCanvasWidth, height: SLIDE_H, transform: `scale(${zoom})` }}
                      >
                        <div className="absolute top-0 left-0 flex items-start" style={{ gap: GAP_X }}>
                          {slidesHtml.map((html, idx) => (
                            <div key={idx} className="relative shadow-2xl rounded-xl overflow-hidden bg-white border border-zinc-200" style={{ width: SLIDE_W, height: SLIDE_H }}>
                              <iframe title={`Slide ${idx + 1}`} srcDoc={html} className="w-full h-full" sandbox="allow-scripts" />
                              <div className="absolute -top-2 -left-2 bg-black text-white text-[10px] px-2 py-0.5 rounded-md shadow border border-zinc-800">{idx + 1}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-zinc-400">Preview não disponível</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={`px-5 md:px-6 py-4 border-t ${theme.border} bg-black/90 backdrop-blur-sm sticky bottom-0`}>
            <button onClick={handleGenerate} className={`w-full inline-flex items-center justify-center gap-2 font-semibold py-3 px-4 rounded-xl shadow-lg transition-all active:scale-[0.99] bg-white text-black hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-400/30`}>
              <span>Gerar {selectedTemplate.name}</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(modal, modalRootRef.current);
};

export default TemplateSelectionModal;