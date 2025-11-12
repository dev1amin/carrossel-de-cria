/**
 * API Client com tratamento automático de JWT expirado e refresh token
 */

import { logout, refreshToken } from '../services/auth';

/**
 * Flag para evitar múltiplas tentativas de refresh simultâneas
 */
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

/**
 * Verifica se o erro é de JWT expirado
 */
const isJWTExpiredError = (error: any): boolean => {
  // Se for string, converte para objeto
  if (typeof error === 'string') {
    const lowerMessage = error.toLowerCase();
    return (
      lowerMessage.includes('jwt') ||
      lowerMessage.includes('expired') ||
      lowerMessage.includes('token') ||
      lowerMessage.includes('unauthorized')
    );
  }
  
  // Verifica diferentes formatos de erro de JWT expirado
  const errorMessage = error?.message || error?.error || '';
  const lowerMessage = errorMessage.toLowerCase();
  
  return (
    lowerMessage.includes('jwt') ||
    lowerMessage.includes('expired') ||
    lowerMessage.includes('token') ||
    lowerMessage.includes('unauthorized') ||
    error?.status === 401 ||
    error?.statusCode === 401
  );
};

/**
 * Tenta fazer refresh do token antes de deslogar
 */
const tryRefreshToken = async (): Promise<string> => {
  // Se já está refreshing, retorna a promise existente
  if (isRefreshing && refreshPromise) {
    console.log('🔄 Refresh já em andamento, aguardando...');
    return refreshPromise;
  }

  isRefreshing = true;
  console.log('🔄 Tentando refresh do token...');

  refreshPromise = refreshToken()
    .then((newToken) => {
      console.log('✅ Token refreshed com sucesso!');
      isRefreshing = false;
      refreshPromise = null;
      return newToken;
    })
    .catch((error) => {
      console.error('❌ Falha ao fazer refresh do token:', error);
      isRefreshing = false;
      refreshPromise = null;
      throw error;
    });

  return refreshPromise;
};

/**
 * Trata erro de autenticação: tenta refresh ou desloga e redireciona para login
 */
export const handleAuthError = async (): Promise<never> => {
  console.error('🔒 JWT expirado ou inválido detectado');
  
  try {
    // Tenta fazer refresh do token
    await tryRefreshToken();
    console.log('✅ Token renovado com sucesso, pode continuar');
    // Se chegou aqui, o refresh funcionou, mas precisamos jogar um erro
    // para que a requisição original seja refeita
    throw new Error('TOKEN_REFRESHED_RETRY');
  } catch (error: any) {
    // Se o refresh falhou, desloga o usuário
    if (error?.message !== 'TOKEN_REFRESHED_RETRY') {
      console.error('🔒 Refresh token falhou. Deslogando usuário...');
      console.error('🔒 localStorage antes de limpar:', {
        access_token: localStorage.getItem('access_token'),
        refresh_token: localStorage.getItem('refresh_token'),
        user: localStorage.getItem('user')
      });
      
      // Remove dados do localStorage
      logout();
      
      console.error('🔒 localStorage após limpar:', {
        access_token: localStorage.getItem('access_token'),
        refresh_token: localStorage.getItem('refresh_token'),
        user: localStorage.getItem('user')
      });
      
      console.error('🔒 Redirecionando para /login...');
      
      // Redireciona para login
      window.location.href = '/login';
    }
    
    // Joga erro para interromper execução
    throw new Error('JWT_EXPIRED_OR_REFRESHED');
  }
};

/**
 * Fetch wrapper que trata automaticamente erros de JWT expirado com refresh
 */
export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<Response> => {
  try {
    const response = await fetch(url, options);
    
    console.log(`[authenticatedFetch] ${options.method || 'GET'} ${url} - Status: ${response.status}`);
    
    // Se recebeu 401, tenta refresh e tenta novamente
    if (response.status === 401 && retryCount === 0) {
      console.error('🔒 Recebeu status 401 - Tentando refresh do token...');
      
      try {
        await tryRefreshToken();
        
        // Atualiza o header Authorization com o novo token
        const newToken = localStorage.getItem('access_token');
        if (newToken && options.headers) {
          const headers = new Headers(options.headers);
          headers.set('Authorization', `Bearer ${newToken}`);
          options.headers = headers;
        }
        
        console.log('🔄 Refazendo requisição com novo token...');
        // Refaz a requisição com o novo token (incrementa retry para evitar loop infinito)
        return authenticatedFetch(url, options, retryCount + 1);
      } catch (refreshError) {
        console.error('❌ Refresh falhou, redirecionando para login');
        await handleAuthError();
        throw new Error('JWT expired and refresh failed');
      }
    }
    
    // Se ainda recebeu 401 na segunda tentativa, desloga
    if (response.status === 401 && retryCount > 0) {
      console.error('🔒 Ainda recebeu 401 após refresh - Deslogando');
      await handleAuthError();
      throw new Error('JWT expired');
    }
    
    // Se não for ok, tenta parsear o erro para verificar JWT
    if (!response.ok) {
      try {
        const errorData = await response.clone().json();
        console.log('[authenticatedFetch] Erro recebido:', errorData);
        
        // Verifica se o erro contém informação de JWT expirado
        if (isJWTExpiredError(errorData) && retryCount === 0) {
          console.error('🔒 Erro de JWT detectado no response body - Tentando refresh...');
          
          try {
            await tryRefreshToken();
            
            // Atualiza o header Authorization com o novo token
            const newToken = localStorage.getItem('access_token');
            if (newToken && options.headers) {
              const headers = new Headers(options.headers);
              headers.set('Authorization', `Bearer ${newToken}`);
              options.headers = headers;
            }
            
            console.log('🔄 Refazendo requisição com novo token...');
            return authenticatedFetch(url, options, retryCount + 1);
          } catch (refreshError) {
            console.error('❌ Refresh falhou, redirecionando para login');
            await handleAuthError();
            throw new Error('JWT expired and refresh failed');
          }
        }
      } catch (parseError) {
        console.warn('[authenticatedFetch] Não foi possível parsear erro como JSON:', parseError);
        // Se não conseguir parsear, continua normalmente
      }
    }
    
    return response;
  } catch (error: any) {
    console.log('[authenticatedFetch] Exception capturada:', error);
    
    // Verifica se é erro de JWT e se ainda não tentou refresh
    if (isJWTExpiredError(error) && retryCount === 0) {
      console.error('🔒 Erro de JWT detectado na exception - Tentando refresh...');
      
      try {
        await tryRefreshToken();
        
        // Atualiza o header Authorization com o novo token
        const newToken = localStorage.getItem('access_token');
        if (newToken && options.headers) {
          const headers = new Headers(options.headers);
          headers.set('Authorization', `Bearer ${newToken}`);
          options.headers = headers;
        }
        
        console.log('🔄 Refazendo requisição com novo token...');
        return authenticatedFetch(url, options, retryCount + 1);
      } catch (refreshError) {
        console.error('❌ Refresh falhou, redirecionando para login');
        await handleAuthError();
        throw error;
      }
    }
    
    throw error;
  }
};

/**
 * Helper para fazer requests JSON autenticados
 */
export const authenticatedRequest = async <T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await authenticatedFetch(url, options);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || 'Request failed');
  }
  
  return response.json();
};
