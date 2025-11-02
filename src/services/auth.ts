import { API_ENDPOINTS } from '../config/api';
import { LoginCredentials, LoginResponse, ValidateTokenResponse } from '../types/auth';

export const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
  console.log('Making login request to:', API_ENDPOINTS.login);
  
  const response = await fetch(API_ENDPOINTS.login, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  const data = await response.json();
  console.log('Login API response:', data);

  if (!response.ok || data.error) {
    console.error('Login API error:', data.error);
    throw new Error(data.error || 'Invalid credentials');
  }

  // Nova API retorna: { message, user, access_token, refresh_token, expires_at }
  if (data.user && data.access_token) {
    console.log('Storing user data in localStorage');
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('token_expires_at', data.expires_at.toString());
  }

  return {
    status: 'success',
    message: data.message || 'Login successful',
    user: data.user,
    jwt_token: data.access_token, // Manter compatibilidade com código existente
  };
};

export const refreshToken = async (): Promise<string> => {
  const refresh_token = localStorage.getItem('refresh_token');
  
  if (!refresh_token) {
    throw new Error('No refresh token found');
  }

  const response = await fetch(API_ENDPOINTS.refresh, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token_expires_at');
    throw new Error(data.error || 'Invalid refresh token');
  }

  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('token_expires_at', data.expires_at.toString());

  return data.access_token;
};

export const validateToken = async (): Promise<ValidateTokenResponse> => {
  const token = localStorage.getItem('access_token');
  const expiresAt = localStorage.getItem('token_expires_at');
  
  console.log('Validating token:', token ? 'Token exists' : 'No token');
  
  if (!token) {
    throw new Error('No token found');
  }

  // Verificar se o token expirou
  if (expiresAt && Date.now() / 1000 > parseInt(expiresAt)) {
    console.log('Token expired, attempting refresh...');
    try {
      await refreshToken();
      return { valid: true };
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw new Error('Token expired and refresh failed');
    }
  }

  return { valid: true };
};

export const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
};

export const isAuthenticated = (): boolean => {
  const isAuth = Boolean(localStorage.getItem('access_token'));
  console.log('Checking authentication:', isAuth);
  return isAuth;
};

export const logout = (): void => {
  localStorage.removeItem('user');
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('token_expires_at');
};