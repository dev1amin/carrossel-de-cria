import { API_ENDPOINTS } from '../config/api';
import { Post } from '../types';

export const getFeed = async (): Promise<Post[]> => {
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
  return data;
};