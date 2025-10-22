// src/components/CarouselViewer/EditModal.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ImageEditModalState } from "./utils";
import { clamp, applyModalEdits } from "./utils";

type Props = {
  state: ImageEditModalState;
  renderedSlides: string[];
  onApply: (draft?: ImageEditModalState) => void; // aceitamos draft opcional (compatível com seu container)
  onClose: () => void;
};

const HANDLE_SIZE = 10;

const EditModal: React.FC<Props> = ({ state, renderedSlides, onApply, onClose }) => {
  if (!state.open) return null;

  // --- estado local (draft) para interações do usuário ---
  const [draft, setDraft] = useState<ImageEditModalState>(state);

  // se o estado de entrada mudar (abrir novo modal) sincroniza
  useEffect(() => {
    if (state.open) setDraft(state);
  }, [state]);

  const isVideo = draft.open && draft.isVideo;
  const slideIndex = draft.open ? draft.slideIndex : 0;

  // iframe do preview (apenas contexto visual)
  const previewRef = useRef<HTMLIFrameElement | null>(null);

  // ==== helpers de cover para IMAGEM ====
  const computeCover = (natW: number, natH: number, contW: number, contH: number) => {
    const scale = Math.max(contW / Math.max(natW, 1), contH / Math.max(natH, 1));
    return {
      displayW: Math.ceil(natW * scale),
      displayH: Math.ceil(natH * scale),
    };
  };

  // ==== bounds de drag para IMAGEM ====
  const imgDragBounds = useMemo(() => {
    if (!draft.open || draft.isVideo) return { minLeft: 0, maxLeft: 0, minTop: 0, maxTop: 0, displayW: 0, displayH: 0 };
    const { displayW, displayH } = computeCover(
      draft.naturalW,
      draft.naturalH,
      draft.targetWidthPx,
      draft.containerHeightPx
    );
    const minLeft = draft.targetWidthPx - displayW; // <= 0
    const minTop = draft.containerHeightPx - displayH; // <= 0
    return {
      minLeft,
      maxLeft: 0,
      minTop,
      maxTop: 0,
      displayW,
      displayH,
    };
  }, [draft]);

  // ==== drag 2D (IMAGEM) ====
  const imgDragging = useRef(false);
  const imgLast = useRef<{ x: number; y: number } | null>(null);

  const onImgDown = (e: React.MouseEvent) => {
    e.preventDefault();
    imgDragging.current = true;
    imgLast.current = { x: e.clientX, y: e.clientY };
    (window as any).getSelection?.()?.removeAllRanges?.();
  };
  const onImgMove = (e: React.MouseEvent) => {
    if (!imgDragging.current || !draft.open || draft.isVideo) return;
    const last = imgLast.current;
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    imgLast.current = { x: e.clientX, y: e.clientY };
    const nextLeft = clamp(draft.imgOffsetLeftPx + dx, imgDragBounds.minLeft, imgDragBounds.maxLeft);
    const nextTop = clamp(draft.imgOffsetTopPx + dy, imgDragBounds.minTop, imgDragBounds.maxTop);
    setDraft({ ...draft, imgOffsetLeftPx: nextLeft, imgOffsetTopPx: nextTop });
  };
  const onImgUp = () => {
    imgDragging.current = false;
    imgLast.current = null;
  };

  // ==== resize vertical da máscara (IMAGEM) – pela borda inferior ====
  const maskResizing = useRef(false);
  const maskLastY = useRef<number | null>(null);
  const onMaskResizeDown = (e: React.MouseEvent) => {
    e.preventDefault();
    maskResizing.current = true;
    maskLastY.current = e.clientY;
  };
  const onMaskResizeMove = (e: React.MouseEvent) => {
    if (!maskResizing.current || !draft.open || draft.isVideo) return;
    if (maskLastY.current == null) return;
    const dy = e.clientY - maskLastY.current;
    maskLastY.current = e.clientY;
    // novo H
    const minH = 60;
    const nextH = Math.max(minH, draft.containerHeightPx + dy);

    // recomputa cover p/ novos bounds e re-clampa offsets
    const { displayW, displayH } = computeCover(draft.naturalW, draft.naturalH, draft.targetWidthPx, nextH);
    const minLeft = draft.targetWidthPx - displayW;
    const minTop = nextH - displayH;

    const nextLeft = clamp(draft.imgOffsetLeftPx, minLeft, 0);
    const nextTop = clamp(draft.imgOffsetTopPx, minTop, 0);

    setDraft({ ...draft, containerHeightPx: nextH, imgOffsetLeftPx: nextLeft, imgOffsetTopPx: nextTop });
  };
  const onMaskResizeUp = () => {
    maskResizing.current = false;
    maskLastY.current = null;
  };

  // ==== crop (VÍDEO) ====
  const cropDragging = useRef(false);
  const cropResizing = useRef<{ dir: string } | null>(null);
  const cropLast = useRef<{ x: number; y: number } | null>(null);

  const videoBounds = useMemo(() => {
    if (!draft.open || !draft.isVideo) return { left: 0, top: 0, right: 0, bottom: 0, w: 0, h: 0 };
    return {
      left: draft.videoTargetLeft,
      top: draft.videoTargetTop,
      right: draft.videoTargetLeft + draft.videoTargetW,
      bottom: draft.videoTargetTop + draft.videoTargetH,
      w: draft.videoTargetW,
      h: draft.videoTargetH,
    };
  }, [draft]);

  const onCropDown = (e: React.MouseEvent) => {
    if (!draft.open || !draft.isVideo) return;
    e.preventDefault();
    cropDragging.current = true;
    cropLast.current = { x: e.clientX, y: e.clientY };
  };
  const onCropMove = (e: React.MouseEvent) => {
    if (!draft.open || !draft.isVideo) return;
    const last = cropLast.current;
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    cropLast.current = { x: e.clientX, y: e.clientY };

    if (cropResizing.current) {
      // resize pelos handles
      const dir = cropResizing.current.dir;
      let { cropX, cropY, cropW, cropH } = draft;
      if (dir.includes("e")) {
        cropW = clamp(cropW + dx, 20, videoBounds.right - draft.cropX);
      }
      if (dir.includes("s")) {
        cropH = clamp(cropH + dy, 20, videoBounds.bottom - draft.cropY);
      }
      if (dir.includes("w")) {
        const newX = clamp(draft.cropX + dx, videoBounds.left, draft.cropX + draft.cropW - 20);
        cropW = draft.cropW + (draft.cropX - newX);
        cropX = newX;
      }
      if (dir.includes("n")) {
        const newY = clamp(draft.cropY + dy, videoBounds.top, draft.cropY + draft.cropH - 20);
        cropH = draft.cropH + (draft.cropY - newY);
        cropY = newY;
      }
      setDraft({ ...draft, cropX, cropY, cropW, cropH });
      return;
    }

    if (cropDragging.current) {
      // mover retângulo
      const newX = clamp(draft.cropX + dx, videoBounds.left, videoBounds.right - draft.cropW);
      const newY = clamp(draft.cropY + dy, videoBounds.top, videoBounds.bottom - draft.cropH);
      setDraft({ ...draft, cropX: newX, cropY: newY });
    }
  };
  const onCropUp = () => {
    cropDragging.current = false;
    cropResizing.current = null;
    cropLast.current = null;
  };
  const onHandleDown = (dir: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    cropResizing.current = { dir };
    cropLast.current = { x: e.clientX, y: e.clientY };
  };

  // ==== aplicar ====
  const applyNow = () => {
    if (!draft.open) return;
    // pega o iframe REAL do slide (Canvas) por título
    const realIframe = document.querySelector<HTMLIFrameElement>(
      `iframe[title="Slide ${draft.slideIndex + 1}"]`
    );
    // aplica direto no DOM do slide para garantir consistência
    applyModalEdits(draft, realIframe || null);
    // entrega o draft para o container (se ele usar, beleza; se ignorar, já aplicamos mesmo assim)
    onApply(draft);
  };

  // ==== UI helpers ====
  const Instructions = () => (
    <div className="absolute bottom-3 left-3 right-3 text-xs text-white/80 pointer-events-none space-y-1">
      {draft.isVideo ? (
        <>
          <p>• Arraste o retângulo para posicionar o recorte</p>
          <p>• Use os pontos nos cantos e bordas para ajustar o tamanho (crop real)</p>
        </>
      ) : (
        <>
          <p>• Arraste a imagem para ajustar o enquadramento (limites respeitam a imagem real)</p>
          <p>• Arraste a borda inferior da máscara para aumentar/reduzir a área visível</p>
          <p>• As áreas escurecidas não aparecerão no slide final</p>
        </>
      )}
    </div>
  );

  // ==== Render principal do modal ====
  return (
    <div className="fixed inset-0 z-[9999]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/70" onMouseMove={onImgMove} onMouseUp={onImgUp} />

      {/* container */}
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="relative bg-neutral-950 border border-neutral-800 rounded-2xl w-[min(92vw,1200px)] h-[min(90vh,900px)] shadow-2xl pointer-events-auto overflow-hidden">
          {/* header */}
          <div className="h-12 px-4 flex items-center justify-between border-b border-neutral-800">
            <div className="text-white font-medium text-sm">
              {draft.isVideo ? "Edição de vídeo" : "Edição da imagem"} — Slide {slideIndex + 1}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={applyNow}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded"
              >
                Aplicar
              </button>
              <button onClick={onClose} className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* conteúdo */}
          <div
            className="w-full h-[calc(100%-3rem)] grid place-items-center overflow-auto p-6 select-none"
            onMouseMove={(e) => {
              // encaminha para drag de vídeo quando ativo
              if (draft.isVideo) onCropMove(e as any);
            }}
            onMouseUp={() => {
              onMaskResizeUp();
              onCropUp();
            }}
          >
            <div
              className="relative bg-neutral-100 rounded-xl shadow-xl"
              style={{
                width: `${draft.slideW}px`,
                height: `${draft.slideH}px`,
                transform: "scale(0.75)",
                transformOrigin: "top center",
              }}
              onMouseMove={onImgMove}
              onMouseUp={onImgUp}
            >
              {/* preview do slide completo */}
              <iframe
                ref={previewRef}
                srcDoc={renderedSlides[slideIndex]}
                className="absolute inset-0 w-full h-full border-0 rounded-xl pointer-events-none"
                title={`Preview Slide ${slideIndex + 1}`}
                sandbox="allow-same-origin allow-scripts"
              />

              {/* overlay de escurecimento fora do alvo */}
              {!draft.isVideo ? (
                // ======== IMAGEM ========
                (() => {
                  const contW = draft.targetWidthPx;
                  const contH = draft.containerHeightPx;

                  const containerLeft = (draft.slideW - contW) / 2 + draft.targetLeftPx - draft.targetLeftPx; // centraliza relativo ao slide
                  const containerTop = (draft.slideH - contH) / 2 + draft.targetTopPx - draft.targetTopPx;

                  const { displayW, displayH } = computeCover(
                    draft.naturalW,
                    draft.naturalH,
                    contW,
                    contH
                  );

                  const imgLeft = draft.imgOffsetLeftPx;
                  const imgTop = draft.imgOffsetTopPx;

                  // darken fora do container
                  return (
                    <>
                      {/* áreas escurecidas */}
                      {/* top */}
                      <div
                        className="absolute left-0 right-0 bg-black/30 pointer-events-none rounded-t-xl"
                        style={{ top: 0, height: `${(draft.slideH - contH) / 2}px` }}
                      />
                      {/* left */}
                      <div
                        className="absolute top-0 bottom-0 bg-black/30 pointer-events-none"
                        style={{ left: 0, width: `${(draft.slideW - contW) / 2}px` }}
                      />
                      {/* right */}
                      <div
                        className="absolute top-0 bottom-0 bg-black/30 pointer-events-none"
                        style={{ right: 0, width: `${(draft.slideW - contW) / 2}px` }}
                      />
                      {/* bottom */}
                      <div
                        className="absolute left-0 right-0 bg-black/30 pointer-events-none rounded-b-xl"
                        style={{ bottom: 0, height: `${(draft.slideH - contH) / 2}px` }}
                      />

                      {/* container da máscara */}
                      <div
                        className="absolute bg-white rounded-lg shadow-[0_0_0_3px_rgba(59,130,246,0.9)] overflow-hidden"
                        style={{
                          left: `${(draft.slideW - contW) / 2}px`,
                          top: `${(draft.slideH - contH) / 2}px`,
                          width: `${contW}px`,
                          height: `${contH}px`,
                          cursor: "move",
                        }}
                        onMouseDown={onImgDown}
                        onMouseMove={onImgMove}
                        onMouseUp={onImgUp}
                      >
                        <img
                          src={draft.imageUrl}
                          alt="to-edit"
                          draggable={false}
                          style={{
                            position: "absolute",
                            left: `${imgLeft}px`,
                            top: `${imgTop}px`,
                            width: `${imgDragBounds.displayW}px`,
                            height: `${imgDragBounds.displayH}px`,
                            objectFit: "cover",
                            userSelect: "none",
                            pointerEvents: "none",
                            backfaceVisibility: "hidden",
                            transform: "translateZ(0)",
                          }}
                        />

                        {/* barra de resize inferior */}
                        <div
                          onMouseDown={onMaskResizeDown}
                          className="absolute left-0 right-0 h-3 -bottom-1 cursor-s-resize"
                          style={{ zIndex: 5, background: "transparent" }}
                        >
                          <div className="mx-auto w-12 h-1 rounded-full bg-blue-500/80" />
                        </div>
                      </div>
                    </>
                  );
                })()
              ) : (
                // ======== VÍDEO ========
                (() => {
                  // desenha o retângulo de crop por cima do alvo
                  const rectLeft = draft.cropX;
                  const rectTop = draft.cropY;
                  const rectW = draft.cropW;
                  const rectH = draft.cropH;

                  // overlay para indicar fora do crop
                  return (
                    <>
                      {/* esmaece toda a área do slide */}
                      <div className="absolute inset-0 bg-black/30 pointer-events-none rounded-xl" />

                      {/* janela do recorte (furo) */}
                      <div
                        className="absolute bg-transparent"
                        style={{
                          left: `${rectLeft}px`,
                          top: `${rectTop}px`,
                          width: `${rectW}px`,
                          height: `${rectH}px`,
                          boxShadow:
                            "0 0 0 9999px rgba(0,0,0,0.5), 0 0 0 3px rgba(59,130,246,0.9) inset",
                          cursor: "move",
                        }}
                        onMouseDown={onCropDown}
                        onMouseMove={onCropMove}
                        onMouseUp={onCropUp}
                      >
                        {/* handles */}
                        {renderHandle("n", rectLeft, rectTop - HANDLE_SIZE / 2, rectW, rectH, onHandleDown)}
                        {renderHandle("s", rectLeft, rectTop + rectH - HANDLE_SIZE / 2, rectW, rectH, onHandleDown)}
                        {renderHandle("w", rectLeft - HANDLE_SIZE / 2, rectTop, rectW, rectH, onHandleDown)}
                        {renderHandle("e", rectLeft + rectW - HANDLE_SIZE / 2, rectTop, rectW, rectH, onHandleDown)}
                        {renderHandle("nw", rectLeft - HANDLE_SIZE / 2, rectTop - HANDLE_SIZE / 2, rectW, rectH, onHandleDown)}
                        {renderHandle("ne", rectLeft + rectW - HANDLE_SIZE / 2, rectTop - HANDLE_SIZE / 2, rectW, rectH, onHandleDown)}
                        {renderHandle("sw", rectLeft - HANDLE_SIZE / 2, rectTop + rectH - HANDLE_SIZE / 2, rectW, rectH, onHandleDown)}
                        {renderHandle("se", rectLeft + rectW - HANDLE_SIZE / 2, rectTop + rectH - HANDLE_SIZE / 2, rectW, rectH, onHandleDown)}
                      </div>
                    </>
                  );
                })()
              )}

              <Instructions />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Renderiza um handle de redimensionamento com cursor adequado
function renderHandle(
  dir: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw",
  left: number,
  top: number,
  rectW: number,
  rectH: number,
  onHandleDown: (dir: string) => (e: React.MouseEvent) => void
) {
  const style: React.CSSProperties = {
    position: "absolute",
    left,
    top,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    background: "white",
    border: "2px solid #3B82F6",
    borderRadius: 2,
    zIndex: 6,
  };
  const cursorMap: Record<string, string> = {
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    nw: "nwse-resize",
    se: "nwse-resize",
  };
  style.cursor = cursorMap[dir];

  return <div key={dir} style={style} onMouseDown={onHandleDown(dir)} />;
}

export default EditModal;