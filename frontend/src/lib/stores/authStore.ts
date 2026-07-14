import { create } from "zustand";

export interface AuthUser {
  user_id: string;
  full_name: string;
  email: string;
  role_id: number;
  role_name: "Superadmin" | "Financial Admin" | "Operator" | "Bookie";
  current_balance?: number;
  is_cfo?: boolean;
  town?: string | null;
  phone?: string | null;
  upi_id?: string | null;
}

interface AuthStore {
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
