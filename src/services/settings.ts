import { API_ENDPOINTS } from '../config/api';
import { authenticatedFetch } from '../utils/apiClient';
import { UserSettings, Business, Influencer } from '../types/settings';
import { CacheService, CACHE_KEYS } from './cache';
import { getAuthHeaders } from './auth';

interface ProfileResponse {
  id: string;
  email: string;
  name: string;
  created_at: string;
  selected_business_id: string;
  business: Business;
  niche: string | null;
  niches: string[];
  influencers: Influencer[];
}

export const getUserSettings = async (): Promise<UserSettings> => {
  // Tentar obter do cache primeiro
  const cachedSettings = CacheService.getItem<UserSettings>(CACHE_KEYS.SETTINGS);
  if (cachedSettings) {
    return cachedSettings;
  }

  const response = await authenticatedFetch(API_ENDPOINTS.profile, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch user settings');
  }

  const data: ProfileResponse = await response.json();
  
  // A resposta já está no formato correto
  const settings: UserSettings = {
    id: data.id,
    email: data.email,
    name: data.name,
    created_at: data.created_at,
    selected_business_id: data.selected_business_id,
    business: data.business,
    niche: data.niche,
    niches: data.niches || [],
    influencers: data.influencers || [],
  };
  
  // Salvar no cache
  CacheService.setItem(CACHE_KEYS.SETTINGS, settings);
  
  return settings;
};

export const updateUserSettings = async (updates: Partial<UserSettings>): Promise<{ saved: boolean }> => {
  const body: any = {};

  // Atualizar nome se fornecido
  if (updates.name) {
    body.name = updates.name;
  }

  // Atualizar business se fornecido
  if (updates.business) {
    body.business = updates.business;
  }

  const response = await authenticatedFetch(API_ENDPOINTS.profile, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update settings');
  }

  // Limpar cache para forçar reload
  CacheService.clearItem(CACHE_KEYS.SETTINGS);

  return { saved: true };
};

// Helper para atualizar campos individuais do business
export const updateBusinessField = async (field: keyof Business, value: string | string[]): Promise<{ saved: boolean }> => {
  const currentSettings = CacheService.getItem<UserSettings>(CACHE_KEYS.SETTINGS);
  
  if (!currentSettings?.business?.id) {
    throw new Error('No business found');
  }

  const businessId = currentSettings.business.id;
  
  // Faz a requisição diretamente para o endpoint de business
  const response = await authenticatedFetch(`${API_ENDPOINTS.business}/${businessId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ [field]: value }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update business');
  }

  // Limpar cache para forçar reload
  CacheService.clearItem(CACHE_KEYS.SETTINGS);

  return { saved: true };
};

// Manter compatibilidade com o código antigo (deprecated)
export const updateUserSetting = async (field: string, value: string): Promise<{ saved: boolean }> => {
  // Mapear campos antigos para nova estrutura
  const fieldMapping: Record<string, keyof Business> = {
    'business_name': 'name',
    'business_website': 'website',
    'business_instagram_username': 'instagram_username',
  };

  const businessField = fieldMapping[field];
  if (businessField) {
    return updateBusinessField(businessField, value);
  }

  // Se for um campo direto do user (name)
  if (field === 'name') {
    return updateUserSettings({ name: value });
  }

  throw new Error(`Unknown field: ${field}`);
};