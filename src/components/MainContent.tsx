import React, { useState, useEffect } from 'react';
import { SortOption, Post } from '../types';
import Header from './Header';
import Feed from './Feed';
import Navigation from './Navigation';
import SettingsPage from './SettingsPage';
import LoadingBar from './LoadingBar';
import Gallery from './Gallery';
import Toast, { ToastMessage } from './Toast';
import { 
  CarouselEditorTabs,
  type CarouselTab,
  GenerationQueue,
  templateService,
  templateRenderer,
  generateCarousel,
  AVAILABLE_TEMPLATES,
  type GenerationQueueItem,
  type CarouselData as CarouselDataType
} from '../carousel';
import { useEditorTabs } from '../contexts/EditorTabsContext';
import { getFeed } from '../services/feed';
import { testCarouselData } from '../data/testCarouselData';
import { CacheService, CACHE_KEYS } from '../services/cache';

interface MainContentProps {
  searchTerm: string;
  activeSort: SortOption;
  currentPage: 'feed' | 'settings' | 'gallery' | 'news';
  isLoading: boolean;
  onSearch: (term: string) => void;
  onSortChange: (sort: SortOption) => void;
  onPageChange: (page: 'feed' | 'settings' | 'gallery' | 'news') => void;
  setIsLoading: (loading: boolean) => void;
}

interface GalleryCarousel {
  id: string;
  postCode: string;
  templateName: string;
  createdAt: number;
  slides: string[];
  carouselData: any;
  viewed?: boolean;
}

const MainContent: React.FC<MainContentProps> = ({
  searchTerm,
  activeSort,
  currentPage,
  isLoading,
  onSearch,
  onSortChange,
  onPageChange,
  setIsLoading,
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generationQueue, setGenerationQueue] = useState<GenerationQueueItem[]>([]);
  const [isQueueExpanded, setIsQueueExpanded] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [galleryCarousels, setGalleryCarousels] = useState<GalleryCarousel[]>([]);
  const [unviewedCarousels, setUnviewedCarousels] = useState<Set<string>>(new Set());
  
  // Usa o contexto compartilhado de abas
  const { editorTabs, addEditorTab: addTab, closeEditorTab, closeAllEditorTabs, shouldShowEditor, setShouldShowEditor } = useEditorTabs();

  const addToast = (message: string, type: 'success' | 'error') => {
    const toast: ToastMessage = {
      id: `toast-${Date.now()}`,
      message,
      type,
    };
    setToasts(prev => [...prev, toast]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const addEditorTab = (carousel: { slides: string[]; carouselData: CarouselDataType; title: string; id?: string }) => {
    const tabId = carousel.id || `tab-${Date.now()}`;
    
    const newTab: CarouselTab = {
      id: tabId,
      slides: carousel.slides,
      carouselData: carousel.carouselData,
      title: carousel.title,
    };
    
    addTab(newTab);
  };

  // Carrega galeria do cache ao montar o componente
  useEffect(() => {
    try {
      const cachedGallery = CacheService.getItem<GalleryCarousel[]>(CACHE_KEYS.GALLERY);
      if (cachedGallery && Array.isArray(cachedGallery)) {
        setGalleryCarousels(cachedGallery);
        // Marca todos como não visualizados inicialmente
        const unviewedIds = cachedGallery.filter(c => !c.viewed).map(c => c.id);
        setUnviewedCarousels(new Set(unviewedIds));
      }
    } catch (err) {
      console.warn('Falha ao carregar galeria do cache:', err);
    }
  }, []);

const handleGenerateCarousel = async (code: string, templateId: string, postId?: number) => {
  console.log('🚀 handleGenerateCarousel chamado:', { code, templateId, postId });
  console.log('🚀 Estado atual da galeria:', galleryCarousels.length, 'itens');
  
  const template = AVAILABLE_TEMPLATES.find(t => t.id === templateId);
  const queueItem: GenerationQueueItem = {
    id: `${code}-${templateId}-${Date.now()}`,
    postCode: code,
    templateId,
    templateName: template?.name || `Template ${templateId}`,
    status: 'generating',
    createdAt: Date.now(),
  };

  setGenerationQueue(prev => [...prev, queueItem]);
  console.log('✅ Item adicionado à fila:', queueItem);

  try {
    // Obter JWT token do localStorage
    const jwtToken = localStorage.getItem('access_token');
    
    console.log(`⏳ Chamando generateCarousel para post: ${code} com template: ${templateId}, postId: ${postId}, jwt: ${jwtToken ? 'presente' : 'ausente'}`);
    const result = await generateCarousel(code, templateId, jwtToken || undefined, postId);
    console.log('✅ Webhook retornou:', result);
    console.log('✅ Tipo do resultado:', typeof result, Array.isArray(result) ? 'é array' : 'não é array');

    // 🔹 Corrige tipo de resposta (array com 1 objeto)
    const carouselData = Array.isArray(result) ? result[0] : result;
    console.log('✅ carouselData extraído:', carouselData);

    if (!carouselData || !carouselData.dados_gerais) {
      console.error('⚠️ Resposta inesperada do webhook:', result);
      console.error('⚠️ carouselData:', carouselData);
      console.error('⚠️ dados_gerais:', carouselData?.dados_gerais);
      addToast('Erro: formato inesperado do retorno do webhook.', 'error');
      setGenerationQueue(prev =>
        prev.map(item =>
          item.id === queueItem.id
            ? { ...item, status: 'error', errorMessage: 'Formato inesperado.', completedAt: Date.now() }
            : item
        )
      );
      return;
    }

    const responseTemplateId = carouselData.dados_gerais.template;
    console.log(`✅ Template ID da resposta: ${responseTemplateId}`);
    console.log(`⏳ Buscando template ${responseTemplateId}...`);

    const templateSlides = await templateService.fetchTemplate(responseTemplateId);
    console.log('✅ Template obtido, renderizando slides...');
    
    const rendered = templateRenderer.renderAllSlides(templateSlides, carouselData);
    console.log('✅ Slides renderizados:', rendered.length, 'slides');

    // Adiciona à galeria
    const galleryItem: GalleryCarousel = {
      id: queueItem.id,
      postCode: code,
      templateName: queueItem.templateName,
      createdAt: Date.now(),
      slides: rendered,
      carouselData,
      viewed: false,
    };
    console.log('✅ Item da galeria criado:', galleryItem.id);

    // Atualiza a galeria local
    const updatedGallery = [galleryItem, ...galleryCarousels];
    console.log('✅ Atualizando galeria local. Novos itens:', updatedGallery.length);
    setGalleryCarousels(updatedGallery);
    
    // Salva no cache
    console.log('⏳ Salvando no cache...');
    CacheService.setItem(CACHE_KEYS.GALLERY, updatedGallery);
    console.log('✅ Galeria salva no cache');
    
    // Dispara evento para outras partes do app
    console.log('⏳ Disparando evento gallery:updated...');
    window.dispatchEvent(new CustomEvent('gallery:updated', { detail: updatedGallery }));
    console.log('✅ Evento gallery:updated disparado');
    
    // Marca o carrossel como não visualizado
    setUnviewedCarousels(prev => new Set([...prev, galleryItem.id]));
    console.log('✅ Carrossel marcado como não visualizado');

    // Mostra toast e remove da fila
    console.log('⏳ Adicionando toast de sucesso...');
    addToast('Carrossel criado e adicionado à galeria', 'success');
    console.log('✅ Toast adicionado');
    
    setGenerationQueue(prev => prev.filter(item => item.id !== queueItem.id));
    console.log('✅ Item removido da fila');
    console.log('🎉 Processo completo!');
  } catch (error) {
    console.error('❌ ERRO CAPTURADO em handleGenerateCarousel:', error);
    console.error('❌ Stack trace:', error instanceof Error ? error.stack : 'N/A');
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

    setGenerationQueue(prev =>
      prev.map(item =>
        item.id === queueItem.id
          ? { ...item, status: 'error', errorMessage, completedAt: Date.now() }
          : item
      )
    );

    addToast('Erro ao gerar carrossel. Tente novamente.', 'error');
  }
};

  const handleTestEditor = async () => {
    try {
      setIsLoading(true);
      const carouselData = testCarouselData[0];
      const templateId = carouselData.dados_gerais.template;

      console.log(`Fetching template ${templateId}...`);
      const templateSlides = await templateService.fetchTemplate(templateId);

      console.log('Rendering slides with test data...');
      const rendered = templateRenderer.renderAllSlides(templateSlides, carouselData);

      const template = AVAILABLE_TEMPLATES.find(t => t.id === templateId);
      addEditorTab({
        id: `test-${templateId}`,
        slides: rendered,
        carouselData,
        title: template?.name || 'Teste',
      });
    } catch (error) {
      console.error('Failed to load test editor:', error);
      alert('Erro ao carregar editor de teste. Verifique o console.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadFeed = async () => {
      if (currentPage !== 'feed') return;
      
      setIsLoading(true);
      try {
        // Tentar carregar do cache primeiro
        const feedData = await getFeed();
        setPosts(feedData);

        // Atualizar em background após carregar do cache
        getFeed(true).then(latestData => {
          setPosts(latestData);
        }).catch(console.error); // Erros silenciosos na atualização em background
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load feed');
      } finally {
        setIsLoading(false);
      }
    };

    loadFeed();
  }, [currentPage, setIsLoading]);

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 max-w-md">
          <p className="text-red-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-white bg-red-500 px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {shouldShowEditor && (
        <CarouselEditorTabs
          tabs={editorTabs}
          onCloseTab={closeEditorTab}
          onCloseAll={closeAllEditorTabs}
          onEditorsClosed={() => setShouldShowEditor(false)}
        />
      )}
      <Toast toasts={toasts} onRemove={removeToast} />
      <div className="min-h-screen bg-black pb-20 md:pb-0 md:pl-16">
        <LoadingBar isLoading={isLoading} />
        {currentPage === 'feed' && (
          <>
            <Header
              onSearch={onSearch}
              activeSort={activeSort}
              onSortChange={onSortChange}
              onTestEditor={handleTestEditor}
            />
            <GenerationQueue
              items={generationQueue}
            />
            <main className={`pt-14 ${generationQueue.length > 0 ? 'mt-16' : ''}`}>
              <Feed
                posts={posts}
                searchTerm={searchTerm}
                activeSort={activeSort}
                onGenerateCarousel={handleGenerateCarousel}
              />
            </main>
          </>
        )}

        {currentPage === 'gallery' && (
          <Gallery
            carousels={galleryCarousels}
            onViewCarousel={(carousel) => {
              addEditorTab({
                id: `gallery-${carousel.id}`,
                slides: carousel.slides,
                carouselData: carousel.carouselData,
                title: carousel.templateName,
              });
            }}
          />
        )}

        {currentPage === 'settings' && (
          <SettingsPage
            onPageChange={onPageChange}
            setIsLoading={setIsLoading}
          />
        )}

        <Navigation
          currentPage={currentPage}
          onPageChange={(page: 'feed' | 'settings' | 'gallery' | 'news') => {
            if (page === 'gallery') {
              setUnviewedCarousels(new Set());
            }
            onPageChange(page);
          }}
          unviewedCount={unviewedCarousels.size}
        />
      </div>
    </>
  );
};

export default MainContent;