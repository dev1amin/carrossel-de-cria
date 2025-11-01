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
  CarouselViewer, 
  GenerationQueue,
  templateService,
  templateRenderer,
  generateCarousel,
  AVAILABLE_TEMPLATES,
  type GenerationQueueItem,
  type CarouselData as CarouselDataType
} from '../../Carousel-Template';
import { getFeed } from '../services/feed';
import { testCarouselData } from '../data/testCarouselData';

interface MainContentProps {
  searchTerm: string;
  activeSort: SortOption;
  currentPage: 'feed' | 'settings' | 'gallery';
  isLoading: boolean;
  onSearch: (term: string) => void;
  onSortChange: (sort: SortOption) => void;
  onPageChange: (page: 'feed' | 'settings' | 'gallery') => void;
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

type CarouselData = CarouselDataType;

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
  const [testSlides, setTestSlides] = useState<string[] | null>(null);
  const [currentCarouselData, setCurrentCarouselData] = useState<CarouselData | null>(null);
  const [generationQueue, setGenerationQueue] = useState<GenerationQueueItem[]>([]);
  const [isQueueExpanded, setIsQueueExpanded] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [galleryCarousels, setGalleryCarousels] = useState<GalleryCarousel[]>([]);
  const [unviewedCarousels, setUnviewedCarousels] = useState<Set<string>>(new Set());

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

const handleGenerateCarousel = async (code: string, templateId: string) => {
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

  try {
    console.log(`Generating carousel for post: ${code} with template: ${templateId}`);
    const result = await generateCarousel(code, templateId); // precisa retornar res.json()!
    console.log('Webhook result:', result);

    // 🔹 Corrige tipo de resposta (array com 1 objeto)
    const carouselData = Array.isArray(result) ? result[0] : result;

    if (!carouselData || !carouselData.dados_gerais) {
      console.warn('Resposta inesperada do webhook:', result);
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
    console.log(`Fetching template ${responseTemplateId}...`);

    const templateSlides = await templateService.fetchTemplate(responseTemplateId);
    const rendered = templateRenderer.renderAllSlides(templateSlides, carouselData);

    // Adiciona à galeria sem abrir o editor
    const galleryItem: GalleryCarousel = {
      id: queueItem.id,
      postCode: code,
      templateName: queueItem.templateName,
      createdAt: Date.now(),
      slides: rendered,
      carouselData,
      viewed: false,
    };

    setGalleryCarousels(prev => [galleryItem, ...prev]);
    
    // Marca o carrossel como não visualizado
    setUnviewedCarousels(prev => new Set([...prev, galleryItem.id]));

    // Mostra toast em preto e branco e remove da fila
    addToast('Carrossel criado e adicionado à galeria', 'success');
    setGenerationQueue(prev => prev.filter(item => item.id !== queueItem.id));
  } catch (error) {
    console.error('Failed to generate carousel:', error);
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

      setTestSlides(rendered);
      setCurrentCarouselData(carouselData);
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
      {testSlides && currentCarouselData && (
        <CarouselViewer
          slides={testSlides}
          carouselData={currentCarouselData}
          onClose={() => {
            setTestSlides(null);
            setCurrentCarouselData(null);
          }}
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
              isExpanded={isQueueExpanded}
              onToggleExpand={() => setIsQueueExpanded(!isQueueExpanded)}
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
            setTestSlides(carousel.slides);
            setCurrentCarouselData(carousel.carouselData);
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
        onPageChange={(page: 'feed' | 'settings' | 'gallery') => {
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