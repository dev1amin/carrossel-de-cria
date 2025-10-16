import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import MainContent from './components/MainContent';
import ProtectedRoute from './components/ProtectedRoute';
import { SortOption } from './types';

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSort, setActiveSort] = useState<SortOption>('popular');
  const [currentPage, setCurrentPage] = useState<'feed' | 'settings'>('feed');
  const [isLoading, setIsLoading] = useState(false);

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