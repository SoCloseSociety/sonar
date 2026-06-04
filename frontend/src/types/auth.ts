export interface User {
  id: number;
  email?: string;
  username: string;
  wallet_address?: string;
  auth_method: string;
  role: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}
