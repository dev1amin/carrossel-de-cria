// CarouselViewer.tsx
import React, { useState, useEffect, useRef } from 'react';
import type { CarouselData, ElementType, ElementStyles } from '../../../types/carousel';
import { searchImages } from '../../../services/carousel';
import { TopBar } from './TopBar';
import { LayersSidebar } from './LayersSidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { CanvasArea } from './CanvasArea';
import {
  logc, logd, logb,
  isVideoUrl, isImgurUrl,
  clamp, computeCoverBleed,
  type ImgDragState, type VideoCropState,
  readAndStoreComputedTextStyles,
  cleanupAltArtifacts, installAltCleanupObserver,
  forceVideoStyle,
  removeAllPlayOverlays, killPlayOverlays, attachPlayOverlay,
  ensureImgCropWrapper,
  ensureHostResizeObserver,
  disposePinchersInDoc, attachResizePinchers,
  normFill,
  applyBackgroundImageImmediate,
  layoutReady
} from './viewerUtils';

interface CarouselViewerProps {
  slides: string[];
  carouselData: CarouselData;
  onClose: () => void;
}

/** ========= Drag State (module-level) ========= */
const imgDragState = { current: null as ImgDragState | null };
const videoCropState = { current: null as VideoCropState | null };

/** ========= Componente ========= */
const CarouselViewer: React.FC<CarouselViewerProps> = ({ slides, carouselData, onClose }) => {
  // Migração automática: se tem 'slides' mas não tem 'conteudos', faz a migração
  const migratedData = React.useMemo(() => {
    const data = carouselData as any;
    
    // Se já tem conteudos, retorna como está
    if (data.conteudos && Array.isArray(data.conteudos)) {
      return carouselData;
    }
    
    // Se tem slides no carouselData (formato antigo), migra para conteudos
    if (data.slides && Array.isArray(data.slides)) {
      console.log('🔄 Migrando carouselData.slides para data.conteudos');
      return {
        ...carouselData,
        conteudos: data.slides,
      };
    }
    
    // Se não tem nem slides nem conteudos, retorna null (vai mostrar erro)
    return null;
  }, [carouselData]);

  // Validação: garante que data.conteudos existe (após migração)
  if (!migratedData || !(migratedData as any).conteudos || !Array.isArray((migratedData as any).conteudos)) {
    console.error('❌ CarouselViewer: data.conteudos não encontrado ou inválido:', carouselData);
    return (
      <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
        <div className="bg-neutral-900 p-8 rounded-lg max-w-md text-center">
          <h2 className="text-white text-xl font-bold mb-4">Erro ao carregar carrossel</h2>
          <p className="text-neutral-400 mb-6">
            Os dados do carrossel estão em um formato incompatível com o editor.
          </p>
          <button
            onClick={onClose}
            className="bg-white text-black px-6 py-2 rounded-lg font-medium hover:bg-neutral-200 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  // Usa os dados migrados (garantindo compatibilidade)
  const data = migratedData;

  const slideWidth = 1080;
  const slideHeight = 1350;
  const gap = 40;

  const [zoom, setZoom] = useState(0.35);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [focusedSlide, setFocusedSlide] = useState<number>(0);
  const [selectedElement, setSelectedElement] = useState<{ slideIndex: number; element: ElementType }>({ slideIndex: 0, element: null });
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set([0]));

  const [editedContent, setEditedContent] = useState<Record<string, any>>({});
  const [elementStyles, setElementStyles] = useState<Record<string, ElementStyles>>({});
  const [originalStyles, setOriginalStyles] = useState<Record<string, ElementStyles>>({});
  const [renderedSlides, setRenderedSlides] = useState<string[]>(slides);

  const [isLoadingProperties, setIsLoadingProperties] = useState(false);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<Record<number, string>>({});

  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const lastSearchId = useRef(0);
  const disposersRef = useRef<Array<() => void>>([]);

  /** helper global: limpa seleções entre todos os slides */
  const clearAllSelections = () => {
    iframeRefs.current.forEach((ifr) => {
      const d = ifr?.contentDocument || ifr?.contentWindow?.document;
      if (!d) return;
      d.querySelectorAll('[data-editable].selected').forEach((el) => {
        el.classList.remove('selected');
        (el as HTMLElement).style.zIndex = '';
      });
      d.querySelectorAll('.img-crop-wrapper[data-cv-selected="1"]').forEach((el) => {
        (el as HTMLElement).removeAttribute('data-cv-selected');
      });
      try { disposePinchersInDoc(d); } catch {}
    });
  };

  /** === REFLEXO DE EDIÇÕES NO IFRAME (texto + estilos) === */
  useEffect(() => {
    Object.entries(editedContent).forEach(([k, val]) => {
      const [slideStr, field] = k.split('-');
      const slideIndex = Number(slideStr);
      if (Number.isNaN(slideIndex)) return;
      if (field !== 'title' && field !== 'subtitle') return;

      const ifr = iframeRefs.current[slideIndex];
      const doc = ifr?.contentDocument || ifr?.contentWindow?.document;
      const el = doc?.getElementById(`slide-${slideIndex}-${field}`);
      if (el && typeof val === 'string') el.textContent = val;
    });

    Object.entries(elementStyles).forEach(([k, sty]) => {
      const [slideStr, field] = k.split('-');
      const slideIndex = Number(slideStr);
      if (Number.isNaN(slideIndex)) return;
      if (field !== 'title' && field !== 'subtitle') return;

      const ifr = iframeRefs.current[slideIndex];
      const doc = ifr?.contentDocument || ifr?.contentWindow?.document;
      const el = doc?.getElementById(`slide-${slideIndex}-${field}`) as HTMLElement | null;
      if (!el) return;

      if (sty.fontSize)  el.style.fontSize  = sty.fontSize;
      if (sty.fontWeight) el.style.fontWeight = String(sty.fontWeight);
      if (sty.textAlign) el.style.textAlign = sty.textAlign as any;
      if (sty.color)     el.style.color     = sty.color;
    });
  }, [editedContent, elementStyles]);

  /** IDs + estilos + FOUC guard */
  const ensureStyleTag = (html: string) => {
    if (!/<style[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1><style></style>`);
    }
    return html;
  };

  const stripAltGarbage = (html: string) =>
    html.replace(/>\s*alt\s*=\s*(?:""|''|&quot;&quot;)\s*>/gi, '>');

  const injectEditableIds = (html: string, slideIndex: number): string => {
    let result = ensureStyleTag(html);
    const conteudo = data.conteudos[slideIndex];
    const titleText = conteudo?.title || '';
    const subtitleText = conteudo?.subtitle || '';

    const addEditableSpan = (text: string, id: string, attr: string) => {
      const lines = text.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        const escaped = line.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(>[^<]*)(${escaped})([^<]*<)`, 'gi');
        result = result.replace(re, (_match, b, t, a) => `${b}<span id="${id}" data-editable="${attr}" contenteditable="false">${t}</span>${a}`);
      });
    };

    if (titleText) addEditableSpan(titleText, `slide-${slideIndex}-title`, 'title');
    if (subtitleText) addEditableSpan(subtitleText, `slide-${slideIndex}-subtitle`, 'subtitle');

    result = result.replace(/<style>/i, `<style>
      [data-editable]{cursor:pointer!important;position:relative;display:inline-block!important}
      [data-editable].selected{outline:3px solid #3B82F6!important;outline-offset:2px;z-index:1000}
      [data-editable]:hover:not(.selected){outline:2px solid rgba(59,130,246,.5)!important;outline-offset:2px}
      [data-editable][contenteditable="true"]{outline:3px solid #10B981!important;outline-offset:2px;background:rgba(16,185,129,.1)!important}
      img[data-editable]{display:block!important}
      video[data-editable]{display:block!important}
      html, body { pointer-events: auto !important; }

      html, body { height:100% !important; width:100% !important; margin:0 !important; padding:0 !important; overflow:hidden !important; }
      img, video { max-width:none !important; }

      /* Container de vídeo genérico */
      .video-container{
        position:relative !important;
        display:block !important;
        width:100% !important;
        height:450px;
        border-radius:24px !important;
        overflow:hidden !important;
        margin-top:0 !important;
        box-shadow:0 16px 48px rgba(0,0,0,.18) !important;
      }
      .video-container > video{
        position:absolute !important;
        inset:0 !important;
        width:100% !important;
        height:100% !important;
        object-fit:cover !important;
        display:block !important;
        border-radius:24px !important;
      }
      
      /* Vídeo direto (sem container) */
      video[data-editable="video"]:not(.video-container video){
        width:100% !important;
        height:450px;
        object-fit:cover !important;
        display:block !important;
        border-radius:24px !important;
        margin-top:0 !important;
        box-shadow:0 16px 48px rgba(0,0,0,.18) !important;
      }
      
      /* Imagens dentro de wrappers */
      .img-crop-wrapper img,
      img[data-editable="image"]{ 
        margin-top:0 !important;
        /* Remove transformações e filtros que possam interferir no drag */
        transform: none !important;
        filter: none !important;
        /* Garante que object-fit funcione corretamente */
        object-fit: cover !important;
      }
      
      /* Template 3 específico: title após imagem tem margin-top 36px */
      .img-crop-wrapper + .title,
      .img-crop-wrapper + [data-editable="title"] {
        margin-top: 36px !important;
      }

      .img-crop-wrapper[data-cv-selected="1"]{
        outline:3px solid #3B82F6!important;
        outline-offset:2px;
        z-index:1000;
      }
      .img-crop-wrapper { 
        cursor: pointer !important;
        /* Remove transformações do wrapper que possam interferir */
        transform: none !important;
        filter: none !important;
        /* Preserva estilos originais do wrapper */
      }
      
      /* Preserva border-radius e box-shadow originais dos wrappers */
      .img-crop-wrapper[data-original-border-radius] {
        /* O border-radius será aplicado via JS */
      }
      
      /* Preserva margin-top dos containers */
      .img-crop-wrapper[data-original-margin-top] {
        /* O margin-top será aplicado via JS */
      }
      
      /* Protege estilos visuais importantes contra override acidental */
      .media[style*="border-radius"],
      .img-crop-wrapper[style*="border-radius"] {
        /* Mantém border-radius inline */
      }
    `);

    return result.replace(
      /<body([^>]*)>/i,
      (m, attrs) =>
        /id=/.test(attrs)
          ? m
          : `<body${attrs} id="slide-${slideIndex}-background" data-editable="background">`
    );

  };

  useEffect(() => {
    setRenderedSlides(slides.map((s, i) => injectEditableIds(stripAltGarbage(s), i)));
    
    // Limpa todas as seleções e reseta estados ao trocar de aba/slides
    setSelectedElement({ slideIndex: 0, element: null });
    setFocusedSlide(0);
    setElementStyles({});
    setOriginalStyles({});
    selectedImageRefs.current = {};
    
    // Força re-setup dos iframes após trocar slides/carrossel
    // Aguarda um frame para garantir que os iframes foram renderizados
    requestAnimationFrame(() => {
      iframeRefs.current.forEach((ifr) => {
        if (ifr?.contentDocument) {
          const doc = ifr.contentDocument;
          // Força pointer-events nos elementos editáveis
          doc.querySelectorAll('[data-editable]').forEach(el => {
            (el as HTMLElement).style.pointerEvents = 'auto';
          });
        }
      });
    });
  }, [slides]);

  useEffect(() => {
    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = 0 * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
    setFocusedSlide(0);
    setSelectedElement({ slideIndex: 0, element: null });
  }, []); // mount only

  const postProcessTemplateVideos = (doc: Document) => {
    // 1. Processa vídeos dentro de .video-container (qualquer classe, não só .text-box)
    Array.from(doc.querySelectorAll<HTMLElement>('.video-container')).forEach((host) => {
      host.style.position = host.style.position || 'relative';
      host.style.overflow = 'hidden';
      (host.style as any).height = (host.style as any).height || '450px';
      const v = host.querySelector('video');
      if (v) {
        v.setAttribute('data-editable', 'video');
        forceVideoStyle(v as HTMLVideoElement);
        (v as HTMLVideoElement).style.position = 'absolute';
        (v as any).style.inset = '0';
        (v as HTMLVideoElement).style.width = '100%';
        (v as HTMLVideoElement).style.height = '100%';
        (v as HTMLVideoElement).style.objectFit = 'cover';
        try { (v as HTMLVideoElement).pause(); } catch {}
        try { (v as HTMLVideoElement).load(); } catch {}
        attachPlayOverlay(doc, host, v as HTMLVideoElement);
        ensureHostResizeObserver(host);
        normFill(host);
      }
    });

    // 2. Processa vídeos diretos (não dentro de .video-container)
    // Pega todos os vídeos que NÃO estão dentro de .video-container
    Array.from(doc.querySelectorAll<HTMLVideoElement>('video')).forEach((v) => {
      // Ignora se já está dentro de um .video-container
      if (v.closest('.video-container')) return;
      
      // Cria wrapper similar ao img-crop-wrapper
      const cs = doc.defaultView?.getComputedStyle(v);
      const parent = v.parentElement;
      
      // Captura estilos originais do vídeo
      const preservedStyles = {
        borderRadius: cs?.borderRadius || '',
        boxShadow: cs?.boxShadow || '',
        marginTop: cs?.marginTop || '',
        width: cs?.width || '100%',
        height: cs?.height || '450px',
      };
      
      // Cria container apenas se ainda não tiver
      if (!parent || !parent.classList.contains('video-container')) {
        const container = doc.createElement('div');
        container.className = 'video-container';
        container.style.position = 'relative';
        container.style.overflow = 'hidden';
        container.style.width = preservedStyles.width;
        container.style.height = preservedStyles.height;
        
        // Preserva estilos visuais
        if (preservedStyles.borderRadius && preservedStyles.borderRadius !== '0px') {
          container.style.borderRadius = preservedStyles.borderRadius;
        }
        if (preservedStyles.boxShadow && preservedStyles.boxShadow !== 'none') {
          container.style.boxShadow = preservedStyles.boxShadow;
        }
        if (preservedStyles.marginTop && preservedStyles.marginTop !== '0px') {
          container.style.marginTop = preservedStyles.marginTop;
        }
        
        // Substitui vídeo por container
        if (v.parentNode) v.parentNode.replaceChild(container, v);
        container.appendChild(v);
        
        // Ajusta estilos do vídeo para preencher o container
        v.setAttribute('data-editable', 'video');
        forceVideoStyle(v);
        v.style.position = 'absolute';
        (v.style as any).inset = '0';
        v.style.width = '100%';
        v.style.height = '100%';
        v.style.objectFit = 'cover';
        try { v.pause(); } catch {}
        try { v.load(); } catch {}
        
        attachPlayOverlay(doc, container, v);
        ensureHostResizeObserver(container);
        normFill(container);
      } else {
        // Já tem container, apenas aplica estilos
        v.setAttribute('data-editable', 'video');
        forceVideoStyle(v);
        v.style.width = '100%';
        v.style.height = '450px';
        v.style.objectFit = 'cover';
        try { v.pause(); } catch {}
        try { v.load(); } catch {}
        
        attachPlayOverlay(doc, parent, v);
        ensureHostResizeObserver(parent);
        normFill(parent);
      }
    });

    try { cleanupAltArtifacts(doc.body); } catch {}
  };

  /** ====== Wiring nos iframes + Drag ====== */
  useEffect(() => {
    // Usa a ref para disposers para evitar conflitos
    const disposers = disposersRef.current;

    const startImgDrag = async (doc: Document, slideIndex: number, img: HTMLImageElement, ev: MouseEvent) => {
      ev.preventDefault(); ev.stopPropagation();

      const { wrapper } = ensureImgCropWrapper(doc, img);
      let wr = (wrapper as HTMLElement).getBoundingClientRect();
      if (wr.width === 0 || wr.height === 0) {
        await layoutReady(doc);
        wr = (wrapper as HTMLElement).getBoundingClientRect();
        if (wr.width === 0 || wr.height === 0) return;
      }
      const contW = wr.width, contH = wr.height;
      const natW = img.naturalWidth || contW, natH = img.naturalHeight || contH;

      img.style.setProperty('width', '100%', 'important');
      img.style.setProperty('height', '100%', 'important');
      img.style.setProperty('object-fit', 'cover', 'important');
      img.style.removeProperty('position');
      img.removeAttribute('data-cv-left');
      img.removeAttribute('data-cv-top');

      const { displayW, displayH } = computeCoverBleed(natW, natH, contW, contH, 0);
      const maxOffsetX = Math.max(0, displayW - contW);
      const maxOffsetY = Math.max(0, displayH - contH);

      const cs = doc.defaultView?.getComputedStyle(img);
      const toPerc = (v: string) => v?.trim().endsWith('%') ? parseFloat(v) : 50;
      const obj = (cs?.objectPosition || '50% 50%').split(/\s+/);
      const xPerc = toPerc(obj[0] || '50%');
      const yPerc = toPerc(obj[1] || '50%');
      const leftPx = -maxOffsetX * (xPerc / 100);
      const topPx  = -maxOffsetY * (yPerc / 100);

      imgDragState.current = {
        active:true, kind:'img', mode:'objpos', slideIndex, doc,
        wrapper, targetEl: img,
        contW, contH, natW, natH, dispW: displayW, dispH: displayH,
        minLeft: Math.min(0, contW - displayW),
        minTop:  Math.min(0, contH - displayH),
        left: leftPx, top: topPx, startX: ev.clientX, startY: ev.clientY
      };
      logd('start IMG (object-position only)', { slideIndex, contW, contH, displayW, displayH });
    };

    const startVideoDrag = async (doc: Document, slideIndex: number, video: HTMLVideoElement, ev: MouseEvent) => {
      ev.preventDefault(); ev.stopPropagation();

      const host = video.parentElement as HTMLElement | null;
      const cont = host && host.classList.contains('img-crop-wrapper') ? host : (host || video);
      let wr = cont.getBoundingClientRect();
      if (wr.width === 0 || wr.height === 0) { await layoutReady(doc); wr = cont.getBoundingClientRect(); if (wr.width === 0 || wr.height === 0) return; }

      const contW = wr.width, contH = wr.height;
      const natW = video.videoWidth || contW;
      const natH = video.videoHeight || contH;

      video.style.setProperty('object-fit','cover','important');
      video.style.setProperty('width','100%','important');
      video.style.setProperty('height','100%','important');
      video.style.setProperty('position','absolute','important');
      (video.style as any).inset = '0';

      const { displayW, displayH } = computeCoverBleed(natW, natH, contW, contH, 0);
      const maxOffsetX = Math.max(0, displayW - contW);
      const maxOffsetY = Math.max(0, displayH - contH);

      const cs = doc.defaultView?.getComputedStyle(video);
      const toPerc = (v: string) => v?.trim().endsWith('%') ? parseFloat(v) : 50;
      const obj = (cs?.objectPosition || '50% 50%').split(/\s+/);
      const xPerc = toPerc(obj[0] || '50%');
      const yPerc = toPerc(obj[1] || '50%');
      const leftPx = -maxOffsetX * (xPerc / 100);
      const topPx  = -maxOffsetY * (yPerc / 100);

      imgDragState.current = {
        active:true, kind:'vid', mode:'objpos',
        slideIndex, doc, wrapper: cont, targetEl: video as any,
        contW, contH, natW, natH, dispW: displayW, dispH: displayH,
        minLeft: Math.min(0, contW - displayW),
        minTop:  Math.min(0, contH - displayH),
        left: leftPx, top: topPx, startX: ev.clientX, startY: ev.clientY
      };
    };

    const startBgDrag = async (doc: Document, slideIndex: number, cont: HTMLElement, ev: MouseEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      const cs = doc.defaultView?.getComputedStyle(cont);
      const bg = (cs?.backgroundImage || '').match(/url\(["']?(.+?)["']?\)/i)?.[1];
      if (!bg) return;

      let r = cont.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { await layoutReady(doc); r = cont.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return; }

      const tmp = new Image(); tmp.crossOrigin = 'anonymous'; tmp.src = bg;
      const go = () => {
        const natW = tmp.naturalWidth || r.width, natH = tmp.naturalHeight || r.height;
        const { displayW, displayH } = computeCoverBleed(natW, natH, r.width, r.height, 2);
        const maxX = Math.max(0, displayW - r.width), maxY = Math.max(0, displayH - r.height);
        const toPerc = (v: string) => v.endsWith('%') ? parseFloat(v)/100 : 0.5;
        const posX = cs?.backgroundPositionX || '50%', posY = cs?.backgroundPositionY || '50%';
        const leftPx = -maxX * toPerc(posX), topPx = -maxY * toPerc(posY);

        imgDragState.current = {
          active:true, kind:'bg', mode:'objpos', slideIndex, doc,
          wrapper: cont, targetEl: cont, contW:r.width, contH:r.height,
          natW, natH, dispW:displayW, dispH:displayH,
          minLeft: Math.min(0, r.width - displayW), minTop: Math.min(0, r.height - displayH),
          left: leftPx, top: topPx, startX: ev.clientX, startY: ev.clientY
        };
        logd('start BG', { slideIndex, contW:r.width, contH:r.height, displayW, displayH });
      };
      if (tmp.complete && tmp.naturalWidth) go(); else tmp.onload = go;
    };

    const setupIframe = (ifr: HTMLIFrameElement, slideIndex: number) => {
      const doc = ifr.contentDocument || ifr.contentWindow?.document;
      if (!doc) return;

      const imgsLocal = Array.from(doc.querySelectorAll('img'));
      let imgIdxLocal = 0;
      imgsLocal.forEach((img) => {
        const im = img as HTMLImageElement;
        if (isImgurUrl(im.src) && !im.getAttribute('data-protected')) im.setAttribute('data-protected', 'true');
        if (im.getAttribute('data-protected') !== 'true') {
          im.setAttribute('data-editable', 'image');
          if (!im.id) im.id = `slide-${slideIndex}-img-${imgIdxLocal++}`;
        }
      });
      requestAnimationFrame(() => {
        Array.from(doc.querySelectorAll('img[data-editable="image"]')).forEach((im) => {
          const el = im as HTMLImageElement;
          try { ensureImgCropWrapper(doc, el); } catch {}
        });
      });

      const vids = Array.from(doc.querySelectorAll('video'));
      let vidIdx = 0;
      vids.forEach((v) => {
        (v as HTMLVideoElement).setAttribute('data-editable', 'video');
        if (!v.id) v.id = `slide-${slideIndex}-vid-${vidIdx++}`;
        (v as HTMLVideoElement).style.objectFit = 'cover';
        (v as HTMLVideoElement).style.width = '100%';
        (v as HTMLVideoElement).style.height = '100%';
        try { (v as HTMLVideoElement).pause(); } catch {}
        try { (v as HTMLVideoElement).load(); } catch {}
      });

      postProcessTemplateVideos(doc);
      try { installAltCleanupObserver(doc); } catch {}
      try { cleanupAltArtifacts(doc.body); } catch {}

      try { cleanupAltArtifacts(doc.body); } catch {}
    //doc.body.style.visibility = 'visible';

      const onClickCapture = (ev: MouseEvent) => {
        const target = ev.target as HTMLElement | null;
        if (!target) return;

        clearAllSelections();

        const clickedVideo = target.closest('video') as HTMLVideoElement | null;
        if (clickedVideo) {
          clickedVideo.setAttribute('data-editable', 'video');
          clickedVideo.classList.add('selected');
          (clickedVideo as HTMLElement).style.zIndex = '1000';
          setSelectedElement({ slideIndex, element: 'background' });
          setFocusedSlide(slideIndex);
          if (!expandedLayers.has(slideIndex)) setExpandedLayers(s => new Set(s).add(slideIndex));
          const host = (clickedVideo.parentElement as HTMLElement | null);
          if (host) attachResizePinchers(doc, host);
          logc('select video', { slideIndex, id: clickedVideo.id });
          return;
        }

        ev.preventDefault();
        ev.stopPropagation();

        const wrapper = target.closest('.img-crop-wrapper') as HTMLElement | null;
        const clickedImg = (wrapper?.querySelector('img[data-editable="image"]') ??
                            target.closest('img')) as HTMLImageElement | null;

        if (clickedImg) {
          const { wrapper: w } = ensureImgCropWrapper(doc, clickedImg);
          w.setAttribute('data-cv-selected', '1');
          attachResizePinchers(doc, w);
          ensureHostResizeObserver(w);
          normFill(w);
          
          // Garante que os estilos preservados sejam reaplicados após seleção
          const originalBorderRadius = w.getAttribute('data-original-border-radius');
          const originalMarginTop = w.getAttribute('data-original-margin-top');
          if (originalBorderRadius) {
            w.style.borderRadius = originalBorderRadius;
          }
          if (originalMarginTop) {
            w.style.marginTop = originalMarginTop;
          }
          
          setSelectedElement({ slideIndex, element: 'background' });
          setFocusedSlide(slideIndex);
          selectedImageRefs.current[slideIndex] = clickedImg;
          if (!expandedLayers.has(slideIndex)) setExpandedLayers(s => new Set(s).add(slideIndex));
          logc('select image', { slideIndex, id: clickedImg.id });
          return;
        }

        const el = target.closest<HTMLElement>('[data-editable]');
        if (!el) return;
        (el as HTMLElement).style.pointerEvents = 'auto';

        const type = el.getAttribute('data-editable');
        if (type === 'title' || type === 'subtitle') {
          el.classList.add('selected');
          (el as HTMLElement).style.zIndex = '1000';
          setSelectedElement({ slideIndex, element: type as any });
          setFocusedSlide(slideIndex);
          if (!expandedLayers.has(slideIndex)) setExpandedLayers(s => new Set(s).add(slideIndex));
          try {
            readAndStoreComputedTextStyles(
              doc,
              slideIndex,
              type as 'title' | 'subtitle',
              setOriginalStyles
            );
          } catch {}
          logc('select text', { slideIndex, type, id: el.id });
        } else if (type === 'video' || type === 'background') {
          el.classList.add('selected');
          (el as HTMLElement).style.zIndex = '1000';
          setSelectedElement({ slideIndex, element: 'background' });
          setFocusedSlide(slideIndex);
          if (!expandedLayers.has(slideIndex)) setExpandedLayers(s => new Set(s).add(slideIndex));
          logc('select bg/video host', { slideIndex, id: el.id, type });
        }
      };

      const onDblClick = (ev: MouseEvent) => {
        const t = ev.target as HTMLElement | null;
        const el = t?.closest<HTMLElement>('[data-editable="title"],[data-editable="subtitle"]');
        if (!el) return;
        ev.preventDefault(); ev.stopPropagation();
        el.setAttribute('contenteditable', 'true');
        (el as HTMLElement).focus();
        const range = doc.createRange(); range.selectNodeContents(el);
        const sel = ifr.contentWindow?.getSelection(); if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      };
      const onBlur = (ev: FocusEvent) => {
        const el = ev.target as HTMLElement;
        if (el?.getAttribute('contenteditable') === 'true') {
          el.setAttribute('contenteditable', 'false');
          updateEditedValue(slideIndex, el.getAttribute('data-editable')!, (el.textContent || ''));
          el.classList.remove('selected');
          el.style.zIndex = '';
        }
      };

      const onMouseDownCapture = (ev: MouseEvent) => {
        if (videoCropState.current?.active) return;
        const t = ev.target as HTMLElement | null;
        if (!t) return;

        const vid = t.closest('video[data-editable="video"]') as HTMLVideoElement | null;
        if (vid) { void startVideoDrag(doc, slideIndex, vid, ev); return; }

        const img = t.closest('img[data-editable="image"]') as HTMLImageElement | null;
        if (img) { void startImgDrag(doc, slideIndex, img, ev); return; }

        const bgEl = t.closest<HTMLElement>('[data-editable="background"], body, div, section, header, main, figure, article');
        if (bgEl) {
          const cs = doc.defaultView?.getComputedStyle(bgEl);
          if (cs?.backgroundImage?.includes('url(')) { void startBgDrag(doc, slideIndex, bgEl, ev); }
        }
      };

      const onMove = (ev: MouseEvent) => {
        const st = imgDragState.current;
        if (!st || !st.active) return;
        if (st.doc !== doc) return;

        if (st.kind === 'img') {
          const dx = ev.clientX - st.startX;
          const dy = ev.clientY - st.startY;
          const nextLeft = clamp(st.left + dx, st.minLeft, 0);
          const nextTop  = clamp(st.top  + dy, st.minTop,  0);

          const maxOffsetX = Math.max(0, st.dispW - st.contW);
          const maxOffsetY = Math.max(0, st.dispH - st.contH);
          const xPerc = maxOffsetX ? (-nextLeft / maxOffsetX) * 100 : 50;
          const yPerc = maxOffsetY ? (-nextTop  / maxOffsetY) * 100 : 50;
          (st.targetEl as HTMLImageElement).style.objectPosition = `${xPerc}% ${yPerc}%`;
          return;
        }

        if (st.kind === 'vid') {
          const dx = ev.clientX - st.startX;
          const dy = ev.clientY - st.startY;
          const nextLeft = clamp(st.left + dx, st.minLeft, 0);
          const nextTop  = clamp(st.top  + dy, st.minTop,  0);
          const maxOffsetX = Math.max(0, st.dispW - st.contW);
          const maxOffsetY = Math.max(0, st.dispH - st.contH);
          const xPerc = maxOffsetX ? (-nextLeft / maxOffsetX) * 100 : 50;
          const yPerc = maxOffsetY ? (-nextTop  / maxOffsetY) * 100 : 50;
          (st.targetEl as HTMLVideoElement).style.objectPosition = `${xPerc}% ${yPerc}%`;
          return;
        }

        if (st.kind === 'bg') {
          const dx = ev.clientX - st.startX;
          const dy = ev.clientY - st.startY;
          const nextLeft = clamp(st.left + dx, st.minLeft, 0);
          const nextTop  = clamp(st.top  + dy, st.minTop,  0);
          const maxOffsetX = Math.max(0, st.dispW - st.contW);
          const maxOffsetY = Math.max(0, st.dispH - st.contH);
          const xPerc = maxOffsetX ? (-nextLeft / maxOffsetX) * 100 : 50;
          const yPerc = maxOffsetY ? (-nextTop  / maxOffsetY) * 100 : 50;
          (st.targetEl as HTMLElement).style.setProperty('background-position-x', `${xPerc}%`, 'important');
          (st.targetEl as HTMLElement).style.setProperty('background-position-y', `${yPerc}%`, 'important');
          return;
        }
      };

      const onUp = () => {
        if (imgDragState.current?.active && imgDragState.current.doc === doc) {
          if (imgDragState.current.kind === 'img' && imgDragState.current.mode === 'objpos') {
            const el = imgDragState.current.targetEl as HTMLImageElement;
            el.removeAttribute('data-cv-left');
            el.removeAttribute('data-cv-top');
          }
          logd('end IMG/BG', { slideIndex: imgDragState.current.slideIndex });
          imgDragState.current = null;
        }
      };

      const cleanupDrag = () => { if (imgDragState.current?.doc === doc) imgDragState.current = null; };

      doc.addEventListener('click', onClickCapture, true);
      doc.addEventListener('dblclick', onDblClick, true);
      doc.addEventListener('blur', onBlur, true);
      doc.addEventListener('mousedown', onMouseDownCapture, true);
      doc.addEventListener('mousemove', onMove);
      doc.addEventListener('mouseup', onUp);
      ifr.contentWindow?.addEventListener('blur', cleanupDrag);
      doc.addEventListener('mouseleave', cleanupDrag);

      disposers.push(() => {
        try { doc.removeEventListener('click', onClickCapture, true); } catch {}
        try { doc.removeEventListener('dblclick', onDblClick, true); } catch {}
        try { doc.removeEventListener('blur', onBlur, true); } catch {}
        try { doc.removeEventListener('mousedown', onMouseDownCapture, true); } catch {}
        try { doc.removeEventListener('mousemove', onMove); } catch {}
        try { doc.removeEventListener('mouseup', onUp); } catch {}
        try { ifr.contentWindow?.removeEventListener('blur', cleanupDrag); } catch {}
        try { doc.removeEventListener('mouseleave', cleanupDrag); } catch {}
      });

      logb('delegation wired', { slideIndex });
    };

    // Limpa disposers anteriores se existirem
    disposers.forEach(d => d());
    disposers.length = 0;

    iframeRefs.current.forEach((ifr, idx) => { 
      if (ifr) {
        const setup = () => {
          const doc = ifr.contentDocument || ifr.contentWindow?.document;
          if (!doc) return;
          
          // IMPORTANTE: Sempre permite reconfiguração quando o useEffect roda
          // Isso é necessário porque cada aba tem sua própria instância do componente
          setupIframe(ifr, idx);
        };
        
        // Para o primeiro slide, aguarda um pouco mais para garantir renderização
        const delay = idx === 0 ? 150 : 50;
        
        setTimeout(() => {
          const doc = ifr.contentDocument || ifr.contentWindow?.document;
          if (doc && doc.readyState === 'complete') {
            setup();
          } else {
            // Adiciona listener de load E também tenta novamente após delay maior
            ifr.addEventListener('load', setup, { once: true });
            
            // Fallback: tenta novamente após delay maior caso o evento load não dispare
            setTimeout(() => {
              const docRetry = ifr.contentDocument || ifr.contentWindow?.document;
              if (docRetry && docRetry.readyState === 'complete') {
                setup();
              }
            }, delay + 200);
          }
        }, delay);
      }
    });
    
    return () => { 
      // Cleanup: remove todos os listeners registrados
      disposers.forEach(d => d()); 
      disposers.length = 0;
    };
  }, [renderedSlides]);

  /** ===== Layers ===== */
  const toggleLayer = (index: number) => {
    const s = new Set(expandedLayers);
    s.has(index) ? s.delete(index) : s.add(index);
    setExpandedLayers(s);
  };

  const handleSlideClick = (index: number) => {
    clearAllSelections();
    setFocusedSlide(index);
    setSelectedElement({ slideIndex: index, element: null });
    selectedImageRefs.current[index] = null;

    const totalWidth = slideWidth * slides.length + gap * (slides.length - 1);
    const slidePosition = index * (slideWidth + gap) - totalWidth / 2 + slideWidth / 2;
    setPan({ x: -slidePosition * zoom, y: 0 });
  };

  const handleElementClick = (slideIndex: number, element: ElementType) => {
    setIsLoadingProperties(true);

    clearAllSelections();

    const iframe = iframeRefs.current[slideIndex];
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;

    if (doc && element) {
      const target = doc.getElementById(`slide-${slideIndex}-${element}`);
      if (target) {
        target.classList.add('selected');
        (target as HTMLElement).style.zIndex = '1000';
      } else if (element === 'background') {
        doc.body.classList.add('selected');
        (doc.body as HTMLElement).style.zIndex = '1000';
      }

      if (element === 'title' || element === 'subtitle') {
        try {
          readAndStoreComputedTextStyles(
            doc,
            slideIndex,
            element as 'title' | 'subtitle',
            setOriginalStyles
          );
        } catch {}
      }
    }

    setSelectedElement({ slideIndex, element });
    setFocusedSlide(slideIndex);
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setTimeout(() => setIsLoadingProperties(false), 80);
  };

  /** ===== State helpers ===== */
  const getElementKey = (slideIndex: number, element: ElementType) => `${slideIndex}-${element}`;
  const getEditedValue = (slideIndex: number, field: string, def: any) => {
    const k = `${slideIndex}-${field}`;
    return editedContent[k] !== undefined ? editedContent[k] : def;
  };
  const updateEditedValue = (slideIndex: number, field: string, value: any) => {
    const k = `${slideIndex}-${field}`;
    setEditedContent(prev => ({ ...prev, [k]: value }));
  };
  const getElementStyle = (slideIndex: number, element: ElementType): ElementStyles => {
    const k = getElementKey(slideIndex, element);
    if (elementStyles[k]) return elementStyles[k];
    if (originalStyles[k]) return originalStyles[k];
    return { fontSize: element === 'title' ? '24px' : '16px', fontWeight: element === 'title' ? '700' : '400', textAlign: 'left', color: '#FFFFFF' };
    };
  const updateElementStyle = (slideIndex: number, element: ElementType, prop: keyof ElementStyles, value: string) => {
    const k = getElementKey(slideIndex, element);
    setElementStyles(prev => ({ ...prev, [k]: { ...getElementStyle(slideIndex, element), [prop]: value } }));
  };

  /** ===== BG change / Upload / Busca ===== */
  const handleBackgroundImageChange = (slideIndex: number, imageUrl: string) => {
    const ifr = iframeRefs.current[slideIndex];
    const d = ifr?.contentDocument || ifr?.contentWindow?.document;
    if (!d) {
      updateEditedValue(slideIndex, 'background', imageUrl);
      return;
    }

    const selectedImg = selectedImageRefs.current[slideIndex];
    if (selectedImg) {
      try {
        if (isVideoUrl(imageUrl)) {
          const { wrapper } = ensureImgCropWrapper(d, selectedImg);
          const video = d.createElement('video');
          video.src = imageUrl;
          video.setAttribute('data-editable', 'video');
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;
          video.loop = true;
          video.autoplay = false;
          video.preload = 'metadata';
          try { video.pause(); } catch {}
          video.style.objectFit = 'cover';
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.position = 'absolute';
          (video.style as any).inset = '0';

          killPlayOverlays(wrapper);
          wrapper.replaceChild(video, selectedImg);
          forceVideoStyle(video);
          try { video.load(); } catch {}
          attachPlayOverlay(d, wrapper, video);
          ensureHostResizeObserver(wrapper);
          normFill(wrapper);

          cleanupAltArtifacts(wrapper);
          queueMicrotask(() => { try { cleanupAltArtifacts(wrapper); } catch {} });

          selectedImageRefs.current[slideIndex] = null;
          wrapper.removeAttribute('data-cv-selected');
          video.classList.add('selected');
        } else {
          selectedImg.removeAttribute('srcset');
          selectedImg.removeAttribute('sizes');
          selectedImg.loading = 'eager';
          selectedImg.src = imageUrl;
          selectedImg.setAttribute('data-bg-image-url', imageUrl);

          const { wrapper } = ensureImgCropWrapper(d, selectedImg);
          wrapper.setAttribute('data-cv-selected', '1');
          killPlayOverlays(wrapper);
          removeAllPlayOverlays(d);
          cleanupAltArtifacts(wrapper);
          queueMicrotask(() => { try { cleanupAltArtifacts(wrapper); } catch {} });
          ensureHostResizeObserver(wrapper);
          normFill(wrapper);
        }
      } catch {}
    } else {
      const updatedEl = applyBackgroundImageImmediate(slideIndex, imageUrl, iframeRefs.current);
      clearAllSelections();
      if (updatedEl) {
        if ((updatedEl as HTMLElement).tagName === 'IMG') {
          const { wrapper } = ensureImgCropWrapper(d!, updatedEl as HTMLImageElement);
          wrapper.setAttribute('data-cv-selected', '1');
          selectedImageRefs.current[slideIndex] = updatedEl as HTMLImageElement;
          killPlayOverlays(wrapper);
          removeAllPlayOverlays(d!);
          cleanupAltArtifacts(wrapper);
          queueMicrotask(() => { try { cleanupAltArtifacts(wrapper); } catch {} });
          ensureHostResizeObserver(wrapper);
          normFill(wrapper);
        } else {
          selectedImageRefs.current[slideIndex] = null;
          const isVideoNow = isVideoUrl(imageUrl);
          if (!isVideoNow) removeAllPlayOverlays(d!);
          if ((updatedEl as HTMLElement)) { ensureHostResizeObserver(updatedEl as HTMLElement); normFill(updatedEl as HTMLElement); }
        }
      }
    }

    try {
      const d2 = iframeRefs.current[slideIndex]?.contentDocument || iframeRefs.current[slideIndex]?.contentWindow?.document;
      if (d2 && !isVideoUrl(imageUrl)) killPlayOverlays(d2.body);
    } catch {}

    setSelectedElement({ slideIndex, element: 'background' });
    if (!expandedLayers.has(slideIndex)) toggleLayer(slideIndex);
    setFocusedSlide(slideIndex);
    updateEditedValue(slideIndex, 'background', imageUrl);

    setTimeout(() => {
      try {
        const ev = new Event('cv-rebind');
        d?.dispatchEvent(ev);
      } catch {}
    }, 50);
  };

  /** ===== Busca ===== */
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

  /** ===== Upload ===== */
  const handleImageUpload = (slideIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setUploadedImages(prev => ({ ...prev, [slideIndex]: url }));
      handleBackgroundImageChange(slideIndex, url);
    };
    reader.readAsDataURL(file);
  };

  /** ===== Download ===== */
  const handleDownloadAll = () => {
    renderedSlides.forEach((slide, index) => {
      const blob = new Blob([slide], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `slide-${index + 1}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  /** ===== Render ===== */
  return (
    <div 
      className="absolute inset-0 bg-neutral-900 flex" 
      style={{ zIndex: 1 }}
    >
      <LayersSidebar
        slides={slides}
        carouselData={data}
        expandedLayers={expandedLayers}
        focusedSlide={focusedSlide}
        selectedElement={selectedElement}
        onToggleLayer={toggleLayer}
        onElementClick={handleElementClick}
        onSlideClick={handleSlideClick}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          slidesCount={slides.length}
          zoom={zoom}
          onZoomIn={() => setZoom(p => Math.min(2, p + 0.1))}
          onZoomOut={() => setZoom(p => Math.max(0.1, p - 0.1))}
          onDownload={handleDownloadAll}
          onClose={onClose}
        />

        <CanvasArea
          zoom={zoom}
          pan={pan}
          isDragging={isDragging}
          dragStart={dragStart}
          slideWidth={slideWidth}
          slideHeight={slideHeight}
          gap={gap}
          slides={slides}
          renderedSlides={renderedSlides}
          focusedSlide={focusedSlide}
          iframeRefs={iframeRefs}
          onWheel={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const container = containerRef.current!;
            const rect = container.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left - pan.x) / zoom;
            const mouseY = (e.clientY - rect.top  - pan.y) / zoom;

            if (e.ctrlKey || e.metaKey) {
              // Zoom com Ctrl/Cmd + Scroll
              const delta = e.deltaY > 0 ? -0.05 : 0.05;
              const newZoom = Math.min(Math.max(0.1, zoom + delta), 2);
              setZoom(newZoom);
              setPan({
                x: e.clientX - rect.left - mouseX * newZoom,
                y: e.clientY - rect.top  - mouseY * newZoom,
              });
            } else {
              // Pan com scroll normal (dois dedos no trackpad ou scroll horizontal)
              // DeltaX > 0 = scroll para direita, movemos canvas para esquerda (pan.x diminui)
              // DeltaY > 0 = scroll para baixo, movemos canvas para cima (pan.y diminui)
              setPan(prev => ({ 
                x: prev.x - e.deltaX, 
                y: prev.y - e.deltaY 
              }));
            }
          }}
          onMouseDown={(e) => {
            if (e.button === 0 && e.currentTarget === e.target) {
              setIsDragging(true);
              setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            }
          }}
          onMouseMove={(e) => {
            if (isDragging) {
              setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
            }
          }}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        />
      </div>

      <PropertiesPanel
        selectedElement={selectedElement}
        carouselData={data}
        editedContent={editedContent}
        isLoadingProperties={isLoadingProperties}
        searchKeyword={searchKeyword}
        searchResults={searchResults}
        isSearching={isSearching}
        uploadedImages={uploadedImages}
        onUpdateEditedValue={updateEditedValue}
        onUpdateElementStyle={updateElementStyle}
        onBackgroundImageChange={handleBackgroundImageChange}
        onSearchKeywordChange={setSearchKeyword}
        onSearchImages={handleSearchImages}
        onImageUpload={handleImageUpload}
        getElementStyle={getElementStyle}
        getEditedValue={getEditedValue}
      />
    </div>
  );
};

export default CarouselViewer;