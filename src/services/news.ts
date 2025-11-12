import { API_BASE_URL } from '../config/api';
import { authenticatedFetch } from '../utils/apiClient';
import type { NewsResponse, NewsQueryParams } from '../types/news';

const NEWS_ENDPOINT = `${API_BASE_URL}/news`;

export const getNews = async (params?: NewsQueryParams): Promise<NewsResponse> => {
  try {
    const token = localStorage.getItem('access_token');
    
    if (!token) {
      throw new Error('No authentication token found');
    }

    // Constrói query string com os parâmetros
    const queryParams = new URLSearchParams();
    
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.nicheId) queryParams.append('nicheId', params.nicheId);
    if (params?.country) queryParams.append('country', params.country);
    if (params?.lang) queryParams.append('lang', params.lang);

    const url = queryParams.toString() 
      ? `${NEWS_ENDPOINT}?${queryParams.toString()}`
      : NEWS_ENDPOINT;

    const response = await authenticatedFetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch news: ${response.statusText}`);
    }

    const data: NewsResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching news:', error);
    throw error;
  }
};
