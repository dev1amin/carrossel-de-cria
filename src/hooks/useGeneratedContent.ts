import { useState, useEffect, useCallback } from 'react';
import {
  getGeneratedContent,
  getGeneratedContentById,
  getGeneratedContentStats,
} from '../services/generatedContent';
import type {
  GeneratedContent,
  GeneratedContentStats,
  GeneratedContentQueryParams,
} from '../types/generatedContent';

interface UseGeneratedContentReturn {
  content: GeneratedContent[];
  stats: GeneratedContentStats | null;
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null;
  loadContent: (params?: GeneratedContentQueryParams) => Promise<void>;
  loadStats: () => Promise<void>;
  loadById: (id: number) => Promise<GeneratedContent | null>;
  refresh: () => Promise<void>;
}

export const useGeneratedContent = (
  autoLoad: boolean = true,
  initialParams?: GeneratedContentQueryParams
): UseGeneratedContentReturn => {
  const [content, setContent] = useState<GeneratedContent[]>([]);
  const [stats, setStats] = useState<GeneratedContentStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null>(null);
  const [currentParams, setCurrentParams] = useState<GeneratedContentQueryParams | undefined>(
    initialParams
  );

  const loadContent = useCallback(async (params?: GeneratedContentQueryParams) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getGeneratedContent(params);
      setContent(response.data);
      setPagination(response.pagination);
      setCurrentParams(params);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load content';
      setError(errorMessage);
      console.error('Error loading generated content:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const response = await getGeneratedContentStats();
      setStats(response.data);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }, []);

  const loadById = useCallback(async (id: number): Promise<GeneratedContent | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getGeneratedContentById(id);
      return response.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load content';
      setError(errorMessage);
      console.error('Error loading content by ID:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadContent(currentParams), loadStats()]);
  }, [currentParams, loadContent, loadStats]);

  useEffect(() => {
    if (autoLoad) {
      loadContent(initialParams);
      loadStats();
    }
  }, [autoLoad]); // Only run on mount if autoLoad is true

  return {
    content,
    stats,
    isLoading,
    error,
    pagination,
    loadContent,
    loadStats,
    loadById,
    refresh,
  };
};
