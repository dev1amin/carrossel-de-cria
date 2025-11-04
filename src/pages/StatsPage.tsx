import React, { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Clock, CheckCircle, XCircle, Loader } from 'lucide-react';
import Navigation from '../components/Navigation';
import PageTitle from '../components/PageTitle';
import { getGeneratedContentStats } from '../services/generatedContent';
import type { GeneratedContentStats } from '../types/generatedContent';

const StatsPage: React.FC = () => {
  const [stats, setStats] = useState<GeneratedContentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('🔄 Carregando estatísticas...');
      const response = await getGeneratedContentStats();
      console.log('✅ Stats recebidas:', response);
      setStats(response.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load stats';
      setError(errorMessage);
      console.error('❌ Erro ao carregar stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-black">
        <Navigation currentPage="settings" />
        <div className="flex-1 ml-16 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            <p className="text-white/60">Carregando estatísticas...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen bg-black">
        <Navigation currentPage="settings" />
        <div className="flex-1 ml-16 flex items-center justify-center p-4">
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-6 max-w-md">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={loadStats}
              className="w-full text-white bg-red-500 px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-screen bg-black">
        <Navigation currentPage="settings" />
        <div className="flex-1 ml-16 flex items-center justify-center">
          <p className="text-white/60">Nenhuma estatística disponível</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black">
      <Navigation currentPage="settings" />
      <div className="flex-1 ml-16 overflow-y-auto">
        <div className="pt-14">
          <PageTitle title="Estatísticas" />
        </div>
        <div className="container mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="w-8 h-8 text-purple-400" />
              <h1 className="text-3xl font-bold text-white">Estatísticas</h1>
            </div>
            <p className="text-white/60">Visão geral dos seus conteúdos gerados</p>
          </div>

          {/* Total Overview */}
          <div className="mb-8">
            <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-lg p-6">
              <div className="flex items-center gap-4">
                <div className="bg-purple-500/20 p-4 rounded-full">
                  <TrendingUp className="w-8 h-8 text-purple-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Total de Conteúdos Gerados</p>
                  <p className="text-white text-4xl font-bold">{stats.total}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Status Cards */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">Por Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Completed */}
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <span className="text-white/60 text-sm font-semibold">Completos</span>
                </div>
                <p className="text-white text-3xl font-bold">{stats.by_status.completed}</p>
                <p className="text-green-300 text-sm mt-2">
                  {stats.total > 0 
                    ? `${Math.round((stats.by_status.completed / stats.total) * 100)}%`
                    : '0%'} do total
                </p>
              </div>

              {/* Pending */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <Clock className="w-6 h-6 text-yellow-400" />
                  <span className="text-white/60 text-sm font-semibold">Pendentes</span>
                </div>
                <p className="text-white text-3xl font-bold">{stats.by_status.pending}</p>
                <p className="text-yellow-300 text-sm mt-2">
                  {stats.total > 0
                    ? `${Math.round((stats.by_status.pending / stats.total) * 100)}%`
                    : '0%'} do total
                </p>
              </div>

              {/* Failed */}
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <XCircle className="w-6 h-6 text-red-400" />
                  <span className="text-white/60 text-sm font-semibold">Falhas</span>
                </div>
                <p className="text-white text-3xl font-bold">{stats.by_status.failed}</p>
                <p className="text-red-300 text-sm mt-2">
                  {stats.total > 0
                    ? `${Math.round((stats.by_status.failed / stats.total) * 100)}%`
                    : '0%'} do total
                </p>
              </div>
            </div>
          </div>

          {/* Media Type */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">Por Tipo de Mídia</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(stats.by_media_type).map(([type, count]) => (
                <div
                  key={type}
                  className="bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white/80 capitalize">{type}</span>
                    <span className="text-white text-2xl font-bold">{count}</span>
                  </div>
                  <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                      style={{
                        width: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Provider */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">Por Provider (IA)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(stats.by_provider).map(([provider, count]) => (
                <div
                  key={provider}
                  className="bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader className="w-4 h-4 text-purple-400" />
                      <span className="text-white/80 capitalize">{provider}</span>
                    </div>
                    <span className="text-white text-2xl font-bold">{count}</span>
                  </div>
                  <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                      style={{
                        width: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Refresh Button */}
          <div className="flex justify-center">
            <button
              onClick={loadStats}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              <BarChart3 className="w-5 h-5" />
              Atualizar Estatísticas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsPage;
