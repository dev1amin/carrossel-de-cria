import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { configureCarousel } from '../Carousel-Template';
import LoginPage from './pages/LoginPage';
import FeedPage from './pages/FeedPage';
import GalleryPage from './pages/GalleryPage';
import SettingsPageContainer from './pages/SettingsPageContainer';
import NotFoundPage from './pages/NotFoundPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
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

  return (
    <Routes>
      {/* Rota de Login */}
      <Route path="/login" element={<LoginPage />} />

      {/* Rota Raiz */}
      <Route path="/" element={<Navigate to="/feed" replace />} />

      {/* Rotas Protegidas */}
      <Route element={<ProtectedRoute />}>
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/settings" element={<SettingsPageContainer />} />
      </Route>

      {/* Página 404 para rotas não encontradas */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;