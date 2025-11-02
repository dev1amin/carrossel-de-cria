import { API_ENDPOINTS } from '../config/api';
import { UserSettings } from '../types/settings';
import { CacheService, CACHE_KEYS } from './cache';
import { getAuthHeaders } from './auth';

interface ProfileResponse {
  id: string;
  email: string;
  name: string;
  created_at: string;
  business?: {
    name?: string;
    website?: string;
    instagram_username?: string;
    tone_of_voice?: string;
  };
}

export const getUserSettings = async (): Promise<UserSettings> => {
  // Tentar obter do cache primeiro
  const cachedSettings = CacheService.getItem<UserSettings>(CACHE_KEYS.SETTINGS);
  if (cachedSettings) {
    return cachedSettings;
  }

  const response = await fetch(API_ENDPOINTS.profile, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch user settings');
  }

  const data: ProfileResponse = await response.json();
  
  // Converter para o formato UserSettings
  const settings: UserSettings = {
    id: data.id,
    email: data.email,
    name: data.name,
    business_name: data.business?.name || null,
    business_website: data.business?.website || null,
    business_instagram_username: data.business?.instagram_username || null,
    current_feed_niche: '',
    niches: [],
  };
  
  // Salvar no cache
  CacheService.setItem(CACHE_KEYS.SETTINGS, settings);
  
  return settings;
};

export const updateUserSettings = async (updates: Partial<UserSettings>): Promise<{ saved: boolean }> => {
  const business: any = {};
  
  if (updates.business_name !== undefined) business.name = updates.business_name;
  if (updates.business_website !== undefined) business.website = updates.business_website;
  if (updates.business_instagram_username !== undefined) business.instagram_username = updates.business_instagram_username;

  const body: any = {};
  if (updates.name) body.name = updates.name;
  if (Object.keys(business).length > 0) body.business = business;

  const response = await fetch(API_ENDPOINTS.profile, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update settings');
  }

  // Atualizar o cache
  const cachedSettings = CacheService.getItem<UserSettings>(CACHE_KEYS.SETTINGS);
  if (cachedSettings) {
    const updatedSettings = {
      ...cachedSettings,
      ...updates
    };
    CacheService.setItem(CACHE_KEYS.SETTINGS, updatedSettings);
  }

  return { saved: true };
};

// Manter compatibilidade com o código antigo
export const updateUserSetting = async (field: string, value: string): Promise<{ saved: boolean }> => {
  return updateUserSettings({ [field]: value });
};