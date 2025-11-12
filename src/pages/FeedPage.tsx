import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import Feed from '../components/Feed';
import Navigation from '../components/Navigation';
import LoadingBar from '../components/LoadingBar';
import PageTitle from '../components/PageTitle';
import Toast, { ToastMessage } from '../components/Toast';
import { SortOption, Post } from '../types';
import type { GenerationQueueItem } from '../carousel';
import { getFeed } from '../services/feed';
import { testCarouselData } from '../data/testCarouselData';
import { 
  templateService, 
  templateRenderer, 
  generateCarousel, 
  AVAILABLE_TEMPLATES, 
  CarouselEditorTabs, 
  type CarouselTab,
  type CarouselData
} from '../carousel';
import { useEditorTabs } from '../contexts/EditorTabsContext';
import { useGenerationQueue } from '../contexts/GenerationQueueContext';

interface FeedPageProps {
  unviewedCount?: number;
}

const FeedPage: React.FC<FeedPageProps> = ({ unviewedCount = 0 }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSort, setActiveSort] = useState<SortOption>('popular');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Usa o contexto compartilhado de abas
  const { editorTabs, addEditorTab: addTab, closeEditorTab, closeAllEditorTabs, shouldShowEditor, setShouldShowEditor } = useEditorTabs();
  
  // Usa o contexto global da fila
  const { addToQueue, updateQueueItem, removeFromQueue, generationQueue } = useGenerationQueue();

  // Esconde o editor ao entrar na página
  useEffect(() => {
    setShouldShowEditor(false);
  }, [setShouldShowEditor]);

  useEffect(() => {
    const loadFeed = async () => {
      setIsLoading(true);
      setError(null);
      try {
        console.log('📥 Carregando feed...');
        const feedData = await getFeed();
        console.log('✅ Feed carregado:', feedData.length, 'posts');
        setPosts(feedData);
      } catch (err) {
        console.error('❌ Erro ao carregar feed:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load feed';
        
        // Mensagens mais amigáveis para erros específicos
        if (errorMessage.includes('adicionar pelo menos 1 influenciador')) {
          setError('Você precisa adicionar pelo menos 1 influenciador como interesse antes de gerar seu feed. Configure isso nas configurações do seu business.');
        } else if (errorMessage.includes('Feed generation failed')) {
          setError('Não foi possível gerar seu feed no momento. Tente novamente em alguns instantes.');
        } else {
          setError(errorMessage);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadFeed();
  }, []);

  const handleSearch = (term: string) => {
    setSearchTerm(term);
  };

  const addEditorTab = (carousel: { slides: string[]; carouselData: CarouselData; title: string; id?: string }) => {
    const tabId = carousel.id || `tab-${Date.now()}`;
    
    const newTab: CarouselTab = {
      id: tabId,
      slides: carousel.slides,
      carouselData: carousel.carouselData,
      title: carousel.title,
    };
    
    addTab(newTab);
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

  const addToast = (message: string, type: 'success' | 'error') => {
    const toast: ToastMessage = { id: `toast-${Date.now()}`, message, type };
    setToasts(prev => [...prev, toast]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleGenerateCarousel = async (code: string, templateId: string, postId?: number) => {
    console.log('🚀 FeedPage: handleGenerateCarousel iniciado', { code, templateId, postId });
    
    const template = AVAILABLE_TEMPLATES.find(t => t.id === templateId);
    const queueItem: GenerationQueueItem = {
      id: `${code}-${templateId}-${Date.now()}`,
      postCode: code,
      templateId,
      templateName: template?.name || `Template ${templateId}`,
      status: 'generating',
      createdAt: Date.now(),
    };

    addToQueue(queueItem);
    console.log('✅ Item adicionado à fila:', queueItem.id);

    try {
      // Obter JWT token do localStorage
      const jwtToken = localStorage.getItem('access_token');
      
      console.log(`⏳ Chamando generateCarousel para post: ${code} com template: ${templateId}, postId: ${postId}, jwt: ${jwtToken ? 'presente' : 'ausente'}`);
      const result = await generateCarousel(code, templateId, jwtToken || undefined, postId);
      console.log('✅ Carousel generated successfully:', result);
      console.log('✅ Tipo do result:', typeof result, 'É array?', Array.isArray(result));
      console.log('✅ Length do result:', Array.isArray(result) ? result.length : 'N/A');

      // Verifica se result é um array
      if (!result) {
        console.error('❌ Result é null ou undefined');
        addToast('Erro: resposta vazia do servidor', 'error');
        updateQueueItem(queueItem.id, { status: 'error', errorMessage: 'Resposta vazia do servidor' });
        return;
      }

      // Se result não for array, tenta tratá-lo como objeto único
      const resultArray = Array.isArray(result) ? result : [result];
      console.log('✅ resultArray:', resultArray);

      if (resultArray.length === 0) {
        console.error('❌ Array de resultado vazio');
        addToast('Erro: nenhum dado retornado', 'error');
        updateQueueItem(queueItem.id, { status: 'error', errorMessage: 'Nenhum dado retornado' });
        return;
      }

      const carouselData = resultArray[0];
      console.log('✅ carouselData extraído:', carouselData);
      console.log('✅ dados_gerais:', carouselData?.dados_gerais);

      if (!carouselData || !carouselData.dados_gerais) {
        console.error('❌ Dados inválidos:', { carouselData });
        addToast('Erro: formato de dados inválido', 'error');
        updateQueueItem(queueItem.id, { status: 'error', errorMessage: 'Formato de dados inválido' });
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

      // toast e atualização do item na fila (marca como completed com os dados)
      console.log('⏳ Adicionando toast...');
      addToast('Carrossel criado e adicionado à galeria', 'success');
      console.log('✅ Toast adicionado');
      
      console.log('⏳ Atualizando item na fila para completed...');
      updateQueueItem(queueItem.id, {
        status: 'completed',
        completedAt: Date.now(),
        slides: rendered,
        carouselData: carouselData,
      });
      console.log('✅ Item atualizado na fila como completed');
      console.log('🎉 Processo completo!');
    } catch (error) {
      console.error('❌ ERRO em handleGenerateCarousel:', error);
      console.error('❌ Stack:', error instanceof Error ? error.stack : 'N/A');
      addToast('Erro ao gerar carrossel. Tente novamente.', 'error');
      updateQueueItem(queueItem.id, {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
      });
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
      <Navigation currentPage="feed" unviewedCount={unviewedCount} />
      <div className="flex-1 ml-16">
        {shouldShowEditor && (
          <CarouselEditorTabs
            tabs={editorTabs}
            onCloseTab={closeEditorTab}
            onCloseAll={closeAllEditorTabs}
            onEditorsClosed={() => setShouldShowEditor(false)}
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
        {/* Fila global removida daqui - agora está no App.tsx */}
        <main className={`pt-14 ${generationQueue.length > 0 ? 'mt-20' : ''}`}>
          <PageTitle title="Feed" />
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