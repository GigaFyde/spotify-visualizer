import { join } from 'path';
import { mkdirSync, readdirSync, unlinkSync, readFileSync } from 'fs';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  createdAt: number;
  lastActivity: number;
}

const SESSIONS_DIR = Bun.env.SESSIONS_DIR || join(import.meta.dir, '../../.sessions');

export function ensureDir(): void {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionPath(sessionId: string): string {
  return join(SESSIONS_DIR, `${sessionId}.json`);
}

export async function saveSession(sessionId: string, tokens: SessionTokens): Promise<void> {
  ensureDir();
  await Bun.write(sessionPath(sessionId), JSON.stringify(tokens));
}

export function loadSession(sessionId: string): SessionTokens | null {
  try {
    const text = readFileSync(sessionPath(sessionId), 'utf-8');
    return JSON.parse(text) as SessionTokens;
  } catch {
    return null;
  }
}

export function deleteSession(sessionId: string): void {
  try {
    unlinkSync(sessionPath(sessionId));
  } catch {
    // File may not exist
  }
}

export function listSessions(): string[] {
  ensureDir();
  try {
    return readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  } catch {
    return [];
  }
}
