import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import Feed from '../components/Feed';
import Navigation from '../components/Navigation';
import LoadingBar from '../components/LoadingBar';
import { GenerationQueue } from '../../Carousel-Template';
import Toast, { ToastMessage } from '../components/Toast';
import { SortOption, Post } from '../types';
import type { GenerationQueueItem } from '../../Carousel-Template';
import { getFeed } from '../services/feed';
import { testCarouselData } from '../data/testCarouselData';
import { 
  templateService, 
  templateRenderer, 
  generateCarousel, 
  AVAILABLE_TEMPLATES, 
  CarouselViewer, 
  type CarouselData 
} from '../../Carousel-Template';

interface FeedPageProps {
  unviewedCount?: number;
}

const FeedPage: React.FC<FeedPageProps> = ({ unviewedCount = 0 }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSort, setActiveSort] = useState<SortOption>('popular');
  const [generationQueue, setGenerationQueue] = useState<GenerationQueueItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isQueueExpanded, setIsQueueExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [testSlides, setTestSlides] = useState<string[] | null>(null);
  const [currentCarouselData, setCurrentCarouselData] = useState<CarouselData | null>(null);

  useEffect(() => {
    const loadFeed = async () => {
      setIsLoading(true);
      try {
        const feedData = await getFeed();
        setPosts(feedData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load feed');
      } finally {
        setIsLoading(false);
      }
    };

    loadFeed();
  }, []);

  const handleSearch = (term: string) => {
    setSearchTerm(term);
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

  const addToast = (message: string, type: 'success' | 'error') => {
    const toast: ToastMessage = { id: `toast-${Date.now()}`, message, type };
    setToasts(prev => [...prev, toast]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleGenerateCarousel = async (code: string, templateId: string) => {
    console.log('🚀 FeedPage: handleGenerateCarousel iniciado', { code, templateId });
    
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
    console.log('✅ Item adicionado à fila:', queueItem.id);

    try {
      console.log(`⏳ Chamando generateCarousel para post: ${code} com template: ${templateId}`);
      const result = await generateCarousel(code, templateId);
      console.log('✅ Carousel generated successfully:', result);
      console.log('✅ Tipo do result:', typeof result, 'É array?', Array.isArray(result));
      console.log('✅ Length do result:', Array.isArray(result) ? result.length : 'N/A');

      // Verifica se result é um array
      if (!result) {
        console.error('❌ Result é null ou undefined');
        addToast('Erro: resposta vazia do servidor', 'error');
        setGenerationQueue(prev => prev.filter(i => i.id !== queueItem.id));
        return;
      }

      // Se result não for array, tenta tratá-lo como objeto único
      const resultArray = Array.isArray(result) ? result : [result];
      console.log('✅ resultArray:', resultArray);

      if (resultArray.length === 0) {
        console.error('❌ Array de resultado vazio');
        addToast('Erro: nenhum dado retornado', 'error');
        setGenerationQueue(prev => prev.filter(i => i.id !== queueItem.id));
        return;
      }

      const carouselData = resultArray[0];
      console.log('✅ carouselData extraído:', carouselData);
      console.log('✅ dados_gerais:', carouselData?.dados_gerais);

      if (!carouselData || !carouselData.dados_gerais) {
        console.error('❌ Dados inválidos:', { carouselData });
        addToast('Erro: formato de dados inválido', 'error');
        setGenerationQueue(prev => prev.filter(i => i.id !== queueItem.id));
        return;
      }

      // render slides
      const responseTemplateId = carouselData.dados_gerais.template;
      console.log(`⏳ Buscando template ${responseTemplateId}...`);
      
      const templateSlides = await templateService.fetchTemplate(responseTemplateId);
      console.log('✅ Template obtido, total de slides:', templateSlides?.length || 0);
      
      const rendered = templateRenderer.renderAllSlides(templateSlides, carouselData);
      console.log('✅ Slides renderizados:', rendered.length);

      // cria item de galeria
      const galleryItem = {
        id: queueItem.id,
        postCode: code,
        templateName: queueItem.templateName,
        createdAt: Date.now(),
        slides: rendered,
        carouselData,
        viewed: false,
      };
      console.log('✅ Item de galeria criado:', galleryItem.id);

      // atualiza estado local da galeria (se houver) e salva no cache + dispara evento
      try {
        console.log('⏳ Importando CacheService...');
        const { CacheService, CACHE_KEYS } = await import('../services/cache');
        console.log('✅ CacheService importado');
        
        const existing = CacheService.getItem<any[]>(CACHE_KEYS.GALLERY) || [];
        console.log('✅ Galeria existente no cache:', existing.length, 'itens');
        
        const updated = [galleryItem, ...existing];
        console.log('✅ Nova galeria terá:', updated.length, 'itens');
        
        CacheService.setItem(CACHE_KEYS.GALLERY, updated);
        console.log('✅ Galeria salva no cache');
        
        window.dispatchEvent(new CustomEvent('gallery:updated', { detail: updated }));
        console.log('✅ Evento gallery:updated disparado com', updated.length, 'itens');
      } catch (err) {
        console.error('❌ Erro ao atualizar cache/dispatch da galeria:', err);
      }

      // toast e remoção da fila
      console.log('⏳ Adicionando toast...');
      addToast('Carrossel criado e adicionado à galeria', 'success');
      console.log('✅ Toast adicionado');
      
      console.log('⏳ Removendo item da fila...');
      setGenerationQueue(prev => prev.filter(i => i.id !== queueItem.id));
      console.log('✅ Item removido da fila');
      console.log('🎉 Processo completo!');
    } catch (error) {
      console.error('❌ ERRO em handleGenerateCarousel:', error);
      console.error('❌ Stack:', error instanceof Error ? error.stack : 'N/A');
      addToast('Erro ao gerar carrossel. Tente novamente.', 'error');
      setGenerationQueue(prev => prev.filter(i => i.id !== queueItem.id));
    }
  };

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
    <div className="flex h-screen bg-black">
      <Navigation unviewedCount={unviewedCount} />
      <div className="flex-1 ml-16">
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
  <LoadingBar isLoading={isLoading} />
        <Header
          onSearch={handleSearch}
          activeSort={activeSort}
          onSortChange={setActiveSort}
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
      </div>
    </div>
  );
};

export default FeedPage;