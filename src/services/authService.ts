import type { InvitationCodeItem, SupportMessage, SupportTicket } from '../types';

export interface AuthenticatedUser {
  id: string;
  clientId: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: 'trader' | 'admin';
  status: 'active' | 'frozen' | 'suspended';
  kycStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  twoFactorEnabled: boolean;
  invitationCode: string;
  myReferralCode: string;
  usdtBalance: number;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

interface AuthResponse {
  user: AuthenticatedUser;
}

interface AdminVerificationResponse extends AuthResponse {
  authorized: boolean;
}

class AuthApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new AuthApiError(payload.message || 'Request failed.', response.status);
  }

  return payload as T;
};

export const authService = {
  async sendVerificationCode(email: string) {
    return request<{ message: string; code?: string }>('/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  async register(input: {
    name: string;
    email: string;
    password: string;
    verificationCode?: string;
    invitationCode?: string;
  }) {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async login(input: { email: string; password: string }) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async me() {
    return request<AuthResponse>('/auth/me', {
      method: 'GET',
    });
  },
  async updateProfile(updates: { name?: string; phone?: string; avatar?: string }) {
    return request<AuthResponse>('/auth/profile/update', {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  },
  async changePassword(input: { currentPassword: string; newPassword: string }) {
    return request<{ message: string }>('/auth/profile/change-password', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async logout() {
    return request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    });
  },
  async verifyAdmin() {
    return request<AdminVerificationResponse>('/auth/admin/verify', {
      method: 'GET',
    });
  },
  async getAdminClients() {
    return request<{ clients: AuthenticatedUser[] }>('/admin/clients', {
      method: 'GET',
    });
  },
  async updateClientBalance(userId: string, amount: number) {
    return request<{ user: AuthenticatedUser }>('/admin/clients/balance', {
      method: 'POST',
      body: JSON.stringify({ userId, amount }),
    });
  },
  async updateClientStatus(userId: string, status: string) {
    return request<{ user: AuthenticatedUser }>('/admin/clients/status', {
      method: 'POST',
      body: JSON.stringify({ userId, status }),
    });
  },
  async getAdminInvitationCodes() {
    return request<{ codes: InvitationCodeItem[] }>('/admin/invitation-codes', {
      method: 'GET',
    });
  },
  async createAdminInvitationCode(code: string, maxUses: number) {
    return request<{ code: InvitationCodeItem }>('/admin/invitation-codes', {
      method: 'POST',
      body: JSON.stringify({ code, maxUses }),
    });
  },
  async getSupportTickets() {
    return request<{ tickets: SupportTicket[] }>('/support/tickets', {
      method: 'GET',
    });
  },
  async createSupportTicket(input: { subject: string; category?: string; message: string }) {
    return request<{ ticket: SupportTicket; message: SupportMessage }>('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async getSupportMessages(ticketId: string) {
    return request<{ messages: SupportMessage[] }>(`/support/tickets/${ticketId}/messages`, {
      method: 'GET',
    });
  },
  async sendSupportMessage(ticketId: string, message: string, status?: string) {
    return request<{ message: SupportMessage }>(`/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message, status }),
    });
  },
};

export const isAuthApiError = (error: unknown): error is AuthApiError => error instanceof AuthApiError;

