export interface LoginResponse {
  status: string;
  message: string;
  jwt_token: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  plan?: string;
}

export interface ValidateTokenResponse {
  valid: boolean;
  user?: User;
  error?: string;
}