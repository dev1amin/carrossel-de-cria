import React, { useState, useEffect } from 'react';
import { SortOption, Post } from '../types';
import Header from './Header';
import Feed from './Feed';
import Navigation from './Navigation';
import SettingsPage from './SettingsPage';
import LoadingBar from './LoadingBar';
import { getFeed } from '../services/feed';

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
    <div className="min-h-screen bg-black pb-20 md:pb-0 md:pl-16">
      <LoadingBar isLoading={isLoading} />
      {currentPage === 'feed' && (
        <>
          <Header 
            onSearch={onSearch}
            activeSort={activeSort}
            onSortChange={onSortChange}
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
  );
};

export default MainContent;