import React, { useState, useEffect } from 'react';
import { SortOption, Post } from '../types';
import Header from './Header';
import Feed from './Feed';
import Navigation from './Navigation';
import SettingsPage from './SettingsPage';
import LoadingBar from './LoadingBar';
import { CarouselViewer, GenerationQueue, useCarousel } from '../../Carousel-Template';
import { templateService, templateRenderer, generateCarousel } from '../../Carousel-Template';
import { AVAILABLE_TEMPLATES, GenerationQueueItem, CarouselData as CarouselDataType } from '../../Carousel-Template';
import { getFeed } from '../services/feed';
import { testCarouselData } from '../data/testCarouselData';

interface MainContentProps {
  searchTerm: string;
  activeSort: SortOption;
  currentPage: 'feed' | 'settings';
  isLoading: boolean;
  onSearch: (term: string) => void;
  onSortChange: (sort: SortOption) => void;
  onPageChange: (page: 'feed' | 'settings') => void;
  setIsLoading: (loading: boolean) => void;
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
      const result = await generateCarousel(code, templateId);
      console.log('Carousel generated successfully:', result);

      if (result && result.length > 0) {
        const carouselData = result[0];
        const responseTemplateId = carouselData.dados_gerais.template;

        console.log(`Fetching template ${responseTemplateId}...`);
        const templateSlides = await templateService.fetchTemplate(responseTemplateId);

        console.log('Rendering slides with data...');
        const rendered = templateRenderer.renderAllSlides(templateSlides, carouselData);

        setTestSlides(rendered);
        setCurrentCarouselData(carouselData);

        setGenerationQueue(prev =>
          prev.map(item =>
            item.id === queueItem.id
              ? { ...item, status: 'completed', completedAt: Date.now() }
              : item
          )
        );
      }
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

      alert('Erro ao gerar carrossel. Verifique o console para mais detalhes.');
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
        const feedData = await getFeed();
        setPosts(feedData);
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
      
      {currentPage === 'settings' && (
        <SettingsPage 
          onPageChange={onPageChange} 
          setIsLoading={setIsLoading}
        />
      )}
      
      <Navigation
        currentPage={currentPage}
        onPageChange={onPageChange}
      />
    </div>
    </>
  );
};

export default MainContent;