export const API_BASE_URL = 'https://carousel-api-sepia.vercel.app/api';

export const API_ENDPOINTS = {
  base: API_BASE_URL,
  // Auth
  login: `${API_BASE_URL}/auth/login`,
  register: `${API_BASE_URL}/auth/register`,
  refresh: `${API_BASE_URL}/auth/refresh`,
  // Users
  profile: `${API_BASE_URL}/users/profile`,
  influencers: `${API_BASE_URL}/users/influencers`,
  // Feed
  feed: `${API_BASE_URL}/feed`,
  feedSave: `${API_BASE_URL}/feed/save`,
} as const;