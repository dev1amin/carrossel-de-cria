import { API_ENDPOINTS } from '../config/api';
import { authenticatedFetch } from '../utils/apiClient';
import type {
  Business,
  CreateBusinessRequest,
  BusinessResponse,
  BusinessListResponse,
} from '../types/business';

/**
 * Cria um novo business
 */
export const createBusiness = async (
  data: CreateBusinessRequest
): Promise<BusinessResponse> => {
  try {
    const token = localStorage.getItem('access_token');

    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await authenticatedFetch(`${API_ENDPOINTS.business}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw errorData;
    }

    const result: BusinessResponse = await response.json();
    return result;
  } catch (error) {
    console.error('Error creating business:', error);
    throw error;
  }
};

/**
 * Lista todos os businesses do usuário
 */
export const getBusinessList = async (): Promise<BusinessListResponse> => {
  try {
    const token = localStorage.getItem('access_token');

    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await authenticatedFetch(`${API_ENDPOINTS.business}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch business list: ${response.statusText}`);
    }

    const data: BusinessListResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching business list:', error);
    throw error;
  }
};

/**
 * Busca um business específico por ID
 */
export const getBusinessById = async (id: string): Promise<BusinessResponse> => {
  try {
    const token = localStorage.getItem('access_token');

    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await authenticatedFetch(`${API_ENDPOINTS.business}/${id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch business: ${response.statusText}`);
    }

    const data: BusinessResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching business:', error);
    throw error;
  }
};

/**
 * Atualiza um business
 */
export const updateBusiness = async (
  id: string,
  data: Partial<CreateBusinessRequest>
): Promise<BusinessResponse> => {
  try {
    const token = localStorage.getItem('access_token');

    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await authenticatedFetch(`${API_ENDPOINTS.business}/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw errorData;
    }

    const result: BusinessResponse = await response.json();
    return result;
  } catch (error) {
    console.error('Error updating business:', error);
    throw error;
  }
};

/**
 * Deleta um business
 */
export const deleteBusiness = async (id: string): Promise<{ success: boolean }> => {
  try {
    const token = localStorage.getItem('access_token');

    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await authenticatedFetch(`${API_ENDPOINTS.business}/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete business: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error deleting business:', error);
    throw error;
  }
};
