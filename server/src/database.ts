import fs from 'node:fs';
import path from 'node:path';

export interface DatabaseUserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'trader' | 'admin';
  phone?: string;
  avatar?: string;
  client_id?: string;
  invitation_code?: string;
  my_referral_code?: string;
  status?: 'active' | 'frozen' | 'suspended';
  two_factor_enabled?: boolean;
  kyc_status?: 'unverified' | 'pending' | 'verified';
  usdt_balance?: number;
  crypto_assets?: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface DatabaseSessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface DatabaseVerificationCodeRow {
  email: string;
  code: string;
  expires_at: number;
}

export interface DatabaseInvitationCodeRow {
  code: string;
  max_uses: number;
  used_count: number;
  created_at: string;
}

export interface DatabaseSupportTicketRow {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  client_id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved';
  created_at: string;
  updated_at: string;
}

export interface DatabaseSupportMessageRow {
  id: string;
  ticket_id: string;
  sender_role: 'client' | 'admin';
  sender_name: string;
  text: string;
  created_at: string;
}

export interface Statement<TParams extends any[] = any[], TRow = any> {
  get(...params: TParams): TRow | undefined;
  run(...params: TParams): { changes: number };
  all(...params: TParams): TRow[];
}

export interface SqliteDatabase {
  pragma(sql: string): void;
  exec(sql: string): void;
  prepare<TParams extends any[] = any[], TRow = any>(sql: string): Statement<TParams, TRow>;
  close(): void;

  // Direct extended helpers for rich data features
  saveEmailCode(email: string, code: string): void;
  verifyEmailCode(email: string, code: string): boolean;
  getVerificationCode(email: string): DatabaseVerificationCodeRow | undefined;
  setVerificationCode(email: string, code: string, expiresAt: number): void;
  validateInvitationCode(code: string): boolean;
  useInvitationCode(code: string): void;
  getInvitationCode(code: string): DatabaseInvitationCodeRow | undefined;
  incrementInvitationCode(code: string): void;
  createInvitationCode(code: string, createdByOrMaxUses?: string | number, maxUsesArg?: number): DatabaseInvitationCodeRow;
  getInvitationCodes(): DatabaseInvitationCodeRow[];
  getAllInvitationCodes(): DatabaseInvitationCodeRow[];
  setUserBalance(userId: string, amount: number): void;
  setUserStatus(userId: string, status: 'active' | 'frozen' | 'suspended'): void;
  updateUserProfile(id: string, updates: Partial<DatabaseUserRow>): DatabaseUserRow | undefined;
  updateUser(id: string, updates: Partial<DatabaseUserRow>): DatabaseUserRow | undefined;
  getAllUsers(): DatabaseUserRow[];
  getSupportTickets(userId?: string): DatabaseSupportTicketRow[];
  createSupportTicket(
    userIdOrTicket: string | DatabaseSupportTicketRow,
    clientIdOrMsgText?: string,
    userName?: string,
    userEmail?: string,
    subject?: string,
    category?: string
  ): DatabaseSupportTicketRow;
  getSupportMessages(ticketId: string): DatabaseSupportMessageRow[];
  addSupportMessage(
    ticketIdOrObj: string | DatabaseSupportMessageRow,
    senderId?: string,
    senderName?: string,
    senderRole?: 'trader' | 'admin' | 'client',
    text?: string
  ): DatabaseSupportMessageRow;
  updateSupportTicketStatus(ticketId: string, status: 'open' | 'in_progress' | 'resolved'): void;
  updateTicketStatus(ticketId: string, status: 'open' | 'in_progress' | 'resolved'): void;
}

interface StoredData {
  users: DatabaseUserRow[];
  sessions: DatabaseSessionRow[];
  verificationCodes: DatabaseVerificationCodeRow[];
  invitationCodes: DatabaseInvitationCodeRow[];
  supportTickets: DatabaseSupportTicketRow[];
  supportMessages: DatabaseSupportMessageRow[];
}

export const openDatabase = (databasePath: string): SqliteDatabase => {
  let isInMemory = databasePath === ':memory:';
  let storageFile = databasePath;

  if (!isInMemory) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    if (!storageFile.endsWith('.json')) {
      storageFile = storageFile.replace(/\.sqlite$/, '') + '.json';
    }
  }

  let data: StoredData = {
    users: [],
    sessions: [],
    verificationCodes: [],
    invitationCodes: [
      { code: 'NEXIFY2026', max_uses: 1000, used_count: 5, created_at: new Date().toISOString() },
      { code: 'PROTRADEVIP', max_uses: 500, used_count: 12, created_at: new Date().toISOString() },
    ],
    supportTickets: [],
    supportMessages: [],
  };

  if (!isInMemory && fs.existsSync(storageFile)) {
    try {
      const content = fs.readFileSync(storageFile, 'utf-8');
      const parsed = JSON.parse(content);
      data = {
        users: parsed.users || [],
        sessions: parsed.sessions || [],
        verificationCodes: parsed.verificationCodes || [],
        invitationCodes: parsed.invitationCodes || [
          { code: 'NEXIFY2026', max_uses: 1000, used_count: 5, created_at: new Date().toISOString() },
          { code: 'PROTRADEVIP', max_uses: 500, used_count: 12, created_at: new Date().toISOString() },
        ],
        supportTickets: parsed.supportTickets || [],
        supportMessages: parsed.supportMessages || [],
      };
    } catch {
      // Data initialized to default empty collections
    }
  }

  const persist = () => {
    if (!isInMemory) {
      fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), 'utf-8');
    }
  };

  const dbInstance: SqliteDatabase = {
    pragma(_sql: string) {},
    exec(_sql: string) {},
    close() {
      persist();
    },
    saveEmailCode(email: string, code: string) {
      const normalized = email.trim().toLowerCase();
      const expiresAt = Date.now() + 15 * 60 * 1000;
      data.verificationCodes = data.verificationCodes.filter((v) => v.email.toLowerCase() !== normalized);
      data.verificationCodes.push({ email: normalized, code, expires_at: expiresAt });
      persist();
    },
    verifyEmailCode(email: string, code: string) {
      const normalized = email.trim().toLowerCase();
      const item = data.verificationCodes.find(
        (v) => v.email.toLowerCase() === normalized && v.code === code && v.expires_at > Date.now()
      );
      return Boolean(item);
    },
    getVerificationCode(email: string) {
      const normalized = email.trim().toLowerCase();
      return data.verificationCodes.find((v) => v.email.toLowerCase() === normalized);
    },
    setVerificationCode(email: string, code: string, expiresAt: number) {
      const normalized = email.trim().toLowerCase();
      data.verificationCodes = data.verificationCodes.filter((v) => v.email.toLowerCase() !== normalized);
      data.verificationCodes.push({ email: normalized, code, expires_at: expiresAt });
      persist();
    },
    validateInvitationCode(code: string) {
      const normalized = code.trim().toUpperCase();
      const item = data.invitationCodes.find((i) => i.code.toUpperCase() === normalized);
      if (!item) return false;
      return item.used_count < item.max_uses;
    },
    useInvitationCode(code: string) {
      this.incrementInvitationCode(code);
    },
    getInvitationCode(code: string) {
      const normalized = code.trim().toUpperCase();
      return data.invitationCodes.find((i) => i.code.toUpperCase() === normalized);
    },
    incrementInvitationCode(code: string) {
      const normalized = code.trim().toUpperCase();
      const item = data.invitationCodes.find((i) => i.code.toUpperCase() === normalized);
      if (item) {
        item.used_count += 1;
        persist();
      }
    },
    createInvitationCode(code: string, createdByOrMaxUses?: string | number, maxUsesArg?: number) {
      const normalized = code.trim().toUpperCase();
      const maxUses = typeof maxUsesArg === 'number' ? maxUsesArg : (typeof createdByOrMaxUses === 'number' ? createdByOrMaxUses : 100);
      data.invitationCodes = data.invitationCodes.filter((i) => i.code.toUpperCase() !== normalized);
      const created: DatabaseInvitationCodeRow = {
        code: normalized,
        max_uses: maxUses,
        used_count: 0,
        created_at: new Date().toISOString(),
      };
      data.invitationCodes.push(created);
      persist();
      return created;
    },
    getInvitationCodes() {
      return data.invitationCodes;
    },
    getAllInvitationCodes() {
      return data.invitationCodes;
    },
    setUserBalance(userId: string, amount: number) {
      const user = data.users.find((u) => u.id === userId);
      if (user) {
        user.usdt_balance = amount;
        user.updated_at = new Date().toISOString();
        persist();
      }
    },
    setUserStatus(userId: string, status: 'active' | 'frozen' | 'suspended') {
      const user = data.users.find((u) => u.id === userId);
      if (user) {
        user.status = status;
        user.updated_at = new Date().toISOString();
        persist();
      }
    },
    updateUserProfile(id: string, updates: Partial<DatabaseUserRow>) {
      const index = data.users.findIndex((u) => u.id === id);
      if (index === -1) return undefined;
      data.users[index] = {
        ...data.users[index],
        ...updates,
        updated_at: new Date().toISOString(),
      };
      persist();
      return data.users[index];
    },
    updateUser(id: string, updates: Partial<DatabaseUserRow>) {
      return this.updateUserProfile(id, updates);
    },
    getAllUsers() {
      return data.users;
    },
    getSupportTickets(userId?: string) {
      if (userId) {
        return data.supportTickets.filter((t) => t.user_id === userId);
      }
      return data.supportTickets;
    },
    createSupportTicket(
      userIdOrTicket: string | DatabaseSupportTicketRow,
      clientIdOrMsgText?: string,
      userName?: string,
      userEmail?: string,
      subject?: string,
      category?: string
    ) {
      let ticket: DatabaseSupportTicketRow;
      if (typeof userIdOrTicket === 'object') {
        ticket = userIdOrTicket;
      } else {
        ticket = {
          id: `tkt-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
          user_id: userIdOrTicket,
          client_id: clientIdOrMsgText || `CL-${userIdOrTicket.substring(0, 6)}`,
          user_name: userName || 'Client',
          user_email: userEmail || '',
          subject: subject || 'Support Request',
          status: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      data.supportTickets.unshift(ticket);
      persist();
      return ticket;
    },
    getSupportMessages(ticketId: string) {
      return data.supportMessages.filter((m) => m.ticket_id === ticketId);
    },
    addSupportMessage(
      ticketIdOrObj: string | DatabaseSupportMessageRow,
      senderId?: string,
      senderName?: string,
      senderRole?: 'trader' | 'admin' | 'client',
      text?: string
    ) {
      let message: DatabaseSupportMessageRow;
      if (typeof ticketIdOrObj === 'object') {
        message = ticketIdOrObj;
      } else {
        message = {
          id: `msg-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
          ticket_id: ticketIdOrObj,
          sender_role: senderRole === 'admin' ? 'admin' : 'client',
          sender_name: senderName || 'User',
          text: text || '',
          created_at: new Date().toISOString(),
        };
      }
      data.supportMessages.push(message);
      const ticket = data.supportTickets.find((t) => t.id === message.ticket_id);
      if (ticket) {
        ticket.updated_at = message.created_at;
        if (message.sender_role === 'admin' && ticket.status === 'open') {
          ticket.status = 'in_progress';
        }
      }
      persist();
      return message;
    },
    updateSupportTicketStatus(ticketId: string, status: 'open' | 'in_progress' | 'resolved') {
      const ticket = data.supportTickets.find((t) => t.id === ticketId);
      if (ticket) {
        ticket.status = status;
        ticket.updated_at = new Date().toISOString();
        persist();
      }
    },
    updateTicketStatus(ticketId: string, status: 'open' | 'in_progress' | 'resolved') {
      this.updateSupportTicketStatus(ticketId, status);
    },

    prepare<TParams extends any[] = any[], TRow = any>(sql: string): Statement<TParams, TRow> {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();

      return {
        get(...params: TParams): TRow | undefined {
          // SELECT * FROM users WHERE email = ?
          if (normalizedSql.includes('FROM users') && normalizedSql.includes('WHERE email =')) {
            const emailParam = String(params[0]).toLowerCase();
            const user = data.users.find((u) => u.email.toLowerCase() === emailParam);
            return user as unknown as TRow | undefined;
          }

          // SELECT * FROM users WHERE id = ?
          if (normalizedSql.includes('FROM users') && normalizedSql.includes('WHERE id =')) {
            const idParam = String(params[0]);
            const user = data.users.find((u) => u.id === idParam);
            return user as unknown as TRow | undefined;
          }

          // SELECT users.*, sessions.expires_at AS expires_at FROM sessions INNER JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?
          if (normalizedSql.includes('FROM sessions') && normalizedSql.includes('INNER JOIN users')) {
            const tokenHash = String(params[0]);
            const now = String(params[1]);
            const session = data.sessions.find(
              (s) => s.token_hash === tokenHash && s.expires_at > now
            );
            if (!session) return undefined;
            const user = data.users.find((u) => u.id === session.user_id);
            if (!user) return undefined;
            return {
              ...user,
              expires_at: session.expires_at,
            } as unknown as TRow;
          }

          return undefined;
        },

        all(...params: TParams): TRow[] {
          if (normalizedSql.includes('FROM users')) {
            return data.users as unknown as TRow[];
          }
          if (normalizedSql.includes('FROM sessions')) {
            return data.sessions as unknown as TRow[];
          }
          return [];
        },

        run(...params: TParams): { changes: number } {
          let changes = 0;

          // DELETE FROM sessions WHERE expires_at <= ?
          if (normalizedSql.includes('DELETE FROM sessions') && normalizedSql.includes('expires_at <=')) {
            const cutoff = String(params[0]);
            const prevLen = data.sessions.length;
            data.sessions = data.sessions.filter((s) => s.expires_at > cutoff);
            changes = prevLen - data.sessions.length;
            persist();
            return { changes };
          }

          // DELETE FROM sessions WHERE token_hash = ?
          if (normalizedSql.includes('DELETE FROM sessions') && normalizedSql.includes('token_hash =')) {
            const tokenHash = String(params[0]);
            const prevLen = data.sessions.length;
            data.sessions = data.sessions.filter((s) => s.token_hash !== tokenHash);
            changes = prevLen - data.sessions.length;
            persist();
            return { changes };
          }

          // INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
          if (normalizedSql.includes('INSERT INTO sessions')) {
            const [id, user_id, token_hash, expires_at, created_at, updated_at] = params as unknown as [
              string,
              string,
              string,
              string,
              string,
              string
            ];
            data.sessions.push({ id, user_id, token_hash, expires_at, created_at, updated_at });
            changes = 1;
            persist();
            return { changes };
          }

          // INSERT INTO users
          if (normalizedSql.includes('INSERT INTO users')) {
            let id: string, name: string, email: string, password_hash: string, role: 'trader' | 'admin', created_at: string, updated_at: string;
            let client_id: string | undefined;
            let invitation_code: string | undefined;
            let my_referral_code: string | undefined;

            if (params.length === 9) {
              [id, client_id, name, email, password_hash, invitation_code, my_referral_code, created_at, updated_at] = params as any;
              role = normalizedSql.includes("'admin'") ? 'admin' : 'trader';
            } else if (params.length === 7 && normalizedSql.includes('client_id')) {
              [id, client_id, name, email, password_hash, created_at, updated_at] = params as any;
              role = normalizedSql.includes("'admin'") ? 'admin' : 'trader';
            } else if (params.length === 7) {
              [id, name, email, password_hash, role, created_at, updated_at] = params as any;
            } else {
              [id, name, email, password_hash, created_at, updated_at] = params as any;
              role = normalizedSql.includes("'admin'") ? 'admin' : 'trader';
            }

            const isTrader = role === 'trader';
            if (!client_id) {
              client_id = isTrader ? `CL-${Math.floor(100000 + Math.random() * 900000)}` : 'ADM-001';
            }
            if (!my_referral_code) {
              my_referral_code = isTrader ? `REF-${name.slice(0, 3).toUpperCase()}${Math.floor(100 + Math.random() * 900)}` : 'ADMIN-REF';
            }

            data.users.push({
              id,
              name,
              email,
              password_hash,
              role,
              phone: '',
              avatar: isTrader ? 'avatar-1' : 'avatar-admin',
              client_id,
              invitation_code: invitation_code || '',
              my_referral_code,
              status: 'active',
              two_factor_enabled: false,
              kyc_status: isTrader ? 'unverified' : 'verified',
              usdt_balance: 0,
              crypto_assets: {},
              created_at,
              updated_at,
            });
            changes = 1;
            persist();
            return { changes };
          }

          return { changes: 0 };
        },
      };
    },
  };

  return dbInstance;
};
