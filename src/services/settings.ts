import { API_ENDPOINTS } from '../config/api';
import { UserSettings } from '../types/settings';
import { CacheService, CACHE_KEYS } from './cache';

export const getUserSettings = async (): Promise<UserSettings> => {
  // Tentar obter do cache primeiro
  const cachedSettings = CacheService.getItem<UserSettings>(CACHE_KEYS.SETTINGS);
  if (cachedSettings) {
    return cachedSettings;
  }

  const token = localStorage.getItem('jwt_token');
  
  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(API_ENDPOINTS.settings, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ jwt_token: token }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch user settings');
  }

  const data = await response.json();
  const settings = Array.isArray(data) ? data[0] : data;
  
  // Salvar no cache
  CacheService.setItem(CACHE_KEYS.SETTINGS, settings);
  
  return settings;
};

export const updateUserSetting = async (field: string, value: string): Promise<{ saved: boolean }> => {
  const token = localStorage.getItem('jwt_token');
  
  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_ENDPOINTS.base}/trends/updateSettings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      jwt_token: token,
      field,
      value
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update setting');
  }

  const data = await response.json();
  
  // Atualizar o cache com o novo valor
  const cachedSettings = CacheService.getItem<UserSettings>(CACHE_KEYS.SETTINGS);
  if (cachedSettings) {
    const updatedSettings = {
      ...cachedSettings,
      [field]: value
    };
    CacheService.setItem(CACHE_KEYS.SETTINGS, updatedSettings);
  }

  return data;
};