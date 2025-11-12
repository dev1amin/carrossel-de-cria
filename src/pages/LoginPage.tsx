import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { login } from '../services/auth';
import { useNavigate } from 'react-router-dom';

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Login attempt with email:', email);
    setError('');
    setIsLoading(true);

    try {
      const response = await login({ email, password });
      console.log('Login response:', response);
      
      if (onLoginSuccess) {
        console.log('Calling onLoginSuccess callback');
        onLoginSuccess();
      }
      
      // Verifica se precisa fazer setup de business
      if (response.needs_business_setup) {
        console.log('🏢 Usuário precisa configurar business, redirecionando...');
        navigate('/setup-business');
        return;
      }
      
      console.log('Navigating to home page');
      navigate('/');
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="https://cdn.prod.website-files.com/665825f3f5168cb68f2c36e1/6662ca6f1be62e26c76ef652_workezLogoWebp.webp"
            alt="Workez Logo"
            className="h-8 mx-auto mb-6"
          />
          <h1 className="text-2xl font-bold text-white">Work Smarter, not Harder!</h1>
          <p className="text-gray-400 mt-2">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 rounded-lg p-4 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white"
              placeholder="Enter your email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-white text-black rounded-lg px-4 py-3 flex items-center justify-center space-x-2 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span>{isLoading ? 'Signing in...' : 'Sign in'}</span>
            {!isLoading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;