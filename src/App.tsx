import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { configureCarousel } from '../Carousel-Template';
import LoginPage from './pages/LoginPage';
import MainContent from './components/MainContent';
import ProtectedRoute from './components/ProtectedRoute';
import { SortOption } from './types';

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSort, setActiveSort] = useState<SortOption>('popular');
  const [currentPage, setCurrentPage] = useState<'feed' | 'settings'>('feed');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    configureCarousel({
      webhook: {
        generateCarousel: 'https://webhook.workez.online/webhook/generateCarousel',
        searchImages: 'https://webhook.workez.online/webhook/searchImages',
      },
      minio: {
        endpoint: 'https://s3.workez.online',
        bucket: 'carousel-templates',
      },
      templates: {
        totalSlides: 10,
      },
    });
  }, []);

  const handleSearch = (term: string) => {
    setSearchTerm(term);
  };

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainContent
              searchTerm={searchTerm}
              activeSort={activeSort}
              currentPage={currentPage}
              isLoading={isLoading}
              onSearch={handleSearch}
              onSortChange={setActiveSort}
              onPageChange={setCurrentPage}
              setIsLoading={setIsLoading}
            />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/\" replace />} />
    </Routes>
  );
}

export default App;