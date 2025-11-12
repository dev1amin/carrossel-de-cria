import { useState, useEffect } from 'react';
import Gallery from '../components/Gallery';
import Navigation from '../components/Navigation';
import Header from '../components/Header';
import LoadingBar from '../components/LoadingBar';
import PageTitle from '../components/PageTitle';
import { CarouselEditorTabs, type CarouselTab } from '../carousel';
import type { CarouselData } from '../carousel';
import { CacheService, CACHE_KEYS } from '../services/cache';
import { SortOption } from '../types';
import { useEditorTabs } from '../contexts/EditorTabsContext';
import { useGenerationQueue } from '../contexts/GenerationQueueContext';
import { getGeneratedContent, getGeneratedContentById } from '../services/generatedContent';
import type { GeneratedContent } from '../types/generatedContent';
import { templateService } from '../services/carousel/template.service';
import { templateRenderer } from '../services/carousel/templateRenderer.service';

interface GalleryCarousel {
  id: string;
  postCode: string;
  templateName: string;
  createdAt: number;
  slides: string[];
  carouselData: CarouselData;
  viewed?: boolean;
  generatedContentId?: number; // ID do GeneratedContent na API
}

const GalleryPage = () => {
  const [galleryCarousels, setGalleryCarousels] = useState<GalleryCarousel[]>([]);
  const [activeSort, setActiveSort] = useState<SortOption>('latest');
  const [isLoadingFromAPI, setIsLoadingFromAPI] = useState(false);
  
  // Usa o contexto compartilhado de abas
  const { editorTabs, addEditorTab: addTab, closeEditorTab, closeAllEditorTabs, shouldShowEditor, setShouldShowEditor } = useEditorTabs();
  
  // Usa o contexto global da fila
  const { generationQueue } = useGenerationQueue();

  // Esconde o editor ao entrar na página
  useEffect(() => {
    setShouldShowEditor(false);
  }, [setShouldShowEditor]);

  // Função para renderizar slides usando o template correto do MinIO
  const renderSlidesWithTemplate = async (
    conteudos: any[],
    dados_gerais: any,
    templateId: string
  ): Promise<string[]> => {
    try {
      console.log(`🎨 Renderizando com template "${templateId}" para preview na galeria`);
      
      // Busca o template do MinIO
      const templateSlides = await templateService.fetchTemplate(templateId);
      
      console.log(`✅ Template "${templateId}" carregado: ${templateSlides.length} slides`);
      
      // Monta os dados no formato CarouselData
      const carouselData: CarouselData = {
        conteudos: conteudos,
        dados_gerais: dados_gerais,
      };
      
      // Renderiza cada slide com os dados
      const renderedSlides = templateRenderer.renderAllSlides(templateSlides, carouselData);
      
      console.log(`✅ ${renderedSlides.length} slides renderizados para preview`);
      
      return renderedSlides;
    } catch (error) {
      console.error(`❌ Erro ao renderizar template "${templateId}":`, error);
      
      // Fallback: usa renderização simples
      console.log('⚠️ Usando fallback: renderização simples HTML');
      return conteudos.map((slideData: any, index: number) => 
        convertSlideToHTML(slideData, index)
      );
    }
  };

  // Função para converter um slide JSON em HTML (para preview na galeria)
  const convertSlideToHTML = (slideData: any, index: number): string => {
    const { title = '', subtitle = '', imagem_fundo = '', thumbnail_url = '' } = slideData;
    
    // Template 2 (usado pela API)
    const isVideo = imagem_fundo?.includes('.mp4');
    const backgroundTag = isVideo 
      ? `<video autoplay loop muted playsinline class="slide-background" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;"><source src="${imagem_fundo}" type="video/mp4"></video>`
      : `<img src="${imagem_fundo}" alt="Background" class="slide-background" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;" />`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      width: 1080px; 
      height: 1350px; 
      overflow: hidden; 
      position: relative;
      background: #000;
    }
    .slide-background { z-index: 0; }
    .overlay { 
      position: absolute; 
      top: 0; 
      left: 0; 
      width: 100%; 
      height: 100%; 
      background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 50%, transparent 100%);
      z-index: 1;
    }
    .content { 
      position: absolute; 
      bottom: 80px; 
      left: 60px; 
      right: 60px; 
      z-index: 2;
      color: white;
    }
    .title { 
      font-size: 48px; 
      font-weight: bold; 
      line-height: 1.2; 
      margin-bottom: 20px;
      text-shadow: 2px 2px 8px rgba(0,0,0,0.8);
    }
    .subtitle { 
      font-size: 28px; 
      line-height: 1.4; 
      opacity: 0.9;
      text-shadow: 1px 1px 4px rgba(0,0,0,0.8);
    }
    .thumbnail {
      position: absolute;
      top: 40px;
      right: 40px;
      width: 120px;
      height: 120px;
      border-radius: 12px;
      overflow: hidden;
      border: 3px solid rgba(255,255,255,0.2);
      z-index: 2;
    }
    .thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    [data-editable] {
      cursor: text;
      transition: outline 0.2s;
    }
    [data-editable]:hover {
      outline: 2px solid rgba(59, 130, 246, 0.5);
    }
    [data-editable].selected {
      outline: 2px solid rgb(59, 130, 246) !important;
    }
  </style>
