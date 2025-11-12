export interface LoginResponse {
  status: string;
  message: string;
  jwt_token: string;
  user: User;
  needs_business_setup?: boolean;
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
  needs_business_setup?: boolean;
}

export interface ValidateTokenResponse {
  valid: boolean;
  user?: User;
  error?: string;
}