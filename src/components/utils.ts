// src/components/CarouselViewer/utils.ts
import type { CarouselData, ElementStyles, ElementType } from "../../types";

/* ===================== Tipos usados pelo container ===================== */
export type TargetKind = "img" | "bg" | "vid";

const DEBUG = true;
const dlog = (...args: any[]) => { if (DEBUG) console.log("[CV][utils]", ...args); };

export type ImageEditModalState =
  | {
      open: true;
      slideIndex: number;
      targetType: TargetKind;
      targetSelector: string;
      imageUrl: string;

      slideW: number;
      slideH: number;

      // IMAGEM/BG
      containerHeightPx: number;
      naturalW: number;
      naturalH: number;
      imgOffsetTopPx: number;
      imgOffsetLeftPx: number;
      targetWidthPx: number;
      targetLeftPx: number;
      targetTopPx: number;

      // VÍDEO
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

/* ===================== Utils genéricos ===================== */
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const isVideoUrl = (url: string) => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
const isImgurUrl = (url: string) => url.includes("i.imgur.com");

/* ===================== Helpers de imagem ===================== */
function pickFromSrcset(srcset: string | null | undefined): string {
  if (!srcset) return "";
  // pega a última (normalmente maior)
  const parts = srcset.split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.length) return "";
  const last = parts[parts.length - 1];
  const url = last.split(/\s+/)[0];
  return url || "";
}

function resolveImgUrl(img: HTMLImageElement): string {
  const ds = img.getAttribute("data-src") || img.getAttribute("data-lazy") || img.getAttribute("data-original") || "";
  const fromSet = pickFromSrcset(img.getAttribute("srcset"));
  return img.currentSrc || img.src || ds || fromSet || "";
}

/* ===================== DOM helpers ===================== */
export function ensureStyleTag(html: string): string {
  if (/<style>/i.test(html)) return html;
  return html.replace(
    /<head([^>]*)>/i,
    `<head$1><style>
      [data-editable]{cursor:pointer!important;position:relative;display:inline-block!important}
      [data-editable].selected{outline:3px solid #3B82F6!important;outline-offset:2px;z-index:1000}
      [data-editable]:hover:not(.selected){outline:2px solid rgba(59,130,246,.5)!important;outline-offset:2px}
      [data-editable][contenteditable="true"]{outline:3px solid #10B981!important;outline-offset:2px;background:rgba(16,185,129,.1)!important}
      img[data-editable]{display:block!important}
    </style>`
  );
}

export function injectEditableIds(
  html: string,
  slideIndex: number,
  conteudo?: { title?: string; subtitle?: string }
): string {
  let result = html;

  const addEditableSpan = (text: string, id: string, attr: string) => {
    const lines = text.split("\n").filter((l) => l.trim());
    lines.forEach((line) => {
      const escaped = line.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(>[^<]*)(${escaped})([^<]*<)`, "gi");
      result = result.replace(
        re,
        (m, b, t, a) =>
          `${b}<span id="${id}" data-editable="${attr}" contenteditable="false">${t}</span>${a}`
      );
    });
  };

  if (conteudo?.title) addEditableSpan(conteudo.title, `slide-${slideIndex}-title`, "title");
  if (conteudo?.subtitle)
    addEditableSpan(conteudo.subtitle, `slide-${slideIndex}-subtitle`, "subtitle");

  // marca body como background editável
  result = result.replace(
    /<body([^>]*)>/i,
    `<body$1 id="slide-${slideIndex}-background" data-editable="background">`
  );

  return result;
}

function rgbToHex(rgb: string): string {
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return rgb;
  const [r, g, b] = m.map((v) => parseInt(v, 10));
  const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function extractTextStyles(doc: Document, el: HTMLElement): ElementStyles {
  const cs = doc.defaultView?.getComputedStyle(el);
  if (!cs)
    return { fontSize: "16px", fontWeight: "400", textAlign: "left", color: "#FFFFFF" };
  const color = cs.color || "#FFFFFF";
  return {
    fontSize: cs.fontSize || "16px",
    fontWeight: cs.fontWeight || "400",
    textAlign: (cs.textAlign as any) || "left",
    color: color.startsWith("rgb") ? rgbToHex(color) : color,
  };
}

function findLargestVisual(doc: Document): { type: TargetKind; el: HTMLElement } | null {
  let best: { type: TargetKind; el: HTMLElement; area: number } | null = null;

  const push = (type: TargetKind, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (area <= 9000) return;
    if (!best || area > best.area) best = { type, el, area };
  };

  // imagens
  Array.from(doc.querySelectorAll("img")).forEach((im) => {
    const img = im as HTMLImageElement;
    if (img.getAttribute("data-protected") === "true" || isImgurUrl(img.src)) return;
    push("img", img);
  });

  // vídeos
  Array.from(doc.querySelectorAll("video")).forEach((v) => push("vid", v as HTMLElement));

  // bg em elementos grandes
  Array.from(doc.querySelectorAll<HTMLElement>("body,div,section,header,main,figure,article")).forEach(
    (el) => {
      const cs = doc.defaultView?.getComputedStyle(el);
      if (cs?.backgroundImage && cs.backgroundImage.includes("url(")) push("bg", el);
    }
  );

  if (best) return { type: best.type, el: best.el };
  return null;
}

/* ===================== Setup Iframes ===================== */
export function setupIframeInteractions(args: {
  iframe: HTMLIFrameElement;
  index: number;
  selectedImageRefs: React.MutableRefObject<Record<number, HTMLImageElement | null>>;
  elementStyles: Record<string, ElementStyles>;
  editedContent: Record<string, any>;
  originalStyles: Record<string, ElementStyles>;
  setOriginalStyles: React.Dispatch<React.SetStateAction<Record<string, ElementStyles>>>;
  setIsEditingInline: React.Dispatch<
    React.SetStateAction<{ slideIndex: number; element: ElementType } | null>
  >;
  setEditedContent: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  carouselConteudo: any;

  onPick: (slideIndex: number, element: ElementType) => void;
}) {
  const {
    iframe,
    index,
    selectedImageRefs,
    elementStyles,
    editedContent,
    originalStyles,
    setOriginalStyles,
    setIsEditingInline,
    setEditedContent,
    carouselConteudo,
    onPick,
  } = args;

  dlog("setupIframeInteractions:init", { index, readyState: iframe.contentDocument?.readyState });

  const applyTextAndStyles = (doc: Document, id: string, key: string) => {
    const el = doc.getElementById(id);
    if (!el) return;
    // aplica estilos
    const styles = elementStyles[key] || originalStyles[key];
    if (styles) {
      if (styles.fontSize) el.style.setProperty("font-size", styles.fontSize, "important");
      if (styles.fontWeight) el.style.setProperty("font-weight", styles.fontWeight, "important");
      if (styles.textAlign) el.style.setProperty("text-align", styles.textAlign, "important");
      if (styles.color) el.style.setProperty("color", styles.color, "important");
    }
    // conteúdo (se não estiver em edição inline)
    const k = key;
    const content =
      editedContent[k] !== undefined
        ? editedContent[k]
        : k.endsWith("-title")
        ? carouselConteudo?.title || ""
        : k.endsWith("-subtitle")
        ? carouselConteudo?.subtitle || ""
        : "";
    if (content && el.getAttribute("contenteditable") !== "true") el.textContent = content;

    // captura estilos originais 1x
    setTimeout(() => {
      if (!originalStyles[key]) {
        const styles = extractTextStyles(doc, el as HTMLElement);
        setOriginalStyles((p) => ({ ...p, [key]: styles }));
      }
    }, 50);
  };

  const ready = () => {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    dlog("iframe:ready", { index, hasDoc: !!doc });
    if (!doc) return;

    // marca imagens editáveis + ids + normaliza URL (corrige lazy/srcset)
    const imgs = Array.from(doc.querySelectorAll("img")) as HTMLImageElement[];
    let imgIdx = 0;
    imgs.forEach((img) => {
      if (isImgurUrl(img.src) && !img.getAttribute("data-protected"))
        img.setAttribute("data-protected", "true");
      if (img.getAttribute("data-protected") !== "true") {
        img.setAttribute("data-editable", "image");
        if (!img.id) img.id = `slide-${index}-img-${imgIdx++}`;
      }
      // segurança visual
      img.style.objectFit = "cover";

      // **NORMALIZAÇÃO CRÍTICA**
      const resolved = resolveImgUrl(img);
      if (resolved && img.src !== resolved) {
        img.removeAttribute("srcset");
        img.removeAttribute("sizes");
        img.loading = "eager";
        img.src = resolved;
      }
    });

    // aplica conteúdo/estilos de title/subtitle
    applyTextAndStyles(doc, `slide-${index}-title`, `${index}-title`);
    applyTextAndStyles(doc, `slide-${index}-subtitle`, `${index}-subtitle`);

    // aplica bg salvo (se houver)
    const bg = editedContent[`${index}-background`];
    if (bg) {
      const best = findLargestVisual(doc);
      if (best?.type === "img") {
        const el = best.el as HTMLImageElement;
        el.removeAttribute("srcset");
        el.removeAttribute("sizes");
        el.loading = "eager";
        el.src = bg;
        el.setAttribute("data-bg-image-url", bg);
        el.style.objectFit = "cover";
        el.style.width = "100%";
        el.style.height = "100%";
      } else {
        (best?.el || doc.body).style.setProperty(
          "background-image",
          `url('${bg}')`,
          "important"
        );
        (best?.el || doc.body).style.setProperty("background-size", "cover", "important");
        (best?.el || doc.body).style.setProperty("background-repeat", "no-repeat", "important");
        (best?.el || doc.body).style.setProperty("background-position", "center", "important");
      }
    }

    // listeners para seleção/edição inline
    const editable = doc.querySelectorAll("[data-editable]");
    editable.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const type = htmlEl.getAttribute("data-editable") as string;

      htmlEl.style.pointerEvents = "auto";
      htmlEl.style.cursor = "pointer";

      htmlEl.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        doc.querySelectorAll("[data-editable]").forEach((x) => x.classList.remove("selected"));
        htmlEl.classList.add("selected");
        // se clicar numa IMG marcamos a ref — e avisamos o React
        if (htmlEl.tagName === "IMG") {
          selectedImageRefs.current[index] = htmlEl as HTMLImageElement;
          onPick(index, "background"); // mantém semântica atual do container
        } else if (type === "background") {
          onPick(index, "background");
        }
      };

      if (type === "title" || type === "subtitle") {
        htmlEl.ondblclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          htmlEl.setAttribute("contenteditable", "true");
          htmlEl.focus();
          onPick(index, type as ElementType);

          const range = doc.createRange();
          range.selectNodeContents(htmlEl);
          const sel = iframe.contentWindow?.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        };

        htmlEl.onblur = () => {
          if (htmlEl.getAttribute("contenteditable") === "true") {
            htmlEl.setAttribute("contenteditable", "false");
            const newContent = htmlEl.textContent || "";
            const k = `${index}-${type}`;
            setEditedContent((prev) => ({ ...prev, [k]: newContent }));
            onPick(index, null);
          }
        };

        htmlEl.onkeydown = (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            htmlEl.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            htmlEl.blur();
          }
        };
      }
    });
  };

  // attach
  iframe.onload = () => { dlog("iframe:onload", { index }); setTimeout(ready, 60); };
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (doc && doc.readyState === "complete") { dlog("iframe:already-complete", { index }); setTimeout(ready, 60); }
}

/* ===================== Aplicar bg imediatamente ===================== */
export function applyBackgroundImageImmediate(
  iframe: HTMLIFrameElement | null | undefined,
  slideIndex: number,
  imageUrl: string
): HTMLElement | null {
  if (!iframe || !iframe.contentWindow) return null;
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  if (!doc) return null;

  // se houver <img> selecionada elegível, priorize
  const selected = doc.querySelector("[data-editable].selected") as HTMLElement | null;
  if (selected?.tagName === "IMG" && selected.getAttribute("data-protected") !== "true") {
    const img = selected as HTMLImageElement;
    if (!isVideoUrl(imageUrl)) {
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.loading = "eager";
      img.src = imageUrl;
      img.setAttribute("data-bg-image-url", imageUrl);
      img.style.objectFit = "cover";
      img.style.width = "100%";
      img.style.height = "100%";
      return img;
    }
  }

  const best = findLargestVisual(doc);
  if (best) {
    if (best.type === "img") {
      const img = best.el as HTMLImageElement;
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.loading = "eager";
      img.src = imageUrl;
      img.setAttribute("data-bg-image-url", imageUrl);
      img.style.objectFit = "cover";
      img.style.width = "100%";
      img.style.height = "100%";
      return img;
    } else {
      best.el.style.setProperty("background-image", `url('${imageUrl}')`, "important");
      best.el.style.setProperty("background-size", "cover", "important");
      best.el.style.setProperty("background-repeat", "no-repeat", "important");
      best.el.style.setProperty("background-position", "center", "important");
      return best.el;
    }
  }

  doc.body.style.setProperty("background-image", `url('${imageUrl}')`, "important");
  doc.body.style.setProperty("background-size", "cover", "important");
  doc.body.style.setProperty("background-repeat", "no-repeat", "important");
  doc.body.style.setProperty("background-position", "center", "important");
  return doc.body;
}

/* ===================== Abrir modal (descobrir alvo/URL) ===================== */
export function openEditModalForSlide(args: {
  iframe: HTMLIFrameElement;
  slideIndex: number;
  slideW: number;
  slideH: number;
  editedContent: Record<string, any>;
  uploadedImages: Record<number, string>;
  carouselData: CarouselData;
}): ImageEditModalState | null {
  const { iframe, slideIndex, slideW, slideH, editedContent, uploadedImages, carouselData } = args;

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) { dlog("openEditModalForSlide: no document", { slideIndex }); return null; }

  const selected = doc.querySelector("[data-editable].selected") as HTMLElement | null;
  const largestFound = findLargestVisual(doc);
  const largest = largestFound?.el || null;

  const c = carouselData.conteudos[slideIndex] || {};
  const fallbackUrl =
    editedContent[`${slideIndex}-background`] ||
    uploadedImages[slideIndex] ||
    c.thumbnail_url ||
    c.imagem_fundo ||
    c.imagem_fundo2 ||
    c.imagem_fundo3 ||
    "";

  dlog("openEditModalForSlide: candidates", {
    slideIndex,
    hasSelected: !!selected,
    largestType: largestFound?.type,
    hasLargest: !!largest,
    fallbackUrl
  });

  let chosen: HTMLElement | null = selected || largest || (doc.body as HTMLElement);
  if (!chosen) { dlog("openEditModalForSlide: no chosen"); return null; }
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
    imageUrl = resolveImgUrl(chosen as HTMLImageElement); // <<< fix crítico
    targetType = "img";
  } else {
    const cssBg =
      cs?.backgroundImage && cs.backgroundImage.includes("url(")
        ? cs.backgroundImage.match(/url\(["']?(.+?)["']?\)/i)?.[1] || ""
        : "";
    imageUrl = cssBg || fallbackUrl;
    targetType = "bg";
  }

  dlog("openEditModalForSlide: target resolved", {
    tag: chosen.tagName,
    targetType,
    imageUrlLength: imageUrl.length,
    hasImageUrl: !!imageUrl
  });

  if (!imageUrl) { dlog("openEditModalForSlide: no imageUrl -> abort"); return null; }

  const r = chosen.getBoundingClientRect();
  const bodyRect = doc.body.getBoundingClientRect();
  const targetLeftPx = r.left ? r.left - bodyRect.left : 0;
  const targetTopPx = r.top ? r.top - bodyRect.top : 0;
  const targetWidthPx = Math.max(1, r.width || slideW);
  const targetHeightPx = Math.max(1, r.height || slideH);

  dlog("openEditModalForSlide: target rect", {
    targetLeftPx, targetTopPx, targetWidthPx, targetHeightPx
  });

  if (isVideo) {
    const video = chosen as HTMLVideoElement;
    const out: ImageEditModalState = {
      open: true,
      slideIndex,
      targetType: "vid",
      targetSelector,
      imageUrl,
      slideW,
      slideH,
      containerHeightPx: targetHeightPx,
      naturalW: video.videoWidth || targetWidthPx,
      naturalH: video.videoHeight || targetHeightPx,
      imgOffsetTopPx: 0,
      imgOffsetLeftPx: 0,
      targetWidthPx,
      targetLeftPx,
      targetTopPx,
      isVideo: true,
      videoTargetW: targetWidthPx,
      videoTargetH: targetHeightPx,
      videoTargetLeft: targetLeftPx,
      videoTargetTop: targetTopPx,
      cropX: targetLeftPx,
      cropY: targetTopPx,
      cropW: targetWidthPx,
      cropH: targetHeightPx,
    };
    dlog("openEditModalForSlide: return(video)", out);
    return out;
  }

  // IMAGEM/BG: cover + centralizado
  const tmp = new Image();
  tmp.src = imageUrl;
  const natW = tmp.naturalWidth || targetWidthPx || 1;
  const natH = tmp.naturalHeight || targetHeightPx || 1;
  const coverScale = Math.max(targetWidthPx / natW, targetHeightPx / natH);
  const displayW = Math.ceil(natW * coverScale);
  const displayH = Math.ceil(natH * coverScale);
  const startLeft = (targetWidthPx - displayW) / 2;
  const startTop = (targetHeightPx - displayH) / 2;

  let imgOffsetTopPx = startTop;
  let imgOffsetLeftPx = startLeft;

  if (targetType === "img") {
    const top = parseFloat((chosen as HTMLImageElement).style.top || `${startTop}`);
    const left = parseFloat((chosen as HTMLImageElement).style.left || `${startLeft}`);
    const minLeft = targetWidthPx - displayW;
    const minTop = targetHeightPx - displayH;
    imgOffsetTopPx = clamp(isNaN(top) ? startTop : top, minTop, 0);
    imgOffsetLeftPx = clamp(isNaN(left) ? startLeft : left, minLeft, 0);
  } else {
    const cs2 = doc.defaultView?.getComputedStyle(chosen);
    const toPerc = (v: string) => (v && v.endsWith("%") ? parseFloat(v) / 100 : 0.5);
    const posX = toPerc(cs2?.backgroundPositionX || "50%");
    const posY = toPerc(cs2?.backgroundPositionY || "50%");
    const maxOffsetX = Math.max(0, displayW - targetWidthPx);
    const maxOffsetY = Math.max(0, displayH - targetHeightPx);
    const offX = -posX * maxOffsetX;
    const offY = -posY * maxOffsetY;
    imgOffsetTopPx = clamp(offY, targetHeightPx - displayH, 0);
    imgOffsetLeftPx = clamp(offX, targetWidthPx - displayW, 0);
  }

  const out: ImageEditModalState = {
    open: true,
    slideIndex,
    targetType,
    targetSelector,
    imageUrl,
    slideW,
    slideH,
    containerHeightPx: targetHeightPx,
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
  };
  dlog("openEditModalForSlide: return(image/bg)", out);
  return out;
}

/* ===================== Aplicar alterações do modal ===================== */
export function applyModalEdits(
  state: ImageEditModalState,
  iframe: HTMLIFrameElement | null | undefined
) {
  if (!state.open || !iframe) return;
  const {
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
  } = state;

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  const el = doc.querySelector(targetSelector) as HTMLElement | null;
  if (!el) return;

  if (isVideo && targetType === "vid") {
    const vid = el as HTMLVideoElement;
    let wrapper = vid.parentElement;
    if (!wrapper || !wrapper.classList.contains("vid-crop-wrapper")) {
      const w = doc.createElement("div");
      w.className = "vid-crop-wrapper";
      w.style.display = "inline-block";
      w.style.position = "relative";
      w.style.overflow = "hidden";
      w.style.borderRadius = doc.defaultView?.getComputedStyle(vid).borderRadius || "";
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
    return;
  }

  // IMAGEM
  if (targetType === "img") {
    let wrapper = el.parentElement;
    if (!wrapper || !wrapper.classList.contains("img-crop-wrapper")) {
      const w = doc.createElement("div");
      w.className = "img-crop-wrapper";
      w.style.display = "inline-block";
      w.style.position = "relative";
      w.style.overflow = "hidden";
      w.style.borderRadius = doc.defaultView?.getComputedStyle(el).borderRadius || "";
      if (el.parentNode) el.parentNode.replaceChild(w, el);
      w.appendChild(el);
      wrapper = w;
    }
    (wrapper as HTMLElement).style.width = `${targetWidthPx}px`;
    (wrapper as HTMLElement).style.height = `${containerHeightPx}px`;

    const scale = Math.max(targetWidthPx / naturalW, containerHeightPx / naturalH);
    const displayW = Math.ceil(naturalW * scale) + 2;
    const displayH = Math.ceil(naturalH * scale) + 2;

    const minLeft = targetWidthPx - displayW;
    const minTop = containerHeightPx - displayH;

    const safeLeft = clamp(
      isNaN(imgOffsetLeftPx) ? minLeft / 2 : imgOffsetLeftPx,
      minLeft,
      0
    );
    const safeTop = clamp(
      isNaN(imgOffsetTopPx) ? minTop / 2 : imgOffsetTopPx,
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
    return;
  }

  // BACKGROUND
  if (targetType === "bg") {
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
    if ((doc.defaultView?.getComputedStyle(el).position || "static") === "static")
      el.style.position = "relative";
  }
}