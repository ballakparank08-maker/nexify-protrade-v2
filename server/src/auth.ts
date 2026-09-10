import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { AuthConfig } from './config.js';
import type { DatabaseUserRow, SqliteDatabase } from './database.js';

export interface PublicUser {
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

export interface AuthSuccess {
  user: PublicUser;
  sessionToken: string;
}

export interface AdminBootstrapInput {
  name: string;
  email: string;
  password: string;
}

const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_ROUNDS = 12;

export const mapPublicUser = (row: DatabaseUserRow): PublicUser => ({
  id: row.id,
  clientId: row.client_id || `CL-${row.id.substring(0, 6).toUpperCase()}`,
  name: row.name,
  email: row.email,
  phone: row.phone || '',
  avatar: row.avatar || 'avatar-1',
  role: row.role as 'trader' | 'admin',
  status: (row.status as 'active' | 'frozen' | 'suspended') || 'active',
  kycStatus: (row.kyc_status as 'unverified' | 'pending' | 'verified' | 'rejected') || 'unverified',
  twoFactorEnabled: Boolean(row.two_factor_enabled),
  invitationCode: row.invitation_code || '',
  myReferralCode: row.my_referral_code || `REF-${row.id.substring(0, 6).toUpperCase()}`,
  usdtBalance: row.usdt_balance ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const hashSessionToken = (authSecret: string, token: string) => (
  crypto.createHmac('sha256', authSecret).update(token).digest('hex')
);

const createPasswordHash = (password: string) => bcrypt.hashSync(password, BCRYPT_ROUNDS);

const validateName = (name: string) => {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return 'Please enter your full name (at least 2 characters).';
  }
  return null;
};

const validatePassword = (password: string) => {
  if (password.trim().length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }
  return null;
};

const validateEmail = (email: string) => {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.indexOf('@');
  const hasSingleAt = atIndex > 0 && atIndex === normalized.lastIndexOf('@');
  const localPart = hasSingleAt ? normalized.slice(0, atIndex) : '';
  const domainPart = hasSingleAt ? normalized.slice(atIndex + 1) : '';
  const isValidDomain =
    domainPart.length >= 3 &&
    domainPart.includes('.') &&
    !domainPart.startsWith('.') &&
    !domainPart.endsWith('.') &&
    !domainPart.includes('..');

  if (!localPart || !isValidDomain || normalized.includes(' ')) {
    return 'Please enter a valid email address.';
  }
  return null;
};

const createSession = (db: SqliteDatabase, config: AuthConfig, userId: string) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.sessionTtlHours * 60 * 60 * 1000).toISOString();
  const sessionToken = crypto.randomBytes(48).toString('base64url');
  const tokenHash = hashSessionToken(config.authSecret, sessionToken);

  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), userId, tokenHash, expiresAt, now.toISOString(), now.toISOString());

  return sessionToken;
};

export const sendVerificationCode = (db: SqliteDatabase, email: string) => {
  const emailError = validateEmail(email);
  if (emailError) {
    return { error: emailError, status: 400 as const };
  }

  const normalizedEmail = normalizeEmail(email);
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  if (typeof db.saveEmailCode === 'function') {
    db.saveEmailCode(normalizedEmail, code);
  }

  console.log(`[VERIFICATION CODE] Sent code ${code} to ${normalizedEmail}`);

  return {
    status: 200 as const,
    data: {
      message: 'Verification code sent successfully to email.',
      code, // returned for display in demo / auto-fill
    },
  };
};

export const findUserByEmail = (db: SqliteDatabase, email: string) => {
  const normalizedEmail = normalizeEmail(email);
  return db.prepare<unknown[], DatabaseUserRow>('SELECT * FROM users WHERE email = ?').get(normalizedEmail) || null;
};

export const findUserById = (db: SqliteDatabase, id: string) => {
  return db.prepare<unknown[], DatabaseUserRow>('SELECT * FROM users WHERE id = ?').get(id) || null;
};

export const findUserBySessionToken = (db: SqliteDatabase, config: AuthConfig, sessionToken: string) => {
  const tokenHash = hashSessionToken(config.authSecret, sessionToken);
  const now = new Date().toISOString();
  const row = db.prepare<unknown[], DatabaseUserRow & { expires_at: string }>(`
    SELECT users.*,
           sessions.expires_at AS expires_at
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash, now);

  return row ? mapPublicUser(row) : null;
};

export const deleteSession = (db: SqliteDatabase, config: AuthConfig, sessionToken: string) => {
  const tokenHash = hashSessionToken(config.authSecret, sessionToken);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
};

export const registerUser = (
  db: SqliteDatabase,
  config: AuthConfig,
  input: {
    name: string;
    email: string;
    password: string;
    verificationCode?: string;
    invitationCode?: string;
  }
) => {
  const nameError = validateName(input.name);
  if (nameError) {
    return { error: nameError, status: 400 as const };
  }

  const emailError = validateEmail(input.email);
  if (emailError) {
    return { error: emailError, status: 400 as const };
  }

  const passwordError = validatePassword(input.password);
  if (passwordError) {
    return { error: passwordError, status: 400 as const };
  }

  const normalizedEmail = normalizeEmail(input.email);
  
  // Validate email verification code if provided or required
  if (input.verificationCode) {
    if (typeof db.verifyEmailCode === 'function') {
      const isValidCode = db.verifyEmailCode(normalizedEmail, input.verificationCode);
      if (!isValidCode) {
        return { error: 'Invalid or expired email verification code.', status: 400 as const };
      }
    }
  }

  // Validate invitation code if provided
  if (input.invitationCode && input.invitationCode.trim()) {
    if (typeof db.validateInvitationCode === 'function') {
      const isValidInvite = db.validateInvitationCode(input.invitationCode.trim());
      if (!isValidInvite) {
        return { error: 'Invalid or expired invitation code.', status: 400 as const };
      }
    }
  }

  if (findUserByEmail(db, normalizedEmail)) {
    return { error: 'An account with that email already exists.', status: 409 as const };
  }

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const clientId = `CL-${Math.floor(100000 + Math.random() * 900000)}`;
  const myReferralCode = `REF-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  db.prepare(`
    INSERT INTO users (
      id, client_id, name, email, password_hash, role, phone, avatar, status, kyc_status,
      two_factor_enabled, invitation_code, my_referral_code, usdt_balance, crypto_assets,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'trader', '', 'avatar-1', 'active', 'unverified', 0, ?, ?, 0, '{}', ?, ?)
  `).run(
    userId,
    clientId,
    input.name.trim(),
    normalizedEmail,
    createPasswordHash(input.password),
    input.invitationCode?.trim() || '',
    myReferralCode,
    now,
    now
  );

  // Consume invitation code if present
  if (input.invitationCode && typeof db.useInvitationCode === 'function') {
    db.useInvitationCode(input.invitationCode.trim());
  }

  const createdUser = findUserById(db, userId);
  if (!createdUser) {
    throw new Error('Failed to create user.');
  }

  return {
    status: 201 as const,
    data: {
      user: mapPublicUser(createdUser),
      sessionToken: createSession(db, config, createdUser.id),
    },
  };
};

export const loginUser = (db: SqliteDatabase, config: AuthConfig, input: { email: string; password: string }) => {
  const normalizedEmail = normalizeEmail(input.email);
  const user = findUserByEmail(db, normalizedEmail);
  const invalidCredentials = { error: 'Invalid email or password.', status: 401 as const };

  if (!user) {
    return invalidCredentials;
  }

  if (user.status === 'suspended') {
    return { error: 'Account has been suspended. Please contact support.', status: 403 as const };
  }

  const matches = bcrypt.compareSync(input.password, user.password_hash);
  if (!matches) {
    return invalidCredentials;
  }

  return {
    status: 200 as const,
    data: {
      user: mapPublicUser(user),
      sessionToken: createSession(db, config, user.id),
    },
  };
};

export const updateUserProfile = (
  db: SqliteDatabase,
  userId: string,
  updates: { name?: string; phone?: string; avatar?: string }
) => {
  const user = findUserById(db, userId);
  if (!user) {
    return { error: 'User not found.', status: 404 as const };
  }

  if (updates.name !== undefined) {
    const nameError = validateName(updates.name);
    if (nameError) return { error: nameError, status: 400 as const };
  }

  if (typeof db.updateUserProfile === 'function') {
    db.updateUserProfile(userId, updates);
  }

  const updated = findUserById(db, userId);
  return {
    status: 200 as const,
    data: { user: mapPublicUser(updated!) },
  };
};

export const changeUserPassword = (
  db: SqliteDatabase,
  userId: string,
  currentPassword: string,
  newPassword: string
) => {
  const user = findUserById(db, userId);
  if (!user) {
    return { error: 'User not found.', status: 404 as const };
  }

  const matches = bcrypt.compareSync(currentPassword, user.password_hash);
  if (!matches) {
    return { error: 'Current password is incorrect.', status: 400 as const };
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return { error: passwordError, status: 400 as const };
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    createPasswordHash(newPassword),
    now,
    userId
  );

  return { status: 200 as const, data: { message: 'Password updated successfully.' } };
};

export const bootstrapAdminUser = (db: SqliteDatabase, input: AdminBootstrapInput) => {
  const nameError = validateName(input.name);
  const emailError = validateEmail(input.email);
  const passwordError = validatePassword(input.password);

  if (nameError || emailError || passwordError) {
    throw new Error(nameError || emailError || passwordError || 'Invalid admin bootstrap input.');
  }

  const normalizedEmail = normalizeEmail(input.email);
  const existing = findUserByEmail(db, normalizedEmail);
  if (existing) {
    if (existing.role !== 'admin') {
      throw new Error('The bootstrap email is already assigned to a non-admin account.');
    }
    return { created: false, user: mapPublicUser(existing) };
  }

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const clientId = `ADM-${Math.floor(100000 + Math.random() * 900000)}`;

  db.prepare(`
    INSERT INTO users (
      id, client_id, name, email, password_hash, role, phone, avatar, status, kyc_status,
      two_factor_enabled, invitation_code, my_referral_code, usdt_balance, crypto_assets,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'admin', '', 'avatar-admin', 'active', 'verified', 0, '', 'ADMIN-REF', 1000000, '{}', ?, ?)
  `).run(userId, clientId, input.name.trim(), normalizedEmail, createPasswordHash(input.password), now, now);

  const createdUser = findUserById(db, userId);
  if (!createdUser) {
    throw new Error('Failed to create bootstrap admin account.');
  }

  return { created: true, user: mapPublicUser(createdUser) };
};

