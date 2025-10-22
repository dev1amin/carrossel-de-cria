import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, Download } from "lucide-react";
import type { CarouselData, ElementType, ElementStyles } from "../../types";
import { searchImages } from "../../services";

// ==== submódulos (virão nos próximos passos) ====
import Canvas from "./Canvas";
import { LayersPanel, PropertiesPanel } from "./Panels";
import EditModal from "./EditModal";

// ==== utils centralizados (virão no utils.ts) ====
import {
  ensureStyleTag,
  injectEditableIds,
  setupIframeInteractions,
  findLargestVisual,
  extractTextStyles,
  applyBackgroundImageImmediate,
  clamp,
  computeCover,
  computeCoverBleed,
} from "./utils";

/** ====================== Tipos locais ======================= */
export type TargetKind = "img" | "bg" | "vid";

export type ImageEditModalState =
  | {
      open: true;
      slideIndex: number;
      targetType: TargetKind;
      targetSelector: string; // css selector do alvo dentro do iframe
      imageUrl: string; // para vídeo, é o src do <video>

      // dimensões do slide para preview
      slideW: number;
      slideH: number;

      // ===== IMAGEM/BG =====
      containerHeightPx: number; // altura da máscara
      naturalW: number;
      naturalH: number;
      imgOffsetTopPx: number;
      imgOffsetLeftPx: number;
      targetWidthPx: number;
      targetLeftPx: number;
      targetTopPx: number;

      // ===== VÍDEO (crop real no apply) =====
      isVideo: boolean;
      videoTargetW: number;
      videoTargetH: number;
      videoTargetLeft: number;
      videoTargetTop: number;
      cropX: number;
      cropY: number;
      cropW: number;
      cropH: number;
    }
  | { open: false };

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
  /** ============== Constantes de layout do canvas ============== */
  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  /** ====================== Estado global ======================= */
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

  /** ====================== Refs ======================= */
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const lastSearchId = useRef(0);

  /** ====================== Efeitos base ======================= */

  // preparar srcDoc (injeção de ids/estilos editáveis)
  useEffect(() => {
    const injected = slides.map((s, i) =>
      injectEditableIds(ensureStyleTag(s), i, carouselData.conteudos[i])
    );
    setRenderedSlides(injected);
  }, [slides, carouselData.conteudos]);

  // posiciona no slide 0 ao abrir
  useEffect(() => {
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = 0 * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
    setFocusedSlide(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // setup/atualização dos iframes
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
        applyTextStyles: (doc, id, styles) => {
          const el = doc.getElementById(id);
          if (!el) return;
          if (styles.fontSize)
            el.style.setProperty("font-size", styles.fontSize, "important");
          if (styles.fontWeight)
            el.style.setProperty("font-weight", styles.fontWeight, "important");
          if (styles.textAlign)
            el.style.setProperty("text-align", styles.textAlign, "important");
          if (styles.color)
            el.style.setProperty("color", styles.color, "important");
        },
        extractTextStyles,
      });
    });
  }, [
    elementStyles,
    editedContent,
    originalStyles,
    renderedSlides,
    carouselData.conteudos,
  ]);

  // atalhos de teclado (esc, setas)
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

  /** ====================== Helpers/Selectors ======================= */
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

  /** ====================== Camadas/Slides ======================= */
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

  /** ====================== Abrir/Aplicar Modal ======================= */

  // Abre SEM depender de troca prévia de background
  const openImageEditModal = (slideIndex: number) => {
    const iframe = iframeRefs.current[slideIndex];
    if (!iframe) return;

    const ready = () => {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      // alvo: selecionado -> maior visual -> fallback genérico
      const selected =
        (doc.querySelector("[data-editable].selected") as HTMLElement | null) ||
        null;
      const largest = findLargestVisual(doc)?.el || null;
      const chosen =
        selected ||
        largest ||
        (doc.querySelector("img,video,body,div,section") as HTMLElement | null);
      if (!chosen) return;

      if (!chosen.id) chosen.id = `edit-${Date.now()}`;
      const targetSelector = `#${chosen.id}`;

      const cs = doc.defaultView?.getComputedStyle(chosen);
      let imageUrl = "";
      let targetType: TargetKind = "img";
      let isVideo = false;

      if (chosen.tagName === "VIDEO") {
        const video = chosen as HTMLVideoElement;
        const sourceEl = video.querySelector("source") as HTMLSourceElement | null;
        imageUrl = video.currentSrc || video.src || sourceEl?.src || "";
        targetType = "vid";
        isVideo = true;
      } else if (chosen.tagName === "IMG") {
        imageUrl = (chosen as HTMLImageElement).src || "";
        targetType = "img";
      } else {
        // BG
        const bg =
          cs?.backgroundImage && cs.backgroundImage.includes("url(")
            ? cs.backgroundImage.match(/url\(["']?(.+?)["']?\)/i)?.[1] || ""
            : "";
        imageUrl =
          bg ||
          chosen.getAttribute("data-bg-image-url") ||
          editedContent[`${slideIndex}-background`] ||
          uploadedImages[slideIndex] ||
          carouselData.conteudos[slideIndex]?.thumbnail_url ||
          carouselData.conteudos[slideIndex]?.imagem_fundo ||
          carouselData.conteudos[slideIndex]?.imagem_fundo2 ||
          carouselData.conteudos[slideIndex]?.imagem_fundo3 ||
          "";
        targetType = "bg";
      }
      if (!imageUrl) return;

      // métricas do alvo
      const r = chosen.getBoundingClientRect();
      const bodyRect = doc.body.getBoundingClientRect();
      const targetLeftPx = r.left - bodyRect.left;
      const targetTopPx = r.top - bodyRect.top;
      const targetWidthPx = r.width;
      const targetHeightPx = r.height;

      // abrir conforme tipo
      if (isVideo) {
        const video = chosen as HTMLVideoElement;
        const videoW = targetWidthPx;
        const videoH = targetHeightPx;

        setImageModal({
          open: true,
          slideIndex,
          targetType: "vid",
          targetSelector,
          imageUrl,
          slideW: slideWidth,
          slideH: slideHeight,

          // placeholders para IMAGEM
          containerHeightPx: targetHeightPx,
          naturalW: video.videoWidth || videoW,
          naturalH: video.videoHeight || videoH,
          imgOffsetTopPx: 0,
          imgOffsetLeftPx: 0,
          targetWidthPx,
          targetLeftPx,
          targetTopPx,

          // vídeo
          isVideo: true,
          videoTargetW: videoW,
          videoTargetH: videoH,
          videoTargetLeft: targetLeftPx,
          videoTargetTop: targetTopPx,
          cropX: 0,
          cropY: 0,
          cropW: videoW,
          cropH: videoH,
        });
        document.documentElement.style.overflow = "hidden";
        return;
      }

      // imagem/bg
      const finalizeOpenImg = (natW: number, natH: number) => {
        const contW = targetWidthPx;
        const contH = targetHeightPx;
        const { displayW, displayH } = computeCover(natW, natH, contW, contH);

        // centraliza por padrão (sem mostrar fundo)
        const startLeft = (contW - displayW) / 2; // <= 0
        const startTop = (contH - displayH) / 2; // <= 0

        let imgOffsetTopPx = startTop;
        let imgOffsetLeftPx = startLeft;

        if (targetType === "img") {
          const top = parseFloat((chosen as HTMLImageElement).style.top || `${startTop}`);
          const left = parseFloat((chosen as HTMLImageElement).style.left || `${startLeft}`);
          const minLeft = contW - displayW;
          const minTop = contH - displayH;
          imgOffsetTopPx = clamp(isNaN(top) ? startTop : top, minTop, 0);
          imgOffsetLeftPx = clamp(isNaN(left) ? startLeft : left, minLeft, 0);
        } else if (targetType === "bg") {
          const cs2 = doc.defaultView?.getComputedStyle(chosen);
          const bgPosY = cs2?.backgroundPositionY || "50%";
          const bgPosX = cs2?.backgroundPositionX || "50%";
          const toPerc = (v: string) => (v.endsWith("%") ? parseFloat(v) / 100 : 0.5);
          const maxOffsetX = Math.max(0, displayW - contW);
          const maxOffsetY = Math.max(0, displayH - contH);
          const offX = -toPerc(bgPosX) * maxOffsetX;
          const offY = -toPerc(bgPosY) * maxOffsetY;
          imgOffsetTopPx = clamp(isNaN(offY) ? startTop : offY, contH - displayH, 0);
          imgOffsetLeftPx = clamp(isNaN(offX) ? startLeft : offX, contW - displayW, 0);
        }

        setImageModal({
          open: true,
          slideIndex,
          targetType,
          targetSelector,
          imageUrl,
          slideW: slideWidth,
          slideH: slideHeight,
          containerHeightPx: contH,
          naturalW: natW,
          naturalH: natH,
          imgOffsetTopPx,
          imgOffsetLeftPx,
          targetWidthPx,
          targetLeftPx,
          targetTopPx,

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
      };

      const tmp = new Image();
      tmp.src = imageUrl;
      if (tmp.complete && tmp.naturalWidth && tmp.naturalHeight) {
        finalizeOpenImg(tmp.naturalWidth, tmp.naturalHeight);
      } else {
        tmp.onload = () =>
          finalizeOpenImg(
            tmp.naturalWidth || targetWidthPx,
            tmp.naturalHeight || targetHeightPx
          );
      }
    };

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc && doc.readyState === "complete") {
      ready();
    } else {
      const t = setTimeout(ready, 60);
      setTimeout(() => clearTimeout(t), 500);
    }
  };

  // aplica alterações do modal no iframe alvo
  const applyImageEditModal = () => {
    if (!imageModal.open) return;

    const {
      slideIndex,
      targetType,
      targetSelector,
      imageUrl,
      containerHeightPx,
      imgOffsetTopPx,
      imgOffsetLeftPx,
      naturalW,
      naturalH,
      targetWidthPx,
      isVideo,
      videoTargetW,
      videoTargetH,
      cropX,
      cropY,
      cropW,
      cropH,
    } = imageModal;

    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!doc) {
      setImageModal({ open: false });
      document.documentElement.style.overflow = "";
      return;
    }
    const el = doc.querySelector(targetSelector) as HTMLElement | null;
    if (!el) {
      setImageModal({ open: false });
      document.documentElement.style.overflow = "";
      return;
    }

    if (isVideo && targetType === "vid") {
      // crop real em <video> via wrapper + overflow:hidden
      const vid = el as HTMLVideoElement;
      let wrapper = vid.parentElement;
      if (!wrapper || !wrapper.classList.contains("vid-crop-wrapper")) {
        const w = doc.createElement("div");
        w.className = "vid-crop-wrapper";
        w.style.display = "inline-block";
        w.style.position = "relative";
        w.style.overflow = "hidden";
        w.style.borderRadius =
          doc.defaultView?.getComputedStyle(vid).borderRadius || "";
        if (vid.parentNode) vid.parentNode.replaceChild(w, vid);
        w.appendChild(vid);
        wrapper = w;
      }
      (wrapper as HTMLElement).style.width = `${cropW}px`;
      (wrapper as HTMLElement).style.height = `${cropH}px`;

      vid.style.position = "absolute";
      vid.style.left = `${-cropX}px`;
      vid.style.top = `${-cropY}px`;
      vid.style.width = `${videoTargetW}px`;
      vid.style.height = `${videoTargetH}px`;
      vid.style.objectFit = "cover";
      if (vid.src !== imageUrl) vid.src = imageUrl;

      setImageModal({ open: false });
      document.documentElement.style.overflow = "";
      return;
    }

    // imagem/bg
    if (targetType === "img") {
      // garante wrapper para máscara
      let wrapper = el.parentElement;
      if (!wrapper || !wrapper.classList.contains("img-crop-wrapper")) {
        const w = doc.createElement("div");
        w.className = "img-crop-wrapper";
        w.style.display = "inline-block";
        w.style.position = "relative";
        w.style.overflow = "hidden";
        w.style.borderRadius =
          doc.defaultView?.getComputedStyle(el).borderRadius || "";
        if (el.parentNode) el.parentNode.replaceChild(w, el);
        w.appendChild(el);
        wrapper = w;
      }
      (wrapper as HTMLElement).style.width = `${targetWidthPx}px`;
      (wrapper as HTMLElement).style.height = `${containerHeightPx}px`;

      // cover com bleed para evitar “fundos” no limite
      const scale = Math.max(targetWidthPx / naturalW, containerHeightPx / naturalH);
      const displayW = Math.ceil(naturalW * scale) + 2;
      const displayH = Math.ceil(naturalH * scale) + 2;

      const minLeft = targetWidthPx - displayW; // <= 0
      const minTop = containerHeightPx - displayH; // <= 0

      const safeLeft = clamp(
        isNaN(imgOffsetLeftPx) ? (minLeft / 2) : imgOffsetLeftPx,
        minLeft,
        0
      );
      const safeTop = clamp(
        isNaN(imgOffsetTopPx) ? (minTop / 2) : imgOffsetTopPx,
        minTop,
        0
      );

      el.style.position = "absolute";
      el.style.width = `${displayW}px`;
      el.style.height = `${displayH}px`;
      el.style.left = `${safeLeft}px`;
      el.style.top = `${safeTop}px`;
      (el as HTMLImageElement).removeAttribute("srcset");
      (el as HTMLImageElement).removeAttribute("sizes");
      (el as HTMLImageElement).loading = "eager";
      if ((el as HTMLImageElement).src !== imageUrl)
        (el as HTMLImageElement).src = imageUrl;
      (el as HTMLImageElement).style.objectFit = "cover";
      (el as HTMLImageElement).style.backfaceVisibility = "hidden";
      (el as HTMLImageElement).style.transform = "translateZ(0)";
    } else if (targetType === "bg") {
      const scale = Math.max(targetWidthPx / naturalW, containerHeightPx / naturalH);
      const displayW = Math.ceil(naturalW * scale);
      const displayH = Math.ceil(naturalH * scale);

      const maxOffsetX = Math.max(0, displayW - targetWidthPx);
      const maxOffsetY = Math.max(0, displayH - containerHeightPx);

      let xPerc = maxOffsetX ? (-imgOffsetLeftPx / maxOffsetX) * 100 : 50;
      let yPerc = maxOffsetY ? (-imgOffsetTopPx / maxOffsetY) * 100 : 50;
      if (!isFinite(xPerc)) xPerc = 50;
      if (!isFinite(yPerc)) yPerc = 50;

      el.style.setProperty("background-image", `url('${imageUrl}')`, "important");
      el.style.setProperty("background-repeat", "no-repeat", "important");
      el.style.setProperty("background-size", "cover", "important");
      el.style.setProperty("background-position-x", `${xPerc}%`, "important");
      el.style.setProperty("background-position-y", `${yPerc}%`, "important");
      el.style.setProperty("height", `${containerHeightPx}px`, "important");
      if (
        (doc.defaultView?.getComputedStyle(el).position || "static") === "static"
      )
        el.style.position = "relative";
    }

    setImageModal({ open: false });
    document.documentElement.style.overflow = "";
  };

  /** ====================== Render ======================= */
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
          // math helpers para o modal (usa mesma lógica)
          computeCover={computeCover}
          computeCoverBleed={computeCoverBleed}
          clamp={clamp}
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