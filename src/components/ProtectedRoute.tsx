import { useEffect, useState } from 'react';
import { Navigate, useNavigate, Outlet } from 'react-router-dom';
import { validateToken, isAuthenticated } from '../services/auth';

const ProtectedRoute = () => {
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const validateAuth = async () => {
      if (!isAuthenticated()) {
        navigate('/login');
        return;
      }

      try {
        await validateToken();
        setIsLoading(false);
      } catch (error) {
        console.warn('Token validation failed:', error);
        navigate('/login');
      }
    };

    validateAuth();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-white"></div>
      </div>
    );
  }

  return isAuthenticated() ? <Outlet /> : <Navigate to="/login" />;
};

export default ProtectedRoute;