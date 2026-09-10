import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import type { CookieOptions } from 'express';
import {
  bootstrapAdminUser,
  changeUserPassword,
  deleteSession,
  findUserById,
  findUserBySessionToken,
  loginUser,
  mapPublicUser,
  registerUser,
  sendVerificationCode,
  updateUserProfile,
  type PublicUser,
} from './auth.js';
import type { AuthConfig } from './config.js';
import type { DatabaseUserRow, SqliteDatabase } from './database.js';

interface AuthenticatedRequest extends Request {
  authUser?: PublicUser;
  sessionToken?: string;
}

export interface AppDependencies {
  db: SqliteDatabase;
  config: AuthConfig;
}

const buildCookieOptions = (config: AuthConfig): CookieOptions => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: config.cookieSameSite,
  maxAge: config.sessionTtlHours * 60 * 60 * 1000,
  path: '/',
});

const buildCorsMiddleware = (config: AuthConfig) => cors({
  origin: true,
  credentials: true,
});

const requireAuth = (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
  if (!request.authUser) {
    response.status(401).json({ message: 'Authentication required.' });
    return;
  }
  next();
};

const requireRole = (role: PublicUser['role']) => (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
  if (!request.authUser) {
    response.status(401).json({ message: 'Authentication required.' });
    return;
  }

  if (request.authUser.role !== role) {
    response.status(403).json({ message: 'You do not have permission to access this resource.' });
    return;
  }

  next();
};

export const createApp = ({ db, config }: AppDependencies) => {
  const app = express();
  const cookieOptions = buildCookieOptions(config);
  const authAttemptLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.nodeEnv === 'production' ? 10 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication attempts. Please try again later.' },
  });
  const clearCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
  };

  app.use(buildCorsMiddleware(config));
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/auth', (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use((request: AuthenticatedRequest, response, next) => {
    const sessionToken = request.cookies?.[config.cookieName];
    if (!sessionToken) {
      next();
      return;
    }

    const user = findUserBySessionToken(db, config, sessionToken);
    if (!user) {
      response.clearCookie(config.cookieName, clearCookieOptions);
      next();
      return;
    }

    request.authUser = user;
    request.sessionToken = sessionToken;
    next();
  });

  app.get('/', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'Nexify ProTrade Auth API',
      frontendUrl: 'http://localhost:3000',
    });
  });

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
  });

  app.post('/api/auth/send-code', (request, response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email : '';
    const result = sendVerificationCode(db, email);
    if ('error' in result) {
      response.status(result.status).json({ message: result.error });
      return;
    }
    response.status(result.status).json(result.data);
  });

  app.post('/api/auth/register', authAttemptLimiter, (request, response) => {
    const result = registerUser(db, config, request.body ?? {});
    if ('error' in result) {
      response.status(result.status).json({ message: result.error });
      return;
    }

    response.cookie(config.cookieName, result.data.sessionToken, cookieOptions);
    response.status(result.status).json({ user: result.data.user });
  });

  app.post('/api/auth/login', authAttemptLimiter, (request, response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';

    if (!email.trim() || !password) {
      response.status(400).json({ message: 'Email and password are required.' });
      return;
    }

    const result = loginUser(db, config, { email, password });
    if ('error' in result) {
      response.status(result.status).json({ message: result.error });
      return;
    }

    response.cookie(config.cookieName, result.data.sessionToken, cookieOptions);
    response.status(result.status).json({ user: result.data.user });
  });

  app.get('/api/auth/me', requireAuth, (request: AuthenticatedRequest, response) => {
    response.json({ user: request.authUser });
  });

  app.post('/api/auth/profile/update', requireAuth, (request: AuthenticatedRequest, response) => {
    const result = updateUserProfile(db, request.authUser!.id, request.body ?? {});
    if ('error' in result) {
      response.status(result.status).json({ message: result.error });
      return;
    }
    response.status(result.status).json(result.data);
  });

  app.post('/api/auth/profile/change-password', requireAuth, (request: AuthenticatedRequest, response) => {
    const { currentPassword, newPassword } = request.body ?? {};
    if (!currentPassword || !newPassword) {
      response.status(400).json({ message: 'Current password and new password are required.' });
      return;
    }
    const result = changeUserPassword(db, request.authUser!.id, currentPassword, newPassword);
    if ('error' in result) {
      response.status(result.status).json({ message: result.error });
      return;
    }
    response.status(result.status).json(result.data);
  });

  app.post('/api/auth/logout', (request: AuthenticatedRequest, response) => {
    if (request.sessionToken) {
      deleteSession(db, config, request.sessionToken);
    }
    response.clearCookie(config.cookieName, clearCookieOptions);
    response.json({ success: true });
  });

  app.get('/api/auth/admin/verify', requireAuth, requireRole('admin'), (request: AuthenticatedRequest, response) => {
    response.json({ authorized: true, user: request.authUser });
  });

  // Admin Client Management Endpoints
  app.get('/api/admin/clients', requireAuth, requireRole('admin'), (_request, response) => {
    const rows = db.prepare<unknown[], DatabaseUserRow>('SELECT * FROM users ORDER BY created_at DESC').all();
    const clients = rows.map(mapPublicUser);
    response.json({ clients });
  });

  app.post('/api/admin/clients/balance', requireAuth, requireRole('admin'), (request, response) => {
    const { userId, amount } = request.body ?? {};
    if (!userId || typeof amount !== 'number') {
      response.status(400).json({ message: 'User ID and valid numeric balance amount are required.' });
      return;
    }
    db.setUserBalance(userId, amount);
    const updated = findUserById(db, userId);
    if (!updated) {
      response.status(404).json({ message: 'Client not found.' });
      return;
    }
    response.json({ user: mapPublicUser(updated) });
  });

  app.post('/api/admin/clients/status', requireAuth, requireRole('admin'), (request, response) => {
    const { userId, status } = request.body ?? {};
    if (!userId || !['active', 'frozen', 'suspended'].includes(status)) {
      response.status(400).json({ message: 'Valid user ID and status (active, frozen, suspended) are required.' });
      return;
    }
    db.setUserStatus(userId, status);
    const updated = findUserById(db, userId);
    if (!updated) {
      response.status(404).json({ message: 'Client not found.' });
      return;
    }
    response.json({ user: mapPublicUser(updated) });
  });

  // Admin Invitation Codes Endpoints
  app.get('/api/admin/invitation-codes', requireAuth, requireRole('admin'), (_request, response) => {
    const codes = db.getInvitationCodes();
    response.json({ codes });
  });

  app.post('/api/admin/invitation-codes', requireAuth, requireRole('admin'), (request: AuthenticatedRequest, response) => {
    const { code, maxUses } = request.body ?? {};
    if (!code || typeof code !== 'string') {
      response.status(400).json({ message: 'Valid invitation code string is required.' });
      return;
    }
    const created = db.createInvitationCode(code.trim().toUpperCase(), request.authUser!.id, typeof maxUses === 'number' ? maxUses : 100);
    response.json({ code: created });
  });

  // Customer Support Endpoints
  app.get('/api/support/tickets', requireAuth, (request: AuthenticatedRequest, response) => {
    const isUserAdmin = request.authUser?.role === 'admin';
    const tickets = isUserAdmin
      ? db.getSupportTickets()
      : db.getSupportTickets(request.authUser!.id);
    response.json({ tickets });
  });

  app.post('/api/support/tickets', requireAuth, (request: AuthenticatedRequest, response) => {
    const { subject, category, message } = request.body ?? {};
    if (!subject || !message) {
      response.status(400).json({ message: 'Subject and message body are required.' });
      return;
    }
    const ticket = db.createSupportTicket(
      request.authUser!.id,
      request.authUser!.clientId,
      request.authUser!.name,
      request.authUser!.email,
      subject.trim(),
      category || 'General'
    );

    const initialMsg = db.addSupportMessage(
      ticket.id,
      request.authUser!.id,
      request.authUser!.name,
      request.authUser!.role,
      message.trim()
    );

    response.status(201).json({ ticket, message: initialMsg });
  });

  app.get('/api/support/tickets/:ticketId/messages', requireAuth, (request, response) => {
    const { ticketId } = request.params;
    const messages = db.getSupportMessages(ticketId);
    response.json({ messages });
  });

  app.post('/api/support/tickets/:ticketId/messages', requireAuth, (request: AuthenticatedRequest, response) => {
    const { ticketId } = request.params;
    const { message, status } = request.body ?? {};
    if (!message || typeof message !== 'string') {
      response.status(400).json({ message: 'Message content is required.' });
      return;
    }

    const addedMsg = db.addSupportMessage(
      ticketId,
      request.authUser!.id,
      request.authUser!.name,
      request.authUser!.role,
      message.trim()
    );

    if (status && ['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      db.updateTicketStatus(ticketId, status);
    } else if (request.authUser!.role === 'admin') {
      db.updateTicketStatus(ticketId, 'in_progress');
    }

    response.status(201).json({ message: addedMsg });
  });

  const distPath = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (request: Request, response: Response, next: NextFunction) => {
      if (request.path.startsWith('/api')) {
        next();
        return;
      }
      response.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
    response.status(500).json({ message: config.nodeEnv === 'production' ? 'Internal server error.' : error.message });
  });

  if (config.adminBootstrapEmail && config.adminBootstrapName && config.adminBootstrapPassword) {
    bootstrapAdminUser(db, {
      name: config.adminBootstrapName,
      email: config.adminBootstrapEmail,
      password: config.adminBootstrapPassword,
    });
  }

  return app;
};