</head>
<body>
  ${backgroundTag}
  <div class="overlay"></div>
  ${thumbnail_url ? `<div class="thumbnail"><img src="${thumbnail_url}" alt="Thumbnail" /></div>` : ''}
  <div class="content">
    ${title ? `<div id="slide-${index}-title" class="title" data-editable="true" data-element="title">${title}</div>` : ''}
    ${subtitle ? `<div id="slide-${index}-subtitle" class="subtitle" data-editable="true" data-element="subtitle">${subtitle}</div>` : ''}
  </div>
</body>
</html>
    `.trim();
  };

  // Função para converter GeneratedContent da API para GalleryCarousel
  const convertAPIToGalleryCarousel = async (apiContent: GeneratedContent): Promise<GalleryCarousel | null> => {
    try {
      const result = apiContent.result;
      
      console.log('📦 Convertendo conteúdo da API:', {
        id: apiContent.id,
        media_type: apiContent.media_type,
        provider_type: apiContent.provider_type,
        result_keys: result ? Object.keys(result) : []
      });

      // A API retorna diferentes estruturas dependendo do tipo
      // Exemplo: { conteudos: [...], dados_gerais: {...} }
      if (!result) {
        console.warn('⚠️ API content missing result:', apiContent);
        return null;
      }

      // Extrair slides do formato da API
      let slides: string[] = [];
      let carouselData: any = {};

      // Se tem 'conteudos', é o novo formato
      if (result.conteudos && Array.isArray(result.conteudos)) {
        console.log(`✅ Encontrados ${result.conteudos.length} slides no formato 'conteudos'`);
        console.log(`🎨 [API] Estilos vindos da API:`, result.styles);
        
        // Extrai o template ID dos dados gerais
        const templateId = result.dados_gerais?.template || '2';
        console.log(`🎨 Template detectado: "${templateId}"`);
        
        // Renderiza os slides usando o template correto do MinIO
        slides = await renderSlidesWithTemplate(
          result.conteudos,
          result.dados_gerais || {},
          templateId
        );

        carouselData = {
          conteudos: result.conteudos, // Mantém 'conteudos' para o CarouselViewer
          dados_gerais: result.dados_gerais || {}, // dados_gerais já contém template
          styles: result.styles || {}, // IMPORTANTE: Inclui os estilos salvos
        };
        
        console.log(`🎨 [API] carouselData criado:`, carouselData);
        console.log(`🎨 [API] carouselData.styles:`, carouselData.styles);
      } 
      // Formato antigo com 'slides' direto
      else if (result.slides && Array.isArray(result.slides)) {
        console.log(`✅ Encontrados ${result.slides.length} slides no formato antigo`);
        slides = result.slides;
        carouselData = result.metadata || result;
      }
      else {
        console.warn('⚠️ Formato desconhecido de resultado:', result);
        return null;
      }

      if (slides.length === 0) {
        console.warn('⚠️ Nenhum slide encontrado');
        return null;
      }

      const carousel: GalleryCarousel = {
        id: `api-${apiContent.id}`,
        postCode: apiContent.content_id?.toString() || String(apiContent.id),
        templateName: `${apiContent.media_type} - ${apiContent.provider_type}`,
        createdAt: new Date(apiContent.created_at).getTime(),
        slides: slides,
        carouselData: carouselData as CarouselData,
        viewed: false,
        generatedContentId: apiContent.id, // Adiciona o ID da API
      };

      console.log('✅ Carrossel convertido:', {
        id: carousel.id,
        slides_count: carousel.slides.length,
        templateName: carousel.templateName,
        carouselData_styles: carousel.carouselData?.styles
      });

      return carousel;
    } catch (err) {
      console.error('❌ Erro ao converter conteúdo da API:', err, apiContent);
      return null;
    }
  };

  // Carrega carrosséis da API e mescla com cache local
  const loadGalleryFromAPI = async () => {
    setIsLoadingFromAPI(true);
    try {
      console.log('🔄 Carregando galeria da API...');
      
      // TEMPORÁRIO: Limpa cache local para forçar uso da API
      console.log('🗑️ Limpando cache local antigo...');
      CacheService.clearItem(CACHE_KEYS.GALLERY);
      
      const response = await getGeneratedContent({ page: 1, limit: 100 });
      
      console.log('✅ Resposta da API:', response);
      
      // Converte conteúdos da API para formato da galeria (com templates do MinIO)
      const apiCarouselsPromises = response.data.map(content => 
        convertAPIToGalleryCarousel(content)
      );
      const apiCarouselsResults = await Promise.all(apiCarouselsPromises);
      const apiCarousels = apiCarouselsResults.filter((c): c is GalleryCarousel => c !== null);

      console.log(`✅ ${apiCarousels.length} carrosséis convertidos da API`);

      // Carrega cache local
      const cachedLocal = CacheService.getItem<GalleryCarousel[]>(CACHE_KEYS.GALLERY) || [];
      
      // Migra carrosséis do cache local para o novo formato (se necessário)
      const migratedCache = cachedLocal.map((carousel) => {
        // Se o carouselData tem 'slides' mas não tem 'conteudos', precisa migrar
        const data = carousel.carouselData as any;
        if (data?.slides && !data?.conteudos) {
          console.log(`🔄 Migrando carrossel do cache: ${carousel.id}`);
          
          // Regenera os slides HTML a partir dos dados JSON
          const newSlides = data.slides.map((slideData: any, index: number) => {
            // Se o slide for uma string JSON, faz o parse primeiro
            let parsedSlideData = slideData;
            if (typeof slideData === 'string') {
              try {
                parsedSlideData = JSON.parse(slideData);
              } catch {
                // Se não for JSON, retorna o HTML como está
                return slideData;
              }
            }
            
            // Converte para HTML usando a função convertSlideToHTML
            return convertSlideToHTML(parsedSlideData, index);
          });
          
          return {
            ...carousel,
            slides: newSlides, // Atualiza os slides com HTML
            carouselData: {
              ...carousel.carouselData,
              conteudos: data.slides.map((s: any) => {
                // Garante que conteudos tem os objetos puros
                if (typeof s === 'string') {
                  try {
                    return JSON.parse(s);
                  } catch {
                    return s;
                  }
                }
                return s;
              }),
            }
          };
        }
        return carousel;
      });
      
      // Mescla API + cache local migrado (remove duplicatas por ID)
      const allCarousels = [...apiCarousels, ...migratedCache];
      const uniqueCarousels = Array.from(
        new Map(allCarousels.map(c => [c.id, c])).values()
      );

      console.log(`✅ Total de carrosséis únicos: ${uniqueCarousels.length}`);
      
      setGalleryCarousels(uniqueCarousels);
      
      // Atualiza o cache com a lista mesclada e migrada
      CacheService.setItem(CACHE_KEYS.GALLERY, uniqueCarousels);
    } catch (err) {
      console.error('❌ Erro ao carregar galeria da API:', err);
      
      // Em caso de erro, carrega apenas do cache local
      const cached = CacheService.getItem<GalleryCarousel[]>(CACHE_KEYS.GALLERY);
      if (cached && Array.isArray(cached)) {
        setGalleryCarousels(cached);
      }
    } finally {
      setIsLoadingFromAPI(false);
    }
  };

  // Carrega galeria ao montar o componente
  useEffect(() => {
    loadGalleryFromAPI();
  }, []);

  // Escuta atualizações em tempo real da galeria
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as GalleryCarousel[] | undefined;
        if (detail && Array.isArray(detail)) {
          setGalleryCarousels(detail);
        } else {
          const cached = CacheService.getItem<GalleryCarousel[]>(CACHE_KEYS.GALLERY);
          if (cached) setGalleryCarousels(cached);
        }
      } catch (err) {
        console.warn('Erro no manipulador gallery:updated:', err);
      }
    };
    window.addEventListener('gallery:updated', handler as EventListener);
    return () => window.removeEventListener('gallery:updated', handler as EventListener);
  }, []);

  const handleSearch = (term: string) => {
    // TODO: Implementar busca na galeria
    console.log('Search gallery:', term);
  };

  const addEditorTab = async (carousel: GalleryCarousel) => {
    const tabId = `gallery-${carousel.id}`;
    
    console.log('🎨 Abrindo carrossel no editor:', {
      id: carousel.id,
      generatedContentId: carousel.generatedContentId,
    });
    
    // Se tem generatedContentId, buscar dados frescos da API
    let carouselData = carousel.carouselData;
    let slides = carousel.slides;
    
    if (carousel.generatedContentId) {
      try {
        console.log('🔄 Buscando dados atualizados da API...');
        const freshData = await getGeneratedContentById(carousel.generatedContentId);
        
        if (freshData.success && freshData.data.result) {
          const apiData = freshData.data.result as any;
          
          // Atualizar carouselData com dados da API
          if (apiData.conteudos && apiData.dados_gerais) {
            carouselData = {
              conteudos: apiData.conteudos,
              dados_gerais: apiData.dados_gerais,
              styles: apiData.styles || {}, // IMPORTANTE: Inclui os estilos salvos
            } as CarouselData;
            
            // Renderizar slides atualizados
            const templateId = apiData.dados_gerais.template || '2';
            slides = await renderSlidesWithTemplate(
              apiData.conteudos,
              apiData.dados_gerais,
              templateId
            );
            
            console.log('✅ Dados atualizados carregados da API');
            console.log('📐 Estilos carregados:', apiData.styles);
          }
        }
      } catch (error) {
        console.error('❌ Erro ao buscar dados atualizados:', error);
        // Continua com os dados do cache se falhar
      }
    }
    
    const newTab: CarouselTab = {
      id: tabId,
      slides: slides,
      carouselData: carouselData,
      title: carousel.templateName,
      generatedContentId: carousel.generatedContentId,
    };
    
    addTab(newTab);
  };

  const handleDeleteCarousel = (carouselId: string) => {
    // Remove o carrossel da lista
    setGalleryCarousels(prev => prev.filter(c => c.id !== carouselId));
    
    // Atualiza o cache
    const updatedCarousels = galleryCarousels.filter(c => c.id !== carouselId);
    CacheService.setItem(CACHE_KEYS.GALLERY, updatedCarousels, 60 * 60 * 1000); // 1 hora
    
    // Fecha a aba do editor se estiver aberta
    closeEditorTab(`gallery-${carouselId}`);
  };

  const handleSaveSuccess = () => {
    console.log('🔄 Carrossel salvo, recarregando galeria...');
    
    // Limpar cache da galeria para forçar reload da API
    CacheService.clearItem(CACHE_KEYS.GALLERY);
    
    // Recarregar carrosséis da API
    loadGalleryFromAPI();
  };

  return (
    <div className="flex h-screen bg-black">
      <Navigation currentPage="gallery" />
      <div className="flex-1 ml-16">
        <LoadingBar isLoading={isLoadingFromAPI} />
        <Header
          onSearch={handleSearch}
          activeSort={activeSort}
          onSortChange={setActiveSort}
        />
        
        <main className={`pt-14 ${generationQueue.length > 0 ? 'mt-20' : ''}`}>
          <PageTitle title="Galeria" />
          {shouldShowEditor && (
            <CarouselEditorTabs
              tabs={editorTabs}
              onCloseTab={closeEditorTab}
              onCloseAll={closeAllEditorTabs}
              onEditorsClosed={() => setShouldShowEditor(false)}
              onSaveSuccess={handleSaveSuccess}
            />
          )}
          
          {isLoadingFromAPI && galleryCarousels.length === 0 ? (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="flex flex-col items-center gap-4">
                <p className="text-white/60"></p>
              </div>
            </div>
          ) : (
            <Gallery
              carousels={galleryCarousels}
              onViewCarousel={addEditorTab}
              onDeleteCarousel={handleDeleteCarousel}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default GalleryPage;