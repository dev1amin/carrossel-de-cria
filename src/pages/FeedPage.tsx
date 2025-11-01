import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import Feed from '../components/Feed';
import Navigation from '../components/Navigation';
import LoadingBar from '../components/LoadingBar';
import { GenerationQueue } from '../../Carousel-Template';
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
      }
    } catch (error) {
      console.error('Failed to generate carousel:', error);
      alert('Erro ao gerar carrossel. Verifique o console para mais detalhes.');
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