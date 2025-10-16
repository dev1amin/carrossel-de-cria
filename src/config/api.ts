export const API_BASE_URL = 'https://webhook.workez.online/webhook';

export const API_ENDPOINTS = {
  base: API_BASE_URL,
  login: `${API_BASE_URL}/trends/login`,
  settings: `${API_BASE_URL}/trends/getUserSettings`,
  feed: `${API_BASE_URL}/trends/getFeed`,
} as const;