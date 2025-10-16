import { API_ENDPOINTS } from '../config/api';
import { UserSettings } from '../types/settings';

export const getUserSettings = async (): Promise<UserSettings> => {
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
  return Array.isArray(data) ? data[0] : data;
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
  return data;
};