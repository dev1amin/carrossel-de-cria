import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TemplateConfig, AVAILABLE_TEMPLATES } from "../types/template";
import { templateService } from "../services/template";

interface TemplateSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
  postCode: string;
  /**
   * Cores do tema (opcional). Se você já usa CSS variables no <html>,
   * o modal herda automaticamente. Caso queira forçar, passe aqui.
   */
  brand?: {
    bg?: string; // Tailwind class p/ fundo do container
    gradientFrom?: string; // ex: from-purple-600
    gradientTo?: string;   // ex: to-pink-600
    card?: string;         // ex: bg-neutral-800
    border?: string;       // ex: border-neutral-700
    text?: string;         // ex: text-neutral-100
    muted?: string;        // ex: text-neutral-400
    hover?: string;        // ex: hover:bg-neutral-750 (custom)
  };
}

const defaultBrand = {
  bg: "bg-neutral-900",
  gradientFrom: "from-purple-600",
  gradientTo: "to-pink-600",
  card: "bg-neutral-800",
  border: "border-neutral-700",
  text: "text-neutral-100",
  muted: "text-neutral-400",
  hover: "hover:bg-neutral-700/70",
};

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
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const modalRootRef = useRef<HTMLElement | null>(null);
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Mount portal root (once)
  useEffect(() => {
    const existing = document.getElementById("modal-root");
    if (existing) {
      modalRootRef.current = existing as HTMLElement;
      return;
    }
    const el = document.createElement("div");
    el.id = "modal-root";
    document.body.appendChild(el);
    modalRootRef.current = el;
  }, []);

  // Load preview when template changes or opens
  useEffect(() => {
    const loadPreview = async () => {
      if (!selectedTemplate || !isOpen) return;
      setIsLoadingPreview(true);
      try {
        const slides = await templateService.fetchTemplate(selectedTemplate.id);
        setPreviewHtml(slides && slides.length > 0 ? slides[0] : null);
      } catch (error) {
        console.error("Failed to load template preview:", error);
        setPreviewHtml(null);
      } finally {
        setIsLoadingPreview(false);
      }
    };
    loadPreview();
  }, [selectedTemplate, isOpen]);

  // ESC + scroll lock
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // Bloqueio de scroll global
      const { overflow: prev } = document.body.style;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = prev || "";
      };
    }
  }, [isOpen, onClose]);

  // Focus trap simples
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      (firstFocusableRef.current || closeBtnRef.current)?.focus();
    }, 50);
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const container = document.getElementById("template-modal");
      if (!container) return;
      const focusables = container.querySelectorAll<HTMLElement>(
        'a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleGenerate = () => {
    onSelectTemplate(selectedTemplate.id);
    onClose();
  };

  if (!isOpen || !modalRootRef.current) return null;

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
        {/* Backdrop real (não é só um gradiente fraco) */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

        {/* Container do modal */}
        <motion.div
          key="template-modal"
          id="template-modal"
          initial={{ y: 12, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 8, opacity: 0, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          onClick={(e) => e.stopPropagation()}
          className={`relative w-[min(100%,1000px)] md:w-[min(92vw,1100px)] ${theme.bg} ${theme.text} shadow-2xl rounded-2xl border ${theme.border} overflow-hidden`}
          style={{ maxHeight: "86vh" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b sticky top-0 bg-neutral-900/95 backdrop-blur-sm border-neutral-800/80 z-10">
            <h2 className="text-xl md:text-2xl font-bold">Selecionar Template</h2>
            <button
              ref={closeBtnRef}
              onClick={onClose}
              aria-label="Fechar"
              className="p-2 rounded-xl border border-transparent hover:border-neutral-700 hover:bg-neutral-800/60 focus:outline-none focus:ring-2 focus:ring-white/20"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Conteúdo: lista x preview */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-0">
            {/* Lista de templates */}
            <div className={`md:col-span-5 border-r ${theme.border} overflow-y-auto`} style={{ maxHeight: "calc(86vh - 64px - 88px)" }}>
              <div className="p-3 md:p-4 space-y-3">
                {AVAILABLE_TEMPLATES.map((template, idx) => {
                  const isActive = selectedTemplate.id === template.id;
                  return (
                    <button
                      key={template.id}
                      ref={idx === 0 ? firstFocusableRef : undefined}
                      onClick={() => setSelectedTemplate(template)}
                      className={`group w-full text-left rounded-xl border ${theme.border} ${theme.card} ${theme.hover} transition-all focus:outline-none focus:ring-2 focus:ring-white/15 ${
                        isActive
                          ? `ring-2 ring-offset-0 ring-white/20 border-white/30`
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 p-3">
                        <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-white/10">
                          {/* thumb */}
                          <img
                            src={template.thumbnail}
                            alt={template.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                          {!template.thumbnail && (
                            <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400">
                              sem thumb
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold truncate">
                              {template.name}
                            </h3>
                            {isActive && (
                              <span
                                className={`ml-2 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-gradient-to-r ${theme.gradientFrom} ${theme.gradientTo} text-white`}
                              >
                                selecionado
                              </span>
                            )}
                          </div>
                          <p className={`mt-1 text-sm line-clamp-2 ${theme.muted}`}>
                            {template.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preview */}
            <div className="md:col-span-7 relative" style={{ maxHeight: "calc(86vh - 64px - 88px)" }}>
              <div className="h-full w-full flex items-center justify-center p-4 md:p-6 bg-neutral-950">
                {isLoadingPreview ? (
                  <div className="flex flex-col items-center gap-4 text-neutral-300">
                    <Loader2 className="w-10 h-10 animate-spin" />
                    <p className="text-sm">Carregando preview…</p>
                  </div>
                ) : previewHtml ? (
                  <div className="w-full h-full max-w-[420px] max-h-[720px] flex items-center justify-center">
                    <div className="bg-white rounded-xl shadow-2xl w-[360px] h-[600px] overflow-hidden border border-neutral-200">
                      <iframe
                        title={`Preview ${selectedTemplate.name}`}
                        srcDoc={previewHtml}
                        className="w-full h-full"
                        sandbox="allow-scripts"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-neutral-400">Preview não disponível</div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={`px-5 md:px-6 py-4 border-t ${theme.border} bg-neutral-900/90 backdrop-blur-sm sticky bottom-0`}>
            <button
              onClick={handleGenerate}
              className={`w-full inline-flex items-center justify-center gap-2 font-semibold py-3 px-4 rounded-xl shadow-lg transition-all active:scale-[0.99] bg-gradient-to-r ${theme.gradientFrom} ${theme.gradientTo} text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-white/20`}
            >
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