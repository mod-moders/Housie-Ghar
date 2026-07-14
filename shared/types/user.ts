/**
 * Shared TypeScript interfaces for User objects
 * Used by both frontend and backend
 */

export type RoleName = 'Superadmin' | 'Financial Admin' | 'Operator' | 'Bookie';
export type UserStatus = 'Active' | 'Suspended';

export interface Role {
  role_id: number;
  role_name: RoleName;
  description: string;
}

export interface UserProfile {
  user_id: string;
  role_id: number;
  role_name: RoleName;
  full_name: string;
  email: string;
  phone: string | null;
  upi_id: string | null;
  status: UserStatus;
  current_balance: number;
  temp_password_required: boolean;
  created_at: string;
  last_login: string | null;
}

export interface UserCreatePayload {
  full_name: string;
  email: string;
  phone?: string;
  upi_id?: string;
  role_id: number;
}

export interface UserGridEntry {
  user_id: string;
  full_name: string;
  role_name: RoleName;
  email: string;
  phone: string | null;
  status: UserStatus;
  current_balance: number;
  assigned_games_count: number;
  last_login: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}
