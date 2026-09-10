import fs from 'node:fs';
import path from 'node:path';

export interface DatabaseUserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'trader' | 'admin';
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
}

interface StoredData {
  users: DatabaseUserRow[];
  sessions: DatabaseSessionRow[];
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

  let data: StoredData = { users: [], sessions: [] };

  if (!isInMemory && fs.existsSync(storageFile)) {
    try {
      const content = fs.readFileSync(storageFile, 'utf-8');
      data = JSON.parse(content);
    } catch {
      data = { users: [], sessions: [] };
    }
  }

  const persist = () => {
    if (!isInMemory) {
      fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), 'utf-8');
    }
  };

  return {
    pragma(_sql: string) {},
    exec(_sql: string) {},
    close() {
      persist();
    },
    prepare<TParams extends any[] = any[], TRow = any>(sql: string): Statement<TParams, TRow> {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();

      return {
        get(...params: TParams): TRow | undefined {
          // SELECT * FROM users WHERE email = ?
          // SELECT email, password_hash FROM users WHERE email = ?
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

          // INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          if (normalizedSql.includes('INSERT INTO users')) {
            let id: string, name: string, email: string, password_hash: string, role: 'trader' | 'admin', created_at: string, updated_at: string;
            if (normalizedSql.includes("'trader'")) {
              [id, name, email, password_hash, created_at, updated_at] = params as any;
              role = 'trader';
            } else if (normalizedSql.includes("'admin'")) {
              [id, name, email, password_hash, created_at, updated_at] = params as any;
              role = 'admin';
            } else {
              [id, name, email, password_hash, role, created_at, updated_at] = params as any;
            }
            data.users.push({ id, name, email, password_hash, role, created_at, updated_at });
            changes = 1;
            persist();
            return { changes };
          }

          return { changes: 0 };
        },
      };
    },
  };
};
