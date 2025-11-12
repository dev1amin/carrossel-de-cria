import { API_ENDPOINTS } from '../config/api';
import { authenticatedFetch } from '../utils/apiClient';
import type {
  GeneratedContentListResponse,
  GeneratedContentResponse,
  GeneratedContentStatsResponse,
  GeneratedContentQueryParams,
  DeleteGeneratedContentResponse,
  UpdateGeneratedContentRequest,
  UpdateGeneratedContentResponse,
} from '../types/generatedContent';

/**
 * Lista todos os conteúdos gerados do usuário (apenas completed)
 */
export const getGeneratedContent = async (
  params?: GeneratedContentQueryParams
): Promise<GeneratedContentListResponse> => {
  try {
    const token = localStorage.getItem('access_token');

    if (!token) {
      throw new Error('No authentication token found');
    }

    // Constrói query string
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.media_type) queryParams.append('media_type', params.media_type);
    if (params?.provider_type) queryParams.append('provider_type', params.provider_type);

    const url = queryParams.toString()
      ? `${API_ENDPOINTS.generatedContent}?${queryParams.toString()}`
      : API_ENDPOINTS.generatedContent;

    const response = await authenticatedFetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch generated content: ${response.statusText}`);
    }

    const data: GeneratedContentListResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching generated content:', error);
    throw error;
  }
};

/**
 * Busca um conteúdo gerado específico por ID
 */
export const getGeneratedContentById = async (id: number): Promise<GeneratedContentResponse> => {
  try {
    const token = localStorage.getItem('access_token');

    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await authenticatedFetch(`${API_ENDPOINTS.generatedContent}/${id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Content not found or does not belong to user');
      }
      throw new Error(`Failed to fetch generated content: ${response.statusText}`);
    }

    const data: GeneratedContentResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching generated content by ID:', error);
    throw error;
  }
};

/**
 * Retorna estatísticas dos conteúdos gerados do usuário
 */
export const getGeneratedContentStats = async (): Promise<GeneratedContentStatsResponse> => {
  try {
    const token = localStorage.getItem('access_token');

    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await authenticatedFetch(API_ENDPOINTS.generatedContentStats, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.statusText}`);
    }

    const data: GeneratedContentStatsResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching generated content stats:', error);
    throw error;
  }
};

/**
 * Deleta um conteúdo gerado específico
 */
export const deleteGeneratedContent = async (id: number): Promise<DeleteGeneratedContentResponse> => {
  try {
    const token = localStorage.getItem('access_token');

    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await authenticatedFetch(`${API_ENDPOINTS.generatedContent}/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Content not found or does not belong to user');
      }
      if (response.status === 500) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete generated content');
      }
      throw new Error(`Failed to delete content: ${response.statusText}`);
    }

    const data: DeleteGeneratedContentResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error deleting generated content:', error);
    throw error;
  }
};

/**
 * Atualiza o campo result de um conteúdo gerado
 */
export const updateGeneratedContent = async (
  id: number,
  updates: UpdateGeneratedContentRequest
): Promise<UpdateGeneratedContentResponse> => {
  try {
    const token = localStorage.getItem('access_token');

    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await authenticatedFetch(`${API_ENDPOINTS.generatedContent}/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      if (response.status === 400) {
        const errorData = await response.json();
        const errorMessage = errorData.details
          ? errorData.details.map((d: any) => d.message).join(', ')
          : errorData.error || 'Validation failed';
        throw new Error(errorMessage);
      }
      if (response.status === 404) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Content not found or does not belong to user');
      }
      if (response.status === 500) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update generated content');
      }
      throw new Error(`Failed to update content: ${response.statusText}`);
    }

    const data: UpdateGeneratedContentResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating generated content:', error);
    throw error;
  }
};
