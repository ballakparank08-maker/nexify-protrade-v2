import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import request from 'supertest';
import { bootstrapAdminUser } from '../src/auth.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';

const createTestContext = () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexify-auth-'));
  const databasePath = path.join(tempDir, 'auth.sqlite');
  const config = loadConfig({
    nodeEnv: 'test',
    authSecret: 'test-auth-secret',
    databasePath,
    frontendOrigins: ['http://localhost:3000'],
    cookieSecure: false,
    cookieSameSite: 'lax',
    sessionTtlHours: 24,
    cookieName: 'nexify_session',
  });
  const db = openDatabase(databasePath);
  const app = createApp({ db, config });

  return {
    app,
    db,
    cleanup() {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
};

test('register creates a hashed-password user and active session', async () => {
  const context = createTestContext();
  try {
    const agent = request.agent(context.app);
    const registerResponse = await agent
      .post('/api/auth/register')
      .send({ name: 'Alice Trader', email: 'Alice@example.com', password: 'Password123!' });

    assert.equal(registerResponse.status, 201);
    assert.equal(registerResponse.body.user.email, 'alice@example.com');
    assert.equal(registerResponse.body.user.role, 'trader');

    const row = context.db.prepare('SELECT email, password_hash FROM users WHERE email = ?').get('alice@example.com') as { email: string; password_hash: string };
    assert.equal(row.email, 'alice@example.com');
    assert.notEqual(row.password_hash, 'Password123!');
    assert.match(row.password_hash, /^\$2[aby]\$/);

    const meResponse = await agent.get('/api/auth/me');
    assert.equal(meResponse.status, 200);
    assert.equal(meResponse.body.user.email, 'alice@example.com');
  } finally {
    context.cleanup();
  }
});

test('duplicate registration is rejected', async () => {
  const context = createTestContext();
  try {
    const agent = request.agent(context.app);
    await agent
      .post('/api/auth/register')
      .send({ name: 'Alice Trader', email: 'alice@example.com', password: 'Password123!' })
      .expect(201);

    const duplicateResponse = await request(context.app)
      .post('/api/auth/register')
      .send({ name: 'Alice Trader', email: 'ALICE@example.com', password: 'Password123!' });

    assert.equal(duplicateResponse.status, 409);
    assert.match(duplicateResponse.body.message, /already exists/i);
  } finally {
    context.cleanup();
  }
});

test('login succeeds with valid credentials and fails generically with invalid credentials', async () => {
  const context = createTestContext();
  try {
    await request(context.app)
      .post('/api/auth/register')
      .send({ name: 'Bob Trader', email: 'bob@example.com', password: 'Password123!' })
      .expect(201);

    const successAgent = request.agent(context.app);
    const loginResponse = await successAgent
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'Password123!' });

    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.body.user.email, 'bob@example.com');

    const failureResponse = await request(context.app)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'wrong-password' });

    assert.equal(failureResponse.status, 401);
    assert.equal(failureResponse.body.message, 'Invalid email or password.');
  } finally {
    context.cleanup();
  }
});

test('logout clears the server-side session and blocks future protected requests', async () => {
  const context = createTestContext();
  try {
    const agent = request.agent(context.app);
    await agent
      .post('/api/auth/register')
      .send({ name: 'Carol Trader', email: 'carol@example.com', password: 'Password123!' })
      .expect(201);

    await agent.get('/api/auth/me').expect(200);
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
  } finally {
    context.cleanup();
  }
});

test('admin verification is enforced by backend role checks', async () => {
  const context = createTestContext();
  try {
    bootstrapAdminUser(context.db, {
      name: 'Root Admin',
      email: 'admin@nexifyprotrade.test',
      password: 'Password123!',
    });

    const traderAgent = request.agent(context.app);
    await traderAgent
      .post('/api/auth/register')
      .send({ name: 'Dana Trader', email: 'dana@example.com', password: 'Password123!' })
      .expect(201);
    await traderAgent.get('/api/auth/admin/verify').expect(403);

    const adminAgent = request.agent(context.app);
    await adminAgent
      .post('/api/auth/login')
      .send({ email: 'admin@nexifyprotrade.test', password: 'Password123!' })
      .expect(200);

    const verifyResponse = await adminAgent.get('/api/auth/admin/verify');
    assert.equal(verifyResponse.status, 200);
    assert.equal(verifyResponse.body.authorized, true);
    assert.equal(verifyResponse.body.user.role, 'admin');
  } finally {
    context.cleanup();
  }
});

test('new user receives 0 balance, fresh client ID, and email code verification works', async () => {
  const context = createTestContext();
  try {
    const agent = request.agent(context.app);

    // Send code
    const codeRes = await agent
      .post('/api/auth/send-code')
      .send({ email: 'fresh@example.com' });
    assert.equal(codeRes.status, 200);
    const code = codeRes.body.code;
    assert.ok(code && code.length === 6);

    // Register with verification code
    const regRes = await agent
      .post('/api/auth/register')
      .send({
        name: 'Fresh Trader',
        email: 'fresh@example.com',
        password: 'Password123!',
        verificationCode: code,
      });

    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.user.usdtBalance, 0);
    assert.ok(regRes.body.user.clientId.startsWith('CL-'));

    // Admin can view clients and adjust balance
    bootstrapAdminUser(context.db, {
      name: 'Admin Boss',
      email: 'boss@nexifyprotrade.test',
      password: 'Password123!',
    });
    const adminAgent = request.agent(context.app);
    await adminAgent
      .post('/api/auth/login')
      .send({ email: 'boss@nexifyprotrade.test', password: 'Password123!' });

    const clientsRes = await adminAgent.get('/api/admin/clients');
    assert.equal(clientsRes.status, 200);
    assert.ok(clientsRes.body.clients.length >= 2);

    const balRes = await adminAgent
      .post('/api/admin/clients/balance')
      .send({ userId: regRes.body.user.id, amount: 500 });
    assert.equal(balRes.status, 200);
    assert.equal(balRes.body.user.usdtBalance, 500);
  } finally {
    context.cleanup();
  }
});

test('customer support tickets and messaging works', async () => {
  const context = createTestContext();
  try {
    const clientAgent = request.agent(context.app);
    const reg = await clientAgent
      .post('/api/auth/register')
      .send({ name: 'Support Tester', email: 'supportuser@example.com', password: 'Password123!' });
    assert.equal(reg.status, 201);

    // Create ticket
    const ticketRes = await clientAgent
      .post('/api/support/tickets')
      .send({ subject: 'Need Help with Deposit', category: 'Financial', message: 'How do I deposit?' });
    assert.equal(ticketRes.status, 201);
    const ticketId = ticketRes.body.ticket.id;
    assert.ok(ticketId);

    // Fetch messages
    const msgsRes = await clientAgent.get(`/api/support/tickets/${ticketId}/messages`);
    assert.equal(msgsRes.status, 200);
    assert.equal(msgsRes.body.messages.length, 1);
    assert.equal(msgsRes.body.messages[0].text, 'How do I deposit?');
  } finally {
    context.cleanup();
  }
});

