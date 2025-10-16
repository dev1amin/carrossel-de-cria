import React, { useState, useEffect } from 'react';
import { SortOption, Post } from '../types';
import Header from './Header';
import Feed from './Feed';
import Navigation from './Navigation';
import SettingsPage from './SettingsPage';
import LoadingBar from './LoadingBar';
import CarouselViewer from './CarouselViewer';
import { getFeed } from '../services/feed';
import { templateService } from '../services/template';
import { templateRenderer } from '../services/templateRenderer';
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

interface CarouselData {
  dados_gerais: {
    nome: string;
    arroba: string;
    foto_perfil: string;
    template: string;
  };
  conteudos: Array<{
    title: string;
    subtitle?: string;
    imagem_fundo: string;
    thumbnail_url?: string;
    imagem_fundo2?: string;
    imagem_fundo3?: string;
  }>;
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
  const [testSlides, setTestSlides] = useState<string[] | null>(null);
  const [testCarouselData, setTestCarouselData] = useState<CarouselData | null>(null);

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
      setTestCarouselData(carouselData);
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
      {testSlides && testCarouselData && (
        <CarouselViewer
          slides={testSlides}
          carouselData={testCarouselData}
          onClose={() => {
            setTestSlides(null);
            setTestCarouselData(null);
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
          <main className="pt-14">
            <Feed 
              posts={posts} 
              searchTerm={searchTerm}
              activeSort={activeSort}
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