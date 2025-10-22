// src/components/CarouselViewer/CarouselViewer.tsx
import React, { useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, Download } from "lucide-react";
import type { CarouselData, ElementType, ElementStyles } from "../../types";
import { searchImages } from "../../services";

// Subcomponentes (entregarei depois)
import Canvas from "./Canvas";
import { LayersPanel, PropertiesPanel } from "./Panels";
import EditModal from "./EditModal";

// Utils centralizados (entregarei depois)
import {
  // tipos
  TargetKind,
  ImageEditModalState,
  // html/iframe
  ensureStyleTag,
  injectEditableIds,
  setupIframeInteractions,
  applyBackgroundImageImmediate,
  // cálculo visual
  clamp,
  // modal helpers
  openEditModalForSlide,
  applyModalEdits,
} from "./utils";

/** ====================== Props ======================= */
interface CarouselViewerProps {
  slides: string[];
  carouselData: CarouselData;
  onClose: () => void;
}

/** ====================== Componente ======================= */
const CarouselViewer: React.FC<CarouselViewerProps> = ({
  slides,
  carouselData,
  onClose,
}) => {
  /** ===== Layout do canvas ===== */
  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  /** ===== Estado global ===== */
  const [zoom, setZoom] = useState(0.35);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [focusedSlide, setFocusedSlide] = useState<number>(0);
  const [selectedElement, setSelectedElement] = useState<{
    slideIndex: number;
    element: ElementType;
  }>({ slideIndex: 0, element: null });

  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(
    () => new Set([0])
  );

  const [editedContent, setEditedContent] = useState<Record<string, any>>({});
  const [elementStyles, setElementStyles] = useState<
    Record<string, ElementStyles>
  >({});
  const [originalStyles, setOriginalStyles] = useState<
    Record<string, ElementStyles>
  >({});
  const [renderedSlides, setRenderedSlides] = useState<string[]>(slides);

  const [isLoadingProperties, setIsLoadingProperties] = useState(false);
  const [isEditingInline, setIsEditingInline] = useState<{
    slideIndex: number;
    element: ElementType;
  } | null>(null);

  // busca/imagem
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<Record<number, string>>(
    {}
  );

  // modal
  const [imageModal, setImageModal] = useState<ImageEditModalState>({
    open: false,
  });

  /** ===== Refs ===== */
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const lastSearchId = useRef(0);

  /** ====================== Efeitos ======================= */

  useEffect(() => {
  setSelectedElement({ slideIndex: 0, element: "background" });
  setExpandedLayers(s => new Set(s).add(0));
}, []);

  // prepara srcDoc (injeção de ids e marcações editáveis)
  useEffect(() => {
    const injected = slides.map((s, i) =>
      injectEditableIds(ensureStyleTag(s), i, carouselData.conteudos[i])
    );
    setRenderedSlides(injected);
  }, [slides, carouselData.conteudos]);

  // posiciona no slide 0 ao abrir
  useEffect(() => {
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition =
      0 * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
    setFocusedSlide(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // configura interações dentro dos iframes
  useEffect(() => {
    iframeRefs.current.forEach((iframe, index) => {
      if (!iframe) return;
      setupIframeInteractions({
        iframe,
        index,
        selectedImageRefs,
        elementStyles,
        editedContent,
        originalStyles,
        setOriginalStyles,
        setIsEditingInline,
        setEditedContent,
        carouselConteudo: carouselData.conteudos[index],
      });
    });
  }, [
    elementStyles,
    editedContent,
    originalStyles,
    renderedSlides,
    carouselData.conteudos,
  ]);

  // atalhos: ESC fecha; setas trocam slide
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (imageModal.open) {
          setImageModal({ open: false });
          document.documentElement.style.overflow = "";
          return;
        }
        if (selectedElement.element !== null) {
          setSelectedElement({
            slideIndex: selectedElement.slideIndex,
            element: null,
          });
          return;
        }
        onClose();
      }
      if (e.key === "ArrowRight") {
        handleSlideClick(Math.min(focusedSlide + 1, slides.length - 1));
      }
      if (e.key === "ArrowLeft") {
        handleSlideClick(Math.max(focusedSlide - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageModal.open, selectedElement, onClose, focusedSlide, slides.length]);

  /** ====================== Helpers ======================= */
  const getElementKey = (slideIndex: number, element: ElementType) =>
    `${slideIndex}-${element}`;

  const getElementStyle = (
    slideIndex: number,
    element: ElementType
  ): ElementStyles => {
    const k = getElementKey(slideIndex, element);
    if (elementStyles[k]) return elementStyles[k];
    if (originalStyles[k]) return originalStyles[k];
    return {
      fontSize: element === "title" ? "24px" : "16px",
      fontWeight: element === "title" ? "700" : "400",
      textAlign: "left",
      color: "#FFFFFF",
    };
  };

  const getEditedValue = (slideIndex: number, field: string, def: any) => {
    const k = `${slideIndex}-${field}`;
    return editedContent[k] !== undefined ? editedContent[k] : def;
  };

  /** ====================== Setters ======================= */
  const updateEditedValue = (slideIndex: number, field: string, value: any) => {
    const k = `${slideIndex}-${field}`;
    setEditedContent((prev) => ({ ...prev, [k]: value }));
  };

  const updateElementStyle = (
    slideIndex: number,
    element: ElementType,
    prop: keyof ElementStyles,
    value: string
  ) => {
    const k = getElementKey(slideIndex, element);
    setElementStyles((prev) => ({
      ...prev,
      [k]: { ...getElementStyle(slideIndex, element), [prop]: value },
    }));
  };

  /** ====================== Slides / Layers ======================= */
  const toggleLayer = (index: number) => {
    const s = new Set(expandedLayers);
    s.has(index) ? s.delete(index) : s.add(index);
    setExpandedLayers(s);
  };

  const handleSlideClick = (index: number) => {
    // limpa seleções visuais dentro dos iframes
    iframeRefs.current.forEach((iframe) => {
      const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
      if (!doc) return;
      doc
        .querySelectorAll('[data-editable].selected')
        .forEach((el) => el.classList.remove("selected"));
    });

    setFocusedSlide(index);
    setSelectedElement({ slideIndex: index, element: null });
    selectedImageRefs.current[index] = null;

    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition =
      index * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
  };

  const handleElementClick = (slideIndex: number, element: ElementType) => {
    setIsLoadingProperties(true);

    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (doc && element) {
      doc
        .querySelectorAll("[data-editable]")
        .forEach((el) => el.classList.remove("selected"));
      const target = doc.getElementById(`slide-${slideIndex}-${element}`);
      if (target) target.classList.add("selected");
      else if (element === "background") doc.body.classList.add("selected");
    }

    setSelectedElement({ slideIndex, element });
    setFocusedSlide(slideIndex);
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setTimeout(() => setIsLoadingProperties(false), 80);
  };

  /** ====================== Background / Upload / Busca ======================= */
  const handleBackgroundImageChange = (slideIndex: number, imageUrl: string) => {
    const updatedEl = applyBackgroundImageImmediate(
      iframeRefs.current[slideIndex],
      slideIndex,
      imageUrl
    );

    // limpa seleções
    iframeRefs.current.forEach((f) => {
      const d = f?.contentDocument || f?.contentWindow?.document;
      if (!d) return;
      d
        .querySelectorAll("[data-editable]")
        .forEach((el) => el.classList.remove("selected"));
    });

    if (updatedEl) {
      updatedEl.classList.add("selected");
      const isImg = updatedEl.tagName === "IMG";
      selectedImageRefs.current[slideIndex] = isImg
        ? (updatedEl as HTMLImageElement)
        : null;
    }

    setSelectedElement({ slideIndex, element: "background" });
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setFocusedSlide(slideIndex);
    updateEditedValue(slideIndex, "background", imageUrl);
  };

  const handleImageUpload = (
    slideIndex: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setUploadedImages((prev) => ({ ...prev, [slideIndex]: url }));
      handleBackgroundImageChange(slideIndex, url);
    };
    reader.readAsDataURL(file);
  };

  const handleSearchImages = async () => {
    if (!searchKeyword.trim()) return;
    setIsSearching(true);
    const id = ++lastSearchId.current;
    try {
      const imageUrls = await searchImages(searchKeyword);
      if (id === lastSearchId.current) setSearchResults(imageUrls);
    } catch (e) {
      console.error(e);
    } finally {
      if (id === lastSearchId.current) setIsSearching(false);
    }
  };

  /** ====================== Download ======================= */
  const handleDownloadAll = () => {
    renderedSlides.forEach((slide, index) => {
      const blob = new Blob([slide], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `slide-${index + 1}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  /** ====================== Modal: abrir/aplicar ======================= */  
const openImageEditModal = (slideIndex: number) => {
  const log = (...a: any[]) => console.log("[CV][openImageEditModal]", ...a);

  const tryOpen = (iframe: HTMLIFrameElement | null, tag: string) => {
    log("tryOpen", { tag, hasIframe: !!iframe, slideIndex });
    if (!iframe) return false;
    const state = openEditModalForSlide({
      iframe,
      slideIndex,
      slideW: slideWidth,
      slideH: slideHeight,
      editedContent,
      uploadedImages,
      carouselData,
    });
    log("openEditModalForSlide:state", { ok: !!state, state });
    if (!state) return false;
    setImageModal(state);
    document.documentElement.style.overflow = "hidden";
    return true;
  };

  // 1) tenta via ref
  if (tryOpen(iframeRefs.current[slideIndex], "ref")) return;

  // 2) tenta via DOM
  const domIframe = document.querySelector<HTMLIFrameElement>(
    `iframe[title="Slide ${slideIndex + 1}"]`
  );
  if (tryOpen(domIframe, "domQuery")) return;

  // 3) tenta no próximo frame
  requestAnimationFrame(() => {
    const again =
      iframeRefs.current[slideIndex] ||
      document.querySelector<HTMLIFrameElement>(`iframe[title="Slide ${slideIndex + 1}"]`);
    if (tryOpen(again, "raf")) return;

    // 4) FALLBACK BRUTO: abre modal mesmo sem iframe, usando dados do slide
    const c = carouselData.conteudos[slideIndex] || {};
    const fallbackUrl =
      editedContent[`${slideIndex}-background`] ||
      uploadedImages[slideIndex] ||
      c.thumbnail_url ||
      c.imagem_fundo ||
      c.imagem_fundo2 ||
      c.imagem_fundo3 ||
      "";

    console.warn("[CV][openImageEditModal] HARD FALLBACK", {
      slideIndex,
      hasRef: !!iframeRefs.current[slideIndex],
      hasDomQuery: !!domIframe,
      fallbackUrl,
    });

    if (!fallbackUrl) return; // sem URL não tem o que editar

    // Estado mínimo para abrir o modal como BG do slide inteiro
    setImageModal({
      open: true,
      slideIndex,
      targetType: "bg",
      targetSelector: "body",
      imageUrl: fallbackUrl,
      slideW: slideWidth,
      slideH: slideHeight,
      containerHeightPx: slideHeight,
      naturalW: 1080,
      naturalH: 1350,
      imgOffsetTopPx: 0,
      imgOffsetLeftPx: 0,
      targetWidthPx: slideWidth,
      targetLeftPx: 0,
      targetTopPx: 0,
      isVideo: false,
      videoTargetW: 0,
      videoTargetH: 0,
      videoTargetLeft: 0,
      videoTargetTop: 0,
      cropX: 0,
      cropY: 0,
      cropW: 0,
      cropH: 0,
    });
    document.documentElement.style.overflow = "hidden";
  });
};

  const applyImageEditModal = () => {
    if (!imageModal.open) return;
    const iframe = iframeRefs.current[imageModal.slideIndex];
    applyModalEdits(imageModal, iframe);
    setImageModal({ open: false });
    document.documentElement.style.overflow = "";
  };

  /** ====================== TopBar ======================= */
  const topBar = (
    <div className="h-14 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-6">
      <div className="flex items-center space-x-4">
        <h2 className="text-white font-semibold">Carousel Editor</h2>
        <div className="text-neutral-500 text-sm">{slides.length} slides</div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setZoom((p) => Math.max(0.1, p - 0.1))}
          className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
          title="Zoom Out"
          disabled={imageModal.open}
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="bg-neutral-800 text-white px-3 py-1.5 rounded text-xs min-w-[70px] text-center">
          {Math.round(zoom * 100)}%
        </div>
        <button
          onClick={() => setZoom((p) => Math.min(2, p + 0.1))}
          className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded transition-colors"
          title="Zoom In"
          disabled={imageModal.open}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-neutral-800 mx-2" />
        <button
          onClick={handleDownloadAll}
          className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded transition-colors flex items-center space-x-2 text-sm"
          title="Download All Slides"
          disabled={imageModal.open}
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
  );

  /** ====================== Render ======================= */
  return (
    <div className="fixed top-14 left-16 right-0 bottom-0 z-[90] bg-neutral-900 flex">
      {/* Modal */}
      {imageModal.open && (
        <EditModal
          state={imageModal}
          renderedSlides={renderedSlides}
          onApply={applyImageEditModal}
          onClose={() => {
            setImageModal({ open: false });
            document.documentElement.style.overflow = "";
          }}
        />
      )}

      {/* Painel esquerdo */}
      <LayersPanel
        slides={slides}
        carouselData={carouselData}
        expandedLayers={expandedLayers}
        focusedSlide={focusedSlide}
        selectedElement={selectedElement}
        onToggleLayer={toggleLayer}
        onSlideClick={handleSlideClick}
        onSelectElement={handleElementClick}
      />

      {/* Área central */}
      <div className="flex-1 flex flex-col">
        {topBar}
        <Canvas
          renderedSlides={renderedSlides}
          iframeRefs={iframeRefs}
          containerRef={containerRef}
          zoom={zoom}
          pan={pan}
          setPan={setPan}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          dragStart={dragStart}
          setDragStart={setDragStart}
          focusedSlide={focusedSlide}
          slideWidth={slideWidth}
          slideHeight={slideHeight}
          gap={gap}
          imageModalOpen={imageModal.open}
        />
      </div>

      {/* Painel direito */}
      <PropertiesPanel
        selectedElement={selectedElement}
        isLoadingProperties={isLoadingProperties}
        carouselData={carouselData}
        editedContent={editedContent}
        elementStyles={elementStyles}
        getElementStyle={getElementStyle}
        getEditedValue={getEditedValue}
        updateEditedValue={updateEditedValue}
        updateElementStyle={updateElementStyle}
        onOpenEditModal={() => openImageEditModal(selectedElement.slideIndex)}
        onBackgroundChange={handleBackgroundImageChange}
        searchKeyword={searchKeyword}
        setSearchKeyword={setSearchKeyword}
        onSearchImages={handleSearchImages}
        isSearching={isSearching}
        searchResults={searchResults}
        onUploadImage={handleImageUpload}
        uploadedImages={uploadedImages}
        isVideoUrl={(u: string) => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(u)}
      />
    </div>
  );
};

export default CarouselViewer;