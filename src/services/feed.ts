import { API_ENDPOINTS } from '../config/api';
import { Post } from '../types';
import { CacheService, CACHE_KEYS } from './cache';

export const getFeed = async (forceUpdate: boolean = false): Promise<Post[]> => {
  // Tentar obter do cache primeiro, a menos que forceUpdate seja true
  if (!forceUpdate) {
    const cachedFeed = CacheService.getItem<Post[]>(CACHE_KEYS.FEED);
    if (cachedFeed) {
      return cachedFeed;
    }
  }

  const token = localStorage.getItem('jwt_token');
  
  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_ENDPOINTS.base}/trends/getFeed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ jwt_token: token }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch feed');
  }

  const data = await response.json();
  
  // Salvar no cache
  CacheService.setItem(CACHE_KEYS.FEED, data);
  
  return data;
};