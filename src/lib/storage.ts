import { openDB, IDBPDatabase } from 'idb';
import type { ParsedMessage } from './chatParser';

const DB_NAME = 'chatassist';
const DB_VERSION = 1;

interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  meParticipant: string;
  otherParticipant: string;
  messageSummary?: string;
  styleProfile?: string;
}

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('sessionId', 'sessionId');
      }
      if (!db.objectStoreNames.contains('newMessages')) {
        const newStore = db.createObjectStore('newMessages', { keyPath: 'id' });
        newStore.createIndex('sessionId', 'sessionId');
      }
    },
  });
}

export async function saveSession(session: ChatSession): Promise<void> {
  const db = await getDB();
  await db.put('sessions', session);
}

export async function getSession(id: string): Promise<ChatSession | undefined> {
  const db = await getDB();
  return db.get('sessions', id);
}

export async function getAllSessions(): Promise<ChatSession[]> {
  const db = await getDB();
  return db.getAll('sessions');
}

export async function saveMessages(sessionId: string, messages: ParsedMessage[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('messages', 'readwrite');
  for (const msg of messages) {
    await tx.store.put({ ...msg, sessionId, timestamp: msg.timestamp.toISOString() });
  }
  await tx.done;
}

export async function getMessages(sessionId: string): Promise<ParsedMessage[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('messages', 'sessionId', sessionId);
  return all.map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export async function saveNewMessage(sessionId: string, msg: ParsedMessage): Promise<void> {
  const db = await getDB();
  await db.put('newMessages', { ...msg, sessionId, timestamp: msg.timestamp.toISOString() });
}

export async function getNewMessages(sessionId: string): Promise<ParsedMessage[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('newMessages', 'sessionId', sessionId);
  return all.map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export async function deleteAllData(): Promise<void> {
  const db = await getDB();
  const tx1 = db.transaction('sessions', 'readwrite');
  await tx1.store.clear();
  await tx1.done;
  const tx2 = db.transaction('messages', 'readwrite');
  await tx2.store.clear();
  await tx2.done;
  const tx3 = db.transaction('newMessages', 'readwrite');
  await tx3.store.clear();
  await tx3.done;
}

export async function updateSessionSummary(sessionId: string, summary: string, styleProfile: string): Promise<void> {
  const db = await getDB();
  const session = await db.get('sessions', sessionId);
  if (session) {
    session.messageSummary = summary;
    session.styleProfile = styleProfile;
    await db.put('sessions', session);
  }
}
