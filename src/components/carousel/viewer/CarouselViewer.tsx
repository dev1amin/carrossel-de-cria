// CarouselViewer.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CarouselData, ElementType, ElementStyles } from '../../../types/carousel';
import { AVAILABLE_TEMPLATES } from '../../../types/carousel';
import { searchImages, templateRenderer } from '../../../services/carousel';
import { updateGeneratedContent, getGeneratedContent } from '../../../services/generatedContent';
import Toast, { type ToastMessage } from '../../Toast';
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
  syncContainerWithContent,
  applyBackgroundImageImmediate,
  layoutReady
} from './viewerUtils';

interface CarouselViewerProps {
  slides: string[];
  carouselData: CarouselData;
  onClose: () => void;
  generatedContentId?: number; // ID do GeneratedContent na API
  onSaveSuccess?: () => void; // Callback chamado após salvar com sucesso
}

/** ========= Drag State (module-level) ========= */
const imgDragState = { current: null as ImgDragState | null };
const videoCropState = { current: null as VideoCropState | null };

/** ========= Componente ========= */
const CarouselViewer: React.FC<CarouselViewerProps> = ({ slides, carouselData, onClose, generatedContentId, onSaveSuccess }) => {
  console.log('🎨 CarouselViewer montado:', { 
    slidesLength: slides?.length, 
    hasCarouselData: !!carouselData,
    carouselData,
    generatedContentId 
  });

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

  // Obtém a compatibilidade do template
  const templateCompatibility = React.useMemo(() => {
    const templateId = (data as any).dados_gerais?.template || '1';
    const template = AVAILABLE_TEMPLATES.find((t) => t.id === templateId);
    return template?.compatibility || 'video-image';
  }, [(data as any).dados_gerais?.template]);

  // IMPORTANTE: Configura a compatibilidade do template no renderer
  React.useEffect(() => {
    templateRenderer.setTemplateCompatibility(templateCompatibility);
    console.log(`🎨 CarouselViewer: Template compatibility set to: ${templateCompatibility}`);
  }, [templateCompatibility]);

  // CRÍTICO: Remove vídeos dos iframes se o template não suportar
  React.useEffect(() => {
    if (templateCompatibility === 'image-only' || templateCompatibility === 'text-only') {
      console.log('🚫 Removing videos from iframes (template does not support videos)...');
      
      // Aguarda os iframes carregarem
      const timeout = setTimeout(() => {
        iframeRefs.current.forEach((ifr, slideIndex) => {
          if (!ifr?.contentDocument) return;
          
          const doc = ifr.contentDocument;
          const conteudo = (data as any).conteudos?.[slideIndex];
          if (!conteudo) return;
          
          // Encontra alternativa de imagem
          const alternatives = [
            conteudo.imagem_fundo2,
            conteudo.imagem_fundo3
          ].filter((url: string) => url && !url.match(/\.(mp4|webm|ogg|mov)(\?|$)/i));
          
          const alternativeImg = alternatives[0];
          
          console.log(`🔍 Slide ${slideIndex}: Checking for videos...`);
          
          // Remove vídeos e substitui por imagem alternativa
          doc.querySelectorAll('video').forEach((video) => {
            console.log(`   ❌ Found video element, removing...`);
            
            if (alternativeImg) {
              // Substitui vídeo por imagem
              const img = doc.createElement('img');
              img.src = alternativeImg;
              img.style.cssText = video.style.cssText;
              img.className = video.className;
              img.setAttribute('data-editable', 'image');
              
              if (video.parentElement) {
                video.parentElement.replaceChild(img, video);
                console.log(`   ✅ Replaced with image: ${alternativeImg}`);
              }
            } else {
              // Remove o vídeo completamente
              video.remove();
              console.log(`   ⚠️ No alternative found, video removed`);
            }
          });
          
          // Remove containers de vídeo vazios
          doc.querySelectorAll('.video-container').forEach((container) => {
            if (!container.querySelector('video, img')) {
              console.log(`   🗑️ Removing empty video container`);
              container.remove();
            }
          });
          
          // Remove atributo data-video-bg do body
          const body = doc.querySelector('body');
          if (body?.hasAttribute('data-video-bg')) {
            console.log(`   🗑️ Removing data-video-bg attribute`);
            body.removeAttribute('data-video-bg');
            
            // Se tem alternativa, aplica como background
            if (alternativeImg) {
              body.style.backgroundImage = `url('${alternativeImg}')`;
              body.style.backgroundSize = 'cover';
              body.style.backgroundPosition = 'center';
              console.log(`   ✅ Applied alternative as background`);
            }
          }
        });
      }, 500); // Aguarda 500ms para garantir que iframes carregaram
      
      return () => clearTimeout(timeout);
    }
  }, [templateCompatibility, slides, data]);

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
  const [isLayersMinimized, setIsLayersMinimized] = useState(false);
  const [isPropertiesMinimized, setIsPropertiesMinimized] = useState(false);

  const [editedContent, setEditedContent] = useState<Record<string, any>>({});
  const [elementStyles, setElementStyles] = useState<Record<string, ElementStyles>>({});
  const [originalStyles, setOriginalStyles] = useState<Record<string, ElementStyles>>({});
  const [renderedSlides, setRenderedSlides] = useState<string[]>(slides);

  const [isLoadingProperties, setIsLoadingProperties] = useState(false);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<Record<number, string>>({});
  
  // Estados para salvar mudanças
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [contentId, setContentId] = useState<number | undefined>(generatedContentId);

  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImageRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const lastSearchId = useRef(0);
  const disposersRef = useRef<Array<() => void>>([]);

  /** Helper: Adicionar toast */
  const addToast = (message: string, type: 'success' | 'error') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  /** Busca automática do generatedContentId quando o editor é aberto */
  useEffect(() => {
    // Se já tem o ID, não precisa buscar
    if (contentId) {
      console.log('✅ generatedContentId já existe:', contentId);
      return;
    }

    // Se não tem o primeiro título, não dá para buscar
    const firstTitle = (data as any).conteudos?.[0]?.title;
    if (!firstTitle) {
      console.log('⚠️ Primeiro título não encontrado, não é possível buscar ID');
      return;
    }

    console.log('🔍 Editor aberto: Buscando generatedContentId na API...');
    console.log('🎯 Buscando por título:', firstTitle);

    const fetchContentId = async () => {
      try {
        // Busca todos os conteúdos gerados
        const response = await getGeneratedContent({ limit: 100 });
        console.log('📥 Conteúdos encontrados:', response.data?.length || 0);

        // Procura pelo conteúdo que tem o mesmo primeiro título
        const matchingContent = response.data?.find((content: any) => {
          try {
            const result = typeof content.result === 'string'
              ? JSON.parse(content.result)
              : content.result;

            const contentFirstTitle = result?.conteudos?.[0]?.title;
            const matches = contentFirstTitle === firstTitle;

            if (matches) {
              console.log('✅ Encontrado match:', {
                id: content.id,
                title: contentFirstTitle
              });
            }

            return matches;
          } catch (e) {
            return false;
          }
        });

        if (matchingContent) {
          setContentId(matchingContent.id);
          console.log('🎉 generatedContentId encontrado e salvo:', matchingContent.id);
          addToast('ID do conteúdo encontrado! Você pode salvar alterações.', 'success');
        } else {
          console.log('⚠️ Nenhum conteúdo correspondente encontrado');
        }
      } catch (error) {
        console.error('❌ Erro ao buscar generatedContentId:', error);
      }
    };

    fetchContentId();
  }, []); // Executa apenas uma vez quando o componente é montado

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
      // Limpa seleção de containers de vídeo também
      d.querySelectorAll('.video-container.selected, .video-container[data-cv-selected="1"]').forEach((el) => {
        el.classList.remove('selected');
        (el as HTMLElement).removeAttribute('data-cv-selected');
        (el as HTMLElement).style.zIndex = '';
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

      const ifr = iframeRefs.current[slideIndex];
      const doc = ifr?.contentDocument || ifr?.contentWindow?.document;
      
      // Aplicar estilos de texto (title e subtitle)
      if (field === 'title' || field === 'subtitle') {
        const el = doc?.getElementById(`slide-${slideIndex}-${field}`) as HTMLElement | null;
        if (!el) return;

        if (sty.fontSize)  el.style.fontSize  = sty.fontSize;
        if (sty.fontWeight) el.style.fontWeight = String(sty.fontWeight);
        if (sty.textAlign) el.style.textAlign = sty.textAlign as any;
        if (sty.color)     el.style.color     = sty.color;
      }
      
      // Aplicar estilos de posição da imagem/vídeo/background
      if (field === 'background') {
        if (!doc) return;
        
        // Tenta aplicar em imagens
        const img = doc.querySelector('img[data-editable="image"]') as HTMLImageElement | null;
        if (img && sty.objectPosition) {
          img.style.setProperty('object-position', sty.objectPosition, 'important');
          logd('applied saved img position', { slideIndex, objectPosition: sty.objectPosition });
        }
        
        // Tenta aplicar em vídeos
        const video = doc.querySelector('video[data-editable="video"]') as HTMLVideoElement | null;
        if (video && sty.objectPosition) {
          video.style.setProperty('object-position', sty.objectPosition, 'important');
          logd('applied saved video position', { slideIndex, objectPosition: sty.objectPosition });
        }
        
        // Tenta aplicar em backgrounds CSS
        if (sty.backgroundPositionX || sty.backgroundPositionY) {
          // Procura por elementos que possam ter background-image
          const bgElements = doc.querySelectorAll('[data-editable="background"], body, div, section, header, main, figure, article');
          bgElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            const cs = doc.defaultView?.getComputedStyle(htmlEl);
            if (cs?.backgroundImage?.includes('url(')) {
              if (sty.backgroundPositionX) {
                htmlEl.style.setProperty('background-position-x', sty.backgroundPositionX, 'important');
              }
              if (sty.backgroundPositionY) {
                htmlEl.style.setProperty('background-position-y', sty.backgroundPositionY, 'important');
              }
              logd('applied saved bg position', { 
                slideIndex, 
                backgroundPositionX: sty.backgroundPositionX, 
                backgroundPositionY: sty.backgroundPositionY 
              });
            }
          });
        }
      }
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
      /* Desabilita seleção de texto no editor (exceto quando editando) */
      * {
        user-select: none !important;
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
      }
      [contenteditable="true"] {
        user-select: text !important;
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
      }
      
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
      
      /* Seleção visual para containers de vídeo */
      .video-container.selected,
      .video-container[data-cv-selected="1"]{
        outline:3px solid #3B82F6!important;
        outline-offset:2px;
        z-index:1000;
      }
      .video-container {
        cursor: pointer !important;
      }
      .video-container:hover:not(.selected):not([data-cv-selected="1"]){
        outline:2px solid rgba(59,130,246,.5)!important;
        outline-offset:2px;
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
    
    // Carrega estilos salvos se existirem
    if (data.styles) {
      console.log('📐 Carregando estilos salvos:', data.styles);
      const loadedStyles: Record<string, ElementStyles> = {};
      
      Object.entries(data.styles).forEach(([slideIndex, slideStyles]: [string, any]) => {
        Object.entries(slideStyles).forEach(([elementType, styles]: [string, any]) => {
          const key = `${slideIndex}-${elementType}`;
          loadedStyles[key] = styles as ElementStyles;
        });
      });
      
      console.log('📐 Estilos convertidos para formato interno:', loadedStyles);
      setElementStyles(loadedStyles);
    }
    
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
  }, [slides, data.styles]);

  // Reseta o slide focado e LIMPA OS ESTILOS quando mudar de carrossel
  useEffect(() => {
    console.log('🎯 Resetando para o primeiro slide e limpando estilos');
    setFocusedSlide(0);
    setSelectedElement({ slideIndex: 0, element: null });
    
    // CRÍTICO: Limpa os estilos editados e originais para evitar vazamento entre carrosséis
    setElementStyles({});
    setOriginalStyles({});
    setEditedContent({});
    
    console.log('✅ Estilos limpos - cada carrossel terá seus próprios estilos');
  }, [slides]); // Executa quando mudar de carrossel

  // CARREGA os estilos salvos do carrossel quando abre no editor
  useEffect(() => {
    if (!data.styles) {
      console.log('📭 Nenhum estilo salvo encontrado para este carrossel');
      return;
    }

    console.log('📥 Carregando estilos salvos do carrossel:', data.styles);
    
    // Converte o formato de data.styles para elementStyles
    const loadedStyles: Record<string, ElementStyles> = {};
    
    Object.entries(data.styles).forEach(([slideIndex, slideStyles]: [string, any]) => {
      if (slideStyles && typeof slideStyles === 'object') {
        Object.entries(slideStyles).forEach(([element, styles]: [string, any]) => {
          const key = `${slideIndex}-${element}`;
          loadedStyles[key] = styles as ElementStyles;
        });
      }
    });
    
    setElementStyles(loadedStyles);
    console.log('✅ Estilos carregados:', Object.keys(loadedStyles).length, 'elementos');
  }, [data.styles, slides]); // Carrega quando o carrossel muda ou os estilos mudam

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
      
      // Extrai todas as URLs do backgroundImage (pode ter linear-gradient + url)
      const backgroundImage = cs?.backgroundImage || '';
      console.log('🖼️ startBgDrag - backgroundImage:', backgroundImage);
      
      const urlMatches = backgroundImage.match(/url\(["']?([^)"']+)["']?\)/gi);
      console.log('🔍 URLs encontradas:', urlMatches);
      
      if (!urlMatches || urlMatches.length === 0) {
        console.warn('❌ Nenhuma URL encontrada no background');
        return;
      }
      
      // Pega a última URL (geralmente é a imagem de fundo real, depois dos gradientes)
      const lastUrlMatch = urlMatches[urlMatches.length - 1];
      const bg = lastUrlMatch.match(/url\(["']?([^)"']+)["']?\)/i)?.[1];
      
      console.log('✅ URL da imagem extraída:', bg);
      
      if (!bg) {
        console.warn('❌ Falha ao extrair URL');
        return;
      }

      let r = cont.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { await layoutReady(doc); r = cont.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return; }

      const tmp = new Image(); tmp.crossOrigin = 'anonymous'; tmp.src = bg;
      
      const go = (useFallback = false) => {
        // Se CORS falhou ou imagem não carregou, usa dimensões estimadas baseadas no container
        let natW: number, natH: number;
        
        if (useFallback || !tmp.naturalWidth || !tmp.naturalHeight) {
          // Estimativa: assume proporção 16:9 ou usa dimensões do container
          const aspectRatio = 16 / 9;
          if (r.width / r.height > aspectRatio) {
            // Container mais largo que 16:9
            natW = r.width;
            natH = r.width / aspectRatio;
          } else {
            // Container mais alto que 16:9
            natH = r.height;
            natW = r.height * aspectRatio;
          }
          console.warn('⚠️ Usando dimensões estimadas (CORS ou erro):', { natW, natH });
        } else {
          natW = tmp.naturalWidth;
          natH = tmp.naturalHeight;
        }
        
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
        console.log('✅ Background drag INICIADO:', { 
          slideIndex, 
          contW: r.width, 
          contH: r.height, 
          displayW, 
          displayH,
          natW,
          natH,
          usedFallback: useFallback,
          element: cont.tagName,
          backgroundImage: cs?.backgroundImage.substring(0, 80)
        });
        logd('start BG', { slideIndex, contW:r.width, contH:r.height, displayW, displayH });
      };
      
      console.log('📥 Carregando imagem do background:', bg);
      if (tmp.complete && tmp.naturalWidth) {
        console.log('✅ Imagem já estava carregada');
        go();
      } else {
        console.log('⏳ Aguardando carregamento da imagem...');
        
        // Timeout: se não carregar em 2 segundos, usa fallback
        const timeout = setTimeout(() => {
          console.warn('⏱️ Timeout ao carregar imagem, usando fallback');
          go(true);
        }, 2000);
        
        tmp.onload = () => {
          clearTimeout(timeout);
          console.log('✅ Imagem carregada!');
          go();
        };
        
        tmp.onerror = () => {
          clearTimeout(timeout);
          console.warn('⚠️ Erro de CORS ou imagem não encontrada, usando fallback');
          go(true); // Usa dimensões estimadas quando há erro
        };
      }
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

      // IMPORTANTE: Capturar os estilos originais dos elementos de texto ANTES de qualquer manipulação
      // Isso garante que o PropertiesPanel mostre os valores corretos do template
      try {
        readAndStoreComputedTextStyles(doc, slideIndex, 'title', setOriginalStyles);
        readAndStoreComputedTextStyles(doc, slideIndex, 'subtitle', setOriginalStyles);
      } catch (e) {
        console.warn('⚠️ Erro ao capturar estilos originais:', e);
      }

      try { cleanupAltArtifacts(doc.body); } catch {}
    //doc.body.style.visibility = 'visible';

      // REMOVIDO: Não manipular textAlign, position ou mover elementos do template
      // Os templates definem o posicionamento e alinhamento corretos
      // Não devemos alterar esses estilos automaticamente

      const onClickCapture = (ev: MouseEvent) => {
        const target = ev.target as HTMLElement | null;
        if (!target) return;

        clearAllSelections();

        const clickedVideo = target.closest('video') as HTMLVideoElement | null;
        if (clickedVideo) {
          clickedVideo.setAttribute('data-editable', 'video');
          const host = (clickedVideo.parentElement as HTMLElement | null);
          
          // Aplica seleção visual no CONTAINER, não no vídeo
          if (host) {
            host.classList.add('selected');
            (host as HTMLElement).style.zIndex = '1000';
            host.setAttribute('data-cv-selected', '1');
            attachResizePinchers(doc, host);
            ensureHostResizeObserver(host);
            normFill(host);
          }
          
          setSelectedElement({ slideIndex, element: 'background' });
          setFocusedSlide(slideIndex);
          if (!expandedLayers.has(slideIndex)) setExpandedLayers(s => new Set(s).add(slideIndex));
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
        console.log('🖱️ onMouseDownCapture chamado', { target: (ev.target as HTMLElement)?.tagName });
        
        if (videoCropState.current?.active) return;
        const t = ev.target as HTMLElement | null;
        if (!t) return;

        const vid = t.closest('video[data-editable="video"]') as HTMLVideoElement | null;
        if (vid) { 
          console.log('🎬 Iniciando drag de vídeo');
          void startVideoDrag(doc, slideIndex, vid, ev); 
          return; 
        }

        const img = t.closest('img[data-editable="image"]') as HTMLImageElement | null;
        if (img) { 
          console.log('🖼️ Iniciando drag de imagem');
          void startImgDrag(doc, slideIndex, img, ev); 
          return; 
        }

        console.log('🔍 Procurando por elemento com background...');
        
        // ESTRATÉGIA 1: Procura por elemento .bg no mesmo container (para templates onde .bg está atrás do conteúdo)
        const bgDiv = doc.querySelector('.bg') as HTMLElement | null;
        if (bgDiv) {
          const cs = doc.defaultView?.getComputedStyle(bgDiv);
          const bgImage = cs?.backgroundImage || '';
          console.log('🎨 Encontrado .bg div:', bgImage.substring(0, 80));
          
          if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
            console.log('🎯 Usando .bg div para drag');
            void startBgDrag(doc, slideIndex, bgDiv, ev);
            return;
          }
        }
        
        // ESTRATÉGIA 2: Verifica o body que pode ter data-editable="background"
        if (doc.body) {
          const csBody = doc.defaultView?.getComputedStyle(doc.body);
          const bgImageBody = csBody?.backgroundImage || '';
          console.log('🎨 Verificando body:', bgImageBody.substring(0, 80));
          
          if (bgImageBody && bgImageBody !== 'none' && bgImageBody.includes('url(')) {
            console.log('🎯 Usando body para drag');
            void startBgDrag(doc, slideIndex, doc.body, ev);
            return;
          }
        }
        
        // ESTRATÉGIA 3: Procura subindo na árvore DOM a partir do elemento clicado
        let bgEl: HTMLElement | null = t;
        let depth = 0;
        while (bgEl && bgEl !== doc.body.parentElement && depth < 20) {
          const cs = doc.defaultView?.getComputedStyle(bgEl);
          const bgImage = cs?.backgroundImage || '';
          
          console.log(`  📊 Nível ${depth}: ${bgEl.tagName}.${bgEl.className} - bg: ${bgImage.substring(0, 50)}...`);
          
          // Verifica se tem url() no backgroundImage (pode ter gradient também)
          if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
            console.log('🎯 Encontrado elemento com background na árvore:', {
              element: bgEl.tagName,
              className: bgEl.className,
              id: bgEl.id,
              backgroundImage: bgImage
            });
            void startBgDrag(doc, slideIndex, bgEl, ev);
            return;
          }
          
          bgEl = bgEl.parentElement;
          depth++;
        }
        
        console.log('❌ Nenhum elemento com background encontrado após todas as estratégias');
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
          const dragState = imgDragState.current;
          const dragSlideIndex = dragState.slideIndex;
          
          if (dragState.kind === 'img' && dragState.mode === 'objpos') {
            const el = dragState.targetEl as HTMLImageElement;
            const computedStyle = doc.defaultView?.getComputedStyle(el);
            const objectPosition = computedStyle?.objectPosition || '50% 50%';
            
            // Salva a posição da imagem nos estilos
            const key = `${dragSlideIndex}-background`;
            setElementStyles(prev => ({
              ...prev,
              [key]: {
                ...prev[key],
                objectPosition: objectPosition
              }
            }));
            setHasUnsavedChanges(true);
            
            el.removeAttribute('data-cv-left');
            el.removeAttribute('data-cv-top');
            logd('saved img position', { slideIndex: dragSlideIndex, objectPosition });
          } else if (dragState.kind === 'bg' && dragState.mode === 'objpos') {
            const el = dragState.targetEl as HTMLElement;
            const computedStyle = doc.defaultView?.getComputedStyle(el);
            const backgroundPositionX = computedStyle?.backgroundPositionX || '50%';
            const backgroundPositionY = computedStyle?.backgroundPositionY || '50%';
            
            // Salva a posição do background nos estilos
            const key = `${dragSlideIndex}-background`;
            setElementStyles(prev => ({
              ...prev,
              [key]: {
                ...prev[key],
                backgroundPositionX: backgroundPositionX,
                backgroundPositionY: backgroundPositionY
              }
            }));
            setHasUnsavedChanges(true);
            
            logd('saved bg position', { slideIndex: dragSlideIndex, backgroundPositionX, backgroundPositionY });
          } else if (dragState.kind === 'vid' && dragState.mode === 'objpos') {
            const el = dragState.targetEl as HTMLVideoElement;
            const computedStyle = doc.defaultView?.getComputedStyle(el);
            const objectPosition = computedStyle?.objectPosition || '50% 50%';
            
            // Salva a posição do vídeo nos estilos
            const key = `${dragSlideIndex}-background`;
            setElementStyles(prev => ({
              ...prev,
              [key]: {
                ...prev[key],
                objectPosition: objectPosition
              }
            }));
            setHasUnsavedChanges(true);
            
            logd('saved video position', { slideIndex: dragSlideIndex, objectPosition });
          }
          
          logd('end IMG/BG', { slideIndex: dragSlideIndex });
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

    // Função para aplicar estilos salvos aos elementos do slide
    const applyStylesFromState = (ifr: HTMLIFrameElement, slideIndex: number) => {
      const doc = ifr.contentDocument || ifr.contentWindow?.document;
      if (!doc) return;

      // Aplica estilos de texto editado
      Object.entries(editedContent).forEach(([k, val]) => {
        const [slideStr, field] = k.split('-');
        const idx = Number(slideStr);
        if (idx !== slideIndex || Number.isNaN(idx)) return;
        if (field !== 'title' && field !== 'subtitle') return;

        const el = doc.getElementById(`slide-${slideIndex}-${field}`);
        if (el && typeof val === 'string') {
          el.textContent = val;
        }
      });

      // Aplica estilos CSS salvos
      Object.entries(elementStyles).forEach(([k, sty]) => {
        const [slideStr, field] = k.split('-');
        const idx = Number(slideStr);
        if (idx !== slideIndex || Number.isNaN(idx)) return;

        // Aplicar estilos de texto
        if (field === 'title' || field === 'subtitle') {
          const el = doc.getElementById(`slide-${slideIndex}-${field}`) as HTMLElement | null;
          if (!el) {
            console.warn(`⚠️ Elemento não encontrado: slide-${slideIndex}-${field}`);
            return;
          }

          console.log(`🎨 Aplicando estilos ao slide ${slideIndex}, campo ${field}:`, sty);
          
          if (sty.fontSize) el.style.fontSize = sty.fontSize;
          if (sty.fontWeight) el.style.fontWeight = String(sty.fontWeight);
          if (sty.textAlign) el.style.textAlign = sty.textAlign as any;
          if (sty.color) el.style.color = sty.color;
        }

        // Aplicar estilos de posição da imagem/vídeo/background
        if (field === 'background') {
          console.log(`🎨 Aplicando estilos de posição ao slide ${slideIndex}:`, sty);
          
          // Aplica em imagens
          const img = doc.querySelector('img[data-editable="image"]') as HTMLImageElement | null;
          if (img && sty.objectPosition) {
            img.style.setProperty('object-position', sty.objectPosition, 'important');
            console.log(`📐 Aplicada posição da imagem: ${sty.objectPosition}`);
          }
          
          // Aplica em vídeos
          const video = doc.querySelector('video[data-editable="video"]') as HTMLVideoElement | null;
          if (video && sty.objectPosition) {
            video.style.setProperty('object-position', sty.objectPosition, 'important');
            console.log(`📐 Aplicada posição do vídeo: ${sty.objectPosition}`);
          }
          
          // Aplica em backgrounds CSS
          if (sty.backgroundPositionX || sty.backgroundPositionY) {
            const bgElements = doc.querySelectorAll('[data-editable="background"], body, div, section, header, main, figure, article');
            bgElements.forEach((el) => {
              const htmlEl = el as HTMLElement;
              const cs = doc.defaultView?.getComputedStyle(htmlEl);
              if (cs?.backgroundImage?.includes('url(')) {
                if (sty.backgroundPositionX) {
                  htmlEl.style.setProperty('background-position-x', sty.backgroundPositionX, 'important');
                }
                if (sty.backgroundPositionY) {
                  htmlEl.style.setProperty('background-position-y', sty.backgroundPositionY, 'important');
                }
                console.log(`📐 Aplicada posição do background: ${sty.backgroundPositionX} ${sty.backgroundPositionY}`);
              }
            });
          }
        }
      });
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
          
          // Aplica estilos salvos após o setup
          applyStylesFromState(ifr, idx);
          
          // Reaplicar estilos de posição após as imagens carregarem completamente
          const docForImgs = ifr.contentDocument || ifr.contentWindow?.document;
          if (docForImgs) {
            const imgs = docForImgs.querySelectorAll('img[data-editable="image"]');
            imgs.forEach(img => {
              const imgEl = img as HTMLImageElement;
              if (imgEl.complete) {
                // Imagem já carregada, reaplicar estilos imediatamente
                setTimeout(() => applyStylesFromState(ifr, idx), 100);
              } else {
                // Aguardar carregamento da imagem
                imgEl.addEventListener('load', () => {
                  setTimeout(() => applyStylesFromState(ifr, idx), 100);
                }, { once: true });
              }
            });
          }
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

    // Abre o painel de propriedades quando um elemento é selecionado
    if (element) {
      setIsPropertiesMinimized(false);
    }

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

  // Handler para clicar no canvas (fora dos elementos)
  const handleCanvasBackgroundClick = useCallback(() => {
    // Se o painel de propriedades estiver aberto, apenas desseleciona o elemento
    // mas mantém o painel aberto
    if (!isPropertiesMinimized && selectedElement.element) {
      clearAllSelections();
      setSelectedElement({ slideIndex: selectedElement.slideIndex, element: null });
    }
    // Se estiver minimizado, não faz nada
  }, [isPropertiesMinimized, selectedElement, clearAllSelections]);

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
    // BLOQUEIA vídeos se o template não suportar
    const isVideo = imageUrl && /\.(mp4|webm|ogg|mov)(\?|$)/i.test(imageUrl);
    if (isVideo && (templateCompatibility === 'image-only' || templateCompatibility === 'text-only')) {
      console.warn(`🚫 Cannot use video in template with compatibility: ${templateCompatibility}`);
      addToast('This template does not support videos', 'error');
      return;
    }
    
    const ifr = iframeRefs.current[slideIndex];
    const d = ifr?.contentDocument || ifr?.contentWindow?.document;
    if (!d) {
      updateEditedValue(slideIndex, 'background', imageUrl);
      return;
    }

    const selectedImg = selectedImageRefs.current[slideIndex];
    
    // Detectar se há um vídeo selecionado (mesmo que selectedImg seja null)
    const selectedVideoContainer = d.querySelector('.video-container.selected, .video-container[data-cv-selected="1"]') as HTMLElement | null;
    const currentVideo = selectedVideoContainer?.querySelector('video') as HTMLVideoElement | null;
    
    // CASO ESPECIAL: Trocar de VÍDEO para IMAGEM (re-renderização completa)
    if (currentVideo && !isVideoUrl(imageUrl)) {
      console.log('🔄 Trocando de VÍDEO para IMAGEM - Re-renderização COMPLETA do slide');
      
      try {
        // PASSO 1: PRESERVAR dimensões E estilos visuais do container ANTES do reset
        const cs = d.defaultView?.getComputedStyle(selectedVideoContainer!);
        const preservedStyles = {
          width: selectedVideoContainer!.offsetWidth,
          height: selectedVideoContainer!.offsetHeight,
          borderRadius: cs?.borderRadius || '',
          boxShadow: cs?.boxShadow || '',
          marginTop: cs?.marginTop || '',
          position: cs?.position || 'relative',
          overflow: cs?.overflow || 'hidden',
        };
        
        console.log('📏 Estilos preservados:', preservedStyles);
        
        // PASSO 2: Limpar COMPLETAMENTE o vídeo
        try { currentVideo.pause(); } catch {}
        try { currentVideo.src = ''; } catch {}
        try { currentVideo.load(); } catch {}
        try { currentVideo.remove(); } catch {}
        
        // PASSO 3: Remover TODOS os overlays, pinças e listeners
        killPlayOverlays(selectedVideoContainer!);
        removeAllPlayOverlays(d);
        try { disposePinchersInDoc(d); } catch {}
        
        // PASSO 4: Limpar COMPLETAMENTE o estado do container
        selectedVideoContainer!.classList.remove('selected', 'video-container');
        selectedVideoContainer!.removeAttribute('data-cv-selected');
        selectedVideoContainer!.removeAttribute('data-cv-height');
        
        // PASSO 5: SALVAR estilos em data-attributes (backup adicional)
        selectedVideoContainer!.setAttribute('data-original-border-radius', preservedStyles.borderRadius);
        selectedVideoContainer!.setAttribute('data-original-box-shadow', preservedStyles.boxShadow);
        selectedVideoContainer!.setAttribute('data-original-margin-top', preservedStyles.marginTop);
        
        // PASSO 6: RESETAR O CONTAINER - Limpar TODO o conteúdo interno
        console.log('🧹 Limpando completamente o container...');
        selectedVideoContainer!.innerHTML = ''; // Remove TUDO do container
        selectedVideoContainer!.style.cssText = ''; // Reseta TODOS os estilos
        
        // PASSO 7: RECONSTRUIR o container como wrapper de imagem
        console.log('🏗️ Reconstruindo container como img-crop-wrapper...');
        selectedVideoContainer!.className = 'img-crop-wrapper'; // Nova identidade
        
        // Reaplica estilos estruturais
        selectedVideoContainer!.style.position = preservedStyles.position;
        selectedVideoContainer!.style.overflow = preservedStyles.overflow;
        selectedVideoContainer!.style.width = `${preservedStyles.width}px`;
        selectedVideoContainer!.style.height = `${preservedStyles.height}px`;
        
        // IMPORTANTE: Reaplica estilos visuais preservados
        if (preservedStyles.borderRadius && preservedStyles.borderRadius !== '0px') {
          selectedVideoContainer!.style.borderRadius = preservedStyles.borderRadius;
          console.log('🎨 Border-radius reaplicado:', preservedStyles.borderRadius);
        }
        if (preservedStyles.boxShadow && preservedStyles.boxShadow !== 'none') {
          selectedVideoContainer!.style.boxShadow = preservedStyles.boxShadow;
          console.log('🎨 Box-shadow reaplicado:', preservedStyles.boxShadow);
        }
        if (preservedStyles.marginTop && preservedStyles.marginTop !== '0px') {
          selectedVideoContainer!.style.marginTop = preservedStyles.marginTop;
          console.log('🎨 Margin-top reaplicado:', preservedStyles.marginTop);
        }
        
        // PASSO 8: Criar NOVO elemento de imagem do zero
        console.log('🖼️ Criando novo elemento de imagem...');
        const img = d.createElement('img');
        img.src = imageUrl;
        img.setAttribute('data-editable', 'image');
        img.setAttribute('data-bg-image-url', imageUrl);
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.loading = 'eager';
        
        // PASSO 9: Configurar imagem para preencher o container
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.objectPosition = 'center'; // Centraliza automaticamente
        img.style.display = 'block';
        img.style.margin = '0';
        img.style.padding = '0';
        
        // Preserva border-radius na imagem também (para consistência visual)
        if (preservedStyles.borderRadius && preservedStyles.borderRadius !== '0px') {
          img.style.borderRadius = preservedStyles.borderRadius;
        }
        
        // PASSO 10: INSERIR a imagem no container limpo
        selectedVideoContainer!.appendChild(img);
        
        // PASSO 11: Re-aplicar TODAS as funcionalidades do zero
        const reinitializeWrapper = () => {
          console.log('⚙️ Re-inicializando funcionalidades do wrapper...');
          
          // Re-aplica observer de resize
          ensureHostResizeObserver(selectedVideoContainer!);
          
          // Re-aplica normalização
          normFill(selectedVideoContainer!);
          
          // Re-aplica seleção visual
          selectedVideoContainer!.setAttribute('data-cv-selected', '1');
          
          // Re-aplica pinças de redimensionamento
          attachResizePinchers(d, selectedVideoContainer!);
          
          // Força reflow completo
          selectedVideoContainer!.offsetHeight;
          void selectedVideoContainer!.offsetWidth;
          
          console.log('✅ Funcionalidades re-inicializadas');
        };
        
        // Executa reinicialização quando imagem carregar
        if (img.complete && img.naturalHeight > 0) {
          console.log('✅ Imagem já carregada (cache)');
          reinitializeWrapper();
        } else {
          console.log('⏳ Aguardando carregamento da imagem...');
          img.onload = () => {
            console.log('✅ Imagem carregada');
            reinitializeWrapper();
          };
        }
        
        // Recálculo adicional após delay (garantia)
        setTimeout(() => {
          console.log('🔄 Recálculo adicional após delay...');
          reinitializeWrapper();
        }, 150);
        
        // PASSO 12: Atualizar refs e estado da aplicação
        selectedImageRefs.current[slideIndex] = img;
        setSelectedElement({ slideIndex, element: 'background' });
        setFocusedSlide(slideIndex);
        updateEditedValue(slideIndex, 'background', imageUrl);
        
        // PASSO 13: Limpeza final de artefatos
        cleanupAltArtifacts(selectedVideoContainer!);
        queueMicrotask(() => { 
          try { 
            cleanupAltArtifacts(selectedVideoContainer!); 
          } catch {} 
        });
        
        console.log('✅ ✅ ✅ Troca de VÍDEO para IMAGEM concluída com SUCESSO!');
        return;
      } catch (error) {
        console.error('❌ ❌ ❌ Erro CRÍTICO ao trocar de VÍDEO para IMAGEM:', error);
      }
    }
    
    if (selectedImg) {
      try {
        if (isVideoUrl(imageUrl)) {
          // Trocar de IMAGEM para VÍDEO
          const { wrapper } = ensureImgCropWrapper(d, selectedImg);
          
          // PRESERVAR O TAMANHO ORIGINAL DO CONTAINER antes de limpar
          const originalWidth = wrapper.offsetWidth;
          const originalHeight = wrapper.offsetHeight;
          
          // PASSO 1: Limpar completamente o estado anterior
          selectedImg.style.cssText = '';
          wrapper.style.cssText = ''; // Limpa também o wrapper
          wrapper.removeAttribute('data-cv-height'); // Remove altura anterior
          
          // PASSO 2: Criar novo elemento de vídeo
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

          // PASSO 3: Remover overlays e substituir elemento
          killPlayOverlays(wrapper);
          wrapper.replaceChild(video, selectedImg);
          
          // PASSO 4: Reconfigurar wrapper como container de vídeo
          wrapper.className = 'video-container img-crop-wrapper'; // Mantém ambas classes
          wrapper.style.position = 'relative';
          wrapper.style.overflow = 'hidden';
          
          // PRESERVAR O TAMANHO ORIGINAL (não ajustar automaticamente)
          wrapper.style.width = `${originalWidth}px`;
          wrapper.style.height = `${originalHeight}px`;
          
          // PASSO 5: Sincronizar container e vídeo (sem alterar tamanho)
          syncContainerWithContent(wrapper, video);
          
          // PASSO 6: Aplicar estilos de vídeo
          forceVideoStyle(video);
          try { video.load(); } catch {}
          attachPlayOverlay(d, wrapper, video);
          
          // PASSO 7: Força recálculo completo após DOM estabilizar
          requestAnimationFrame(() => {
            syncContainerWithContent(wrapper, video);
            ensureHostResizeObserver(wrapper);
            normFill(wrapper);
          });
          
          // Segundo recálculo após delay (garante que vídeo carregou metadados)
          setTimeout(() => {
            syncContainerWithContent(wrapper, video);
            ensureHostResizeObserver(wrapper);
            normFill(wrapper);
          }, 150);

          cleanupAltArtifacts(wrapper);
          queueMicrotask(() => { try { cleanupAltArtifacts(wrapper); } catch {} });

          selectedImageRefs.current[slideIndex] = null;
          wrapper.removeAttribute('data-cv-selected');
          video.classList.add('selected');
        } else {
          // IMAGEM → IMAGEM: Troca simples
          
          // PASSO 1: Obter wrapper ANTES de modificar para preservar tamanho
          const { wrapper } = ensureImgCropWrapper(d, selectedImg);
          
          // PRESERVAR O TAMANHO ORIGINAL DO CONTAINER
          const originalWidth = wrapper.offsetWidth;
          const originalHeight = wrapper.offsetHeight;
          
          // PASSO 2: Limpar atributos da imagem anterior
          selectedImg.removeAttribute('srcset');
          selectedImg.removeAttribute('sizes');
          selectedImg.loading = 'eager';
          wrapper.removeAttribute('data-cv-height'); // Remove altura anterior
          
          // PASSO 3: Atualizar source
          selectedImg.src = imageUrl;
          selectedImg.setAttribute('data-bg-image-url', imageUrl);

          wrapper.setAttribute('data-cv-selected', '1');
          
          // PASSO 4: Manter tamanho original (não ajustar automaticamente)
          wrapper.style.width = `${originalWidth}px`;
          wrapper.style.height = `${originalHeight}px`;
          
          // PASSO 5: Sincronizar sem alterar tamanho
          const syncNewImage = () => {
            // Não chama syncContainerWithContent para não alterar altura
            ensureHostResizeObserver(wrapper);
            normFill(wrapper);
            wrapper.offsetHeight; // Força reflow
          };
          
          if (selectedImg.complete && selectedImg.naturalHeight > 0) {
            syncNewImage();
          } else {
            selectedImg.onload = syncNewImage;
          }
          
          // Recálculo adicional
          setTimeout(syncNewImage, 100);
          
          killPlayOverlays(wrapper);
          removeAllPlayOverlays(d);
          cleanupAltArtifacts(wrapper);
          queueMicrotask(() => { try { cleanupAltArtifacts(wrapper); } catch {} });
        }
      } catch (error) {
        console.error('Erro ao trocar mídia:', error);
      }
    } else {
      // Caso não haja selectedImg: primeira aplicação ou elemento não selecionado
      const updatedEl = applyBackgroundImageImmediate(slideIndex, imageUrl, iframeRefs.current);
      clearAllSelections();
      
      if (updatedEl) {
        const tagName = (updatedEl as HTMLElement).tagName;
        
      if (tagName === 'IMG') {
        // Nova IMAGEM aplicada
        const img = updatedEl as HTMLImageElement;
        const { wrapper } = ensureImgCropWrapper(d!, img);
        
        // Verificar se wrapper já tem dimensões (troca de mídia) ou é primeira aplicação
        const hasExistingSize = wrapper.offsetHeight > 0;
        const originalWidth = hasExistingSize ? wrapper.offsetWidth : 0;
        const originalHeight = hasExistingSize ? wrapper.offsetHeight : 0;
        
        // Limpa estado anterior do wrapper
        wrapper.removeAttribute('data-cv-height');
        wrapper.style.cssText = '';
        wrapper.className = 'img-crop-wrapper';
        wrapper.style.position = 'relative';
        wrapper.style.overflow = 'hidden';
        
        wrapper.setAttribute('data-cv-selected', '1');
        selectedImageRefs.current[slideIndex] = img;
        
        // Remove overlays de vídeo se houver
        killPlayOverlays(wrapper);
        removeAllPlayOverlays(d!);
        
        // Sincroniza container com imagem
        const syncImageWrapper = () => {
          if (hasExistingSize) {
            // PRESERVAR tamanho original (troca de imagem)
            wrapper.style.width = `${originalWidth}px`;
            wrapper.style.height = `${originalHeight}px`;
            ensureHostResizeObserver(wrapper);
            normFill(wrapper);
          } else {
            // Primeira aplicação: ajusta ao tamanho da imagem
            syncContainerWithContent(wrapper, img);
            ensureHostResizeObserver(wrapper);
            normFill(wrapper);
          }
          wrapper.offsetHeight; // Força reflow
        };          if (img.complete && img.naturalHeight > 0) {
            syncImageWrapper();
          } else {
            img.onload = syncImageWrapper;
          }
          
          // Recálculo adicional após delay
          setTimeout(syncImageWrapper, 100);
          
          cleanupAltArtifacts(wrapper);
          queueMicrotask(() => { try { cleanupAltArtifacts(wrapper); } catch {} });
          
      } else if (tagName === 'VIDEO') {
        // Novo VÍDEO aplicado
        selectedImageRefs.current[slideIndex] = null;
        const video = updatedEl as HTMLVideoElement;
        const wrapper = video.parentElement;
        
        if (wrapper) {
          // Verificar se wrapper já tem dimensões (troca de mídia) ou é primeira aplicação
          const hasExistingSize = wrapper.offsetHeight > 0;
          const originalWidth = hasExistingSize ? wrapper.offsetWidth : 0;
          const originalHeight = hasExistingSize ? wrapper.offsetHeight : 0;
          
          // Limpa estado anterior e reconfigura como container de vídeo
          wrapper.removeAttribute('data-cv-height');
          wrapper.style.cssText = '';
          wrapper.className = 'video-container img-crop-wrapper';
          wrapper.style.position = 'relative';
          wrapper.style.overflow = 'hidden';
          
          // Sincroniza container com vídeo
          const syncVideoWrapper = () => {
            if (hasExistingSize) {
              // PRESERVAR tamanho original (troca para vídeo)
              wrapper.style.width = `${originalWidth}px`;
              wrapper.style.height = `${originalHeight}px`;
              ensureHostResizeObserver(wrapper);
              normFill(wrapper);
            } else {
              // Primeira aplicação: ajusta ao tamanho padrão de vídeo
              syncContainerWithContent(wrapper, video);
              ensureHostResizeObserver(wrapper);
              normFill(wrapper);
            }
            wrapper.offsetHeight; // Força reflow
          };            // Sincronização imediata
            syncVideoWrapper();
            
            // Sincronização após metadados carregarem
            video.addEventListener('loadedmetadata', syncVideoWrapper, { once: true });
            
            // Sincronização adicional após delay
            setTimeout(syncVideoWrapper, 150);
          }
        } else {
          // Outro tipo de elemento (raro, mas tratado)
          selectedImageRefs.current[slideIndex] = null;
          const isVideoNow = isVideoUrl(imageUrl);
          if (!isVideoNow) removeAllPlayOverlays(d!);
          
          if ((updatedEl as HTMLElement)) { 
            ensureHostResizeObserver(updatedEl as HTMLElement); 
            normFill(updatedEl as HTMLElement); 
          }
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

  /** ===== Detectar mudanças ===== */
  useEffect(() => {
    const hasContentChanges = Object.keys(editedContent).length > 0;
    const hasStyleChanges = Object.keys(elementStyles).length > 0;
    const hasImageChanges = Object.keys(uploadedImages).length > 0;
    
    const hasChanges = hasContentChanges || hasStyleChanges || hasImageChanges;
    
    console.log('🔍 Detectando mudanças:', {
      hasContentChanges,
      hasStyleChanges,
      hasImageChanges,
      totalChanges: hasChanges,
      editedContent,
      elementStyles,
      uploadedImages,
      contentId
    });
    
    setHasUnsavedChanges(hasChanges);
  }, [editedContent, elementStyles, uploadedImages, contentId]);

  /** ===== Salvar alterações na API ===== */
  const handleSave = async () => {
    console.log('💾 Iniciando salvamento...', { contentId });
    
    if (!contentId) {
      addToast('Não é possível salvar: ID do conteúdo não encontrado.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // Construir o objeto result com os dados atualizados
      const updatedConteudos = data.conteudos.map((conteudo: any, index: number) => {
        const titleKey = `${index}-title`;
        const subtitleKey = `${index}-subtitle`;
        const backgroundKey = `${index}-background`;
        
        // Criar cópia do conteúdo original
        const updatedConteudo = { ...conteudo };
        
        // Atualizar título e subtítulo
        updatedConteudo.title = editedContent[titleKey] ?? conteudo.title;
        updatedConteudo.subtitle = editedContent[subtitleKey] ?? conteudo.subtitle;
        
        // Determinar qual imagem de fundo usar e reorganizar as imagens
        const selectedBackground = editedContent[backgroundKey] || uploadedImages[index];
        
        if (selectedBackground) {
          // Coletar todas as imagens disponíveis
          const allImages = [
            conteudo.imagem_fundo,
            conteudo.imagem_fundo2,
            conteudo.imagem_fundo3,
            conteudo.imagem_fundo4,
            conteudo.imagem_fundo5,
            conteudo.imagem_fundo6,
          ].filter(Boolean); // Remove undefined/null
          
          // Se a imagem selecionada está na lista, reorganizar
          if (allImages.includes(selectedBackground)) {
            // Remove a imagem selecionada da lista
            const otherImages = allImages.filter(img => img !== selectedBackground);
            
            // Coloca a selecionada em primeiro e as outras na sequência
            updatedConteudo.imagem_fundo = selectedBackground;
            updatedConteudo.imagem_fundo2 = otherImages[0] || undefined;
            updatedConteudo.imagem_fundo3 = otherImages[1] || undefined;
            updatedConteudo.imagem_fundo4 = otherImages[2] || undefined;
            updatedConteudo.imagem_fundo5 = otherImages[3] || undefined;
            updatedConteudo.imagem_fundo6 = otherImages[4] || undefined;
          } else {
            // É uma imagem nova (uploaded), apenas atualiza imagem_fundo
            updatedConteudo.imagem_fundo = selectedBackground;
          }
        }
        
        // Remove campos undefined para não poluir o JSON
        Object.keys(updatedConteudo).forEach(key => {
          if (updatedConteudo[key] === undefined) {
            delete updatedConteudo[key];
          }
        });
        
        return updatedConteudo;
      });

      // Organizar os estilos por slide
      // elementStyles é um objeto com chaves no formato "slideIndex-elementType"
      // Exemplo: { "0-title": { fontSize: "24px", color: "#fff", ... }, "0-subtitle": {...}, "1-title": {...} }
      const styles: Record<string, any> = {};
      
      Object.entries(elementStyles).forEach(([key, styleObj]) => {
        // key é do tipo "0-title", "1-subtitle", etc
        const [slideIndexStr, elementType] = key.split('-');
        const slideIndex = parseInt(slideIndexStr, 10);
        
        if (!styles[slideIndex]) {
          styles[slideIndex] = {};
        }
        
        styles[slideIndex][elementType] = styleObj;
      });

      const result = {
        dados_gerais: data.dados_gerais,
        conteudos: updatedConteudos,
        styles: styles, // Adiciona o objeto styles
      };

      // Log específico para posições de imagens salvas
      const positionStyles = Object.entries(elementStyles)
        .filter(([key]) => key.includes('-background'))
        .map(([key, style]) => ({
          key,
          objectPosition: style.objectPosition,
          backgroundPositionX: style.backgroundPositionX,
          backgroundPositionY: style.backgroundPositionY
        }));
      
      if (positionStyles.length > 0) {
        console.log('📐 Posições de imagens/vídeos sendo salvas:', positionStyles);
      }

      console.log('💾 Dados antes de salvar:', {
        editedContent,
        uploadedImages,
        elementStyles,
        stylesOrganizados: styles,
        originalConteudos: data.conteudos.map((c: any, i: number) => ({
          slide: i,
          imagem_fundo: c.imagem_fundo,
          imagem_fundo2: c.imagem_fundo2,
          imagem_fundo3: c.imagem_fundo3,
        })),
        updatedConteudos: updatedConteudos.map((c: any, i: number) => ({
          slide: i,
          imagem_fundo: c.imagem_fundo,
          imagem_fundo2: c.imagem_fundo2,
          imagem_fundo3: c.imagem_fundo3,
        })),
        backgroundChanges: Object.keys(editedContent).filter(k => k.includes('-background'))
      });

      console.log('💾 Enviando para API:', { contentId, result });
      
      const response = await updateGeneratedContent(contentId, { result });
      
      console.log('✅ Resposta da API:', response);
      
      // NÃO limpar os estados - as mudanças devem persistir visualmente
      // até o usuário recarregar ou fechar o editor
      // setEditedContent({});
      // setElementStyles({);
      // setUploadedImages({});
      setHasUnsavedChanges(false);
      
      addToast('Alterações salvas com sucesso!', 'success');
      
      // Notificar o componente pai para recarregar a galeria
      if (onSaveSuccess) {
        onSaveSuccess();
      }
    } catch (error) {
      console.error('❌ Erro ao salvar alterações:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      addToast(`Erro ao salvar: ${errorMessage}`, 'error');
    } finally {
      setIsSaving(false);
    }
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
        isMinimized={isLayersMinimized}
        onToggleMinimize={() => setIsLayersMinimized(!isLayersMinimized)}
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
          onSave={handleSave}
          hasUnsavedChanges={hasUnsavedChanges}
          isSaving={isSaving}
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
          onBackgroundClick={handleCanvasBackgroundClick}
          onWheel={(e) => {
            const container = containerRef.current;
            if (!container) return; // Proteção contra null
            
            const rect = container.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left - pan.x) / zoom;
            const mouseY = (e.clientY - rect.top  - pan.y) / zoom;

            if (e.ctrlKey || e.metaKey) {
              // Zoom com Ctrl/Cmd + Scroll
              e.preventDefault();
              const delta = e.deltaY > 0 ? -0.05 : 0.05;
              const newZoom = Math.min(Math.max(0.1, zoom + delta), 2);
              setZoom(newZoom);
              setPan({
                x: e.clientX - rect.left - mouseX * newZoom,
                y: e.clientY - rect.top  - mouseY * newZoom,
              });
            } else if (e.shiftKey) {
              // Pan horizontal com Shift + Scroll (converte movimento vertical em horizontal)
              e.preventDefault();
              setPan(prev => ({
                x: prev.x - e.deltaY,  // Movimenta horizontalmente no eixo X
                y: prev.y,
              }));
            } else {
              // Pan com dois dedos no trackpad ou scroll do mouse
              e.preventDefault();
              setPan(prev => ({
                x: prev.x - e.deltaX,  // Movimento horizontal (trackpad)
                y: prev.y - e.deltaY,  // Movimento vertical (trackpad)
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
        isMinimized={isPropertiesMinimized}
        templateCompatibility={templateCompatibility}
        onToggleMinimize={() => {
          setIsPropertiesMinimized(!isPropertiesMinimized);
          // Se minimizar, desseleciona o elemento
          if (!isPropertiesMinimized) {
            setSelectedElement({ slideIndex: 0, element: null });
          }
        }}
        onUpdateEditedValue={updateEditedValue}
        onUpdateElementStyle={updateElementStyle}
        onBackgroundImageChange={handleBackgroundImageChange}
        onSearchKeywordChange={setSearchKeyword}
        onSearchImages={handleSearchImages}
        onImageUpload={handleImageUpload}
        getElementStyle={getElementStyle}
        getEditedValue={getEditedValue}
      />
      
      {/* Toast notifications */}
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default CarouselViewer;