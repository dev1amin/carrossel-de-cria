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

  if (data.error) {
    console.error('Login API error:', data.error);
    throw new Error(data.error || 'Login failed');
  }

  if (data.status === 'success') {
    console.log('Storing user data in localStorage');
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('jwt_token', data.jwt_token);
  }

  return data;
};

export const validateToken = async (): Promise<ValidateTokenResponse> => {
  const token = localStorage.getItem('jwt_token');
  console.log('Validating token:', token ? 'Token exists' : 'No token');
  
  if (!token) {
    throw new Error('No token found');
  }

  const response = await fetch(`${API_ENDPOINTS.base}/trends/validate-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jwt_token: token }),
  });

  const data = await response.json();
  console.log('Token validation response:', data);

  if (!data.valid) {
    console.warn('Invalid token, clearing localStorage');
    localStorage.removeItem('user');
    localStorage.removeItem('jwt_token');
    throw new Error(data.error || 'Invalid token');
  }

  return data;
};

export const isAuthenticated = (): boolean => {
  const isAuth = Boolean(localStorage.getItem('jwt_token'));
  console.log('Checking authentication:', isAuth);
  return isAuth;
};