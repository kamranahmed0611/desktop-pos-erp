/**
 * Universal SQLite Client for pos-core
 * Directly executes on 'grocery_master.db' via:
 * 1. Native better-sqlite3 in Electron / Node
 * 2. SQLite HTTP Bridge (port 3001) in Browser Dev
 */

let nativeDb: any = null;

function isElectron(): boolean {
  if (typeof window === 'undefined') return true;
  return Boolean(
    (window as any).electronAPI ||
    (window as any).process?.type === 'renderer' ||
    navigator.userAgent.includes('Electron')
  );
}

function getNativeDb(): any {
  if (typeof window !== 'undefined') {
    return null;
  }
  if (nativeDb) return nativeDb;
  try {
    const req = typeof require !== 'undefined' ? require : null;
    if (!req) return null;
    const Database = req('better-sqlite3');
    const path = req('path');
    const dbPath = process.env.POS_DB_PATH || path.join(process.cwd(), 'grocery_master.db');
    nativeDb = new Database(dbPath);
    nativeDb.pragma('journal_mode = WAL');
    nativeDb.pragma('synchronous = FULL');
    return nativeDb;
  } catch (e) {
    return null;
  }
}

const API_BASE = 'http://localhost:3001/api/sql';

export const sqlDb = {
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    // 1. Direct Native Electron IPC (Fastest, zero port conflict)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.dbQuery) {
      const res = await (window as any).electronAPI.dbQuery({ sql, params });
      if (!res.success) throw new Error(res.error || 'Electron IPC query failed');
      return res.rows as T[];
    }

    const native = getNativeDb();
    if (native) {
      try {
        return native.prepare(sql).all(...params) as T[];
      } catch (err: any) {
        console.error('[SQLite Native Query Error]', err.message, sql);
        throw err;
      }
    }

    // 2. HTTP Bridge Fallback (Browser Dev)
    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.rows as T[];
    } catch (err: any) {
      console.error('[SQLite HTTP Query Error]', err.message, sql);
      throw err;
    }
  },

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    // 1. Direct Native Electron IPC (Fastest, zero port conflict)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.dbGet) {
      const res = await (window as any).electronAPI.dbGet({ sql, params });
      if (!res.success) throw new Error(res.error || 'Electron IPC get failed');
      return (res.row as T) || null;
    }

    const native = getNativeDb();
    if (native) {
      try {
        const row = native.prepare(sql).get(...params);
        return (row as T) || null;
      } catch (err: any) {
        console.error('[SQLite Native Get Error]', err.message, sql);
        throw err;
      }
    }

    // 2. HTTP Bridge Fallback (Browser Dev)
    try {
      const res = await fetch(`${API_BASE}/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return (data.row as T) || null;
    } catch (err: any) {
      console.error('[SQLite HTTP Get Error]', err.message, sql);
      throw err;
    }
  },

  async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: any }> {
    // 1. Direct Native Electron IPC (Fastest, zero port conflict)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.dbExecute) {
      const res = await (window as any).electronAPI.dbExecute({ sql, params });
      if (!res.success) throw new Error(res.error || 'Electron IPC execute failed');
      return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
    }

    const native = getNativeDb();
    if (native) {
      try {
        const result = native.prepare(sql).run(...params);
        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
      } catch (err: any) {
        console.error('[SQLite Native Execute Error]', err.message, sql);
        throw err;
      }
    }

    // 2. HTTP Bridge Fallback (Browser Dev)
    try {
      const res = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return { changes: data.changes, lastInsertRowid: data.lastInsertRowid };
    } catch (err: any) {
      console.error('[SQLite HTTP Execute Error]', err.message, sql);
      throw err;
    }
  },

  async transaction(statements: { sql: string; params?: any[] }[]): Promise<any[]> {
    // 1. Direct Native Electron IPC (Fastest, zero port conflict)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.dbTransaction) {
      const res = await (window as any).electronAPI.dbTransaction({ statements });
      if (!res.success) throw new Error(res.error || 'Electron IPC transaction failed');
      return res.results;
    }

    const native = getNativeDb();
    if (native) {
      const txn = native.transaction(() => {
        const results = [];
        for (const s of statements) {
          results.push(native.prepare(s.sql).run(...(s.params || [])));
        }
        return results;
      });
      return txn();
    }

    // 2. HTTP Bridge Fallback (Browser Dev)
    try {
      const res = await fetch(`${API_BASE}/transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statements })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.results;
    } catch (err: any) {
      console.error('[SQLite HTTP Transaction Error]', err.message);
      throw err;
    }
  },

  async backup(destinationPath?: string): Promise<{ success: boolean; backupPath?: string; error?: string }> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.dbBackup) {
      return await (window as any).electronAPI.dbBackup({ destinationPath });
    }
    return { success: false, error: 'Database backup only supported in Electron environment' };
  },

  async vacuum(): Promise<{ success: boolean; error?: string }> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.dbVacuum) {
      return await (window as any).electronAPI.dbVacuum();
    }
    return { success: false, error: 'VACUUM only supported in Electron environment' };
  },

  async info(): Promise<{ connected: boolean; path?: string; sizeMb?: string; productCount?: number; backupCount?: number }> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.dbInfo) {
      return await (window as any).electronAPI.dbInfo();
    }
    return { connected: true, path: 'HTTP Mode', sizeMb: 'N/A' };
  }
};
