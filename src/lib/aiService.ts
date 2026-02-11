import { supabase } from '@/integrations/supabase/client';
import type { ParsedMessage } from './chatParser';

export async function buildMemoryAndStyle(
  messages: ParsedMessage[],
  meName: string,
  otherName: string
): Promise<{ summary: string; partnerStyle: string; styleProfile: string }> {
  const myMessages = messages.filter(m => m.sender === meName);
  const partnerMessages = messages.filter(m => m.sender === otherName);
  
  const sampleMessages = messages.slice(-300).map(m => {
    const role = m.sender === meName ? meName : otherName;
    return `${role}: ${m.text}`;
  }).join('\n');

  const myTexts = myMessages.slice(-150).map(m => m.text).join('\n');
  const partnerTexts = partnerMessages.slice(-150).map(m => m.text).join('\n');

  const { data, error } = await supabase.functions.invoke('chat-suggest', {
    body: {
      action: 'build-memory',
      sampleMessages,
      myTexts,
      partnerTexts,
      meName,
      otherName,
    },
  });

  if (error) throw new Error(error.message || 'Failed to build memory');
  return data as { summary: string; partnerStyle: string; styleProfile: string };
}

export interface StreamChatOptions {
  message: string;
  chatHistory: { role: string; content: string }[];
  recentContext: string;
  memorySummary: string;
  partnerStyle: string;
  meName: string;
  otherName: string;
  timezone?: string;
  onDelta: (text: string) => void;
  onDone: () => void;
}

export async function streamPartnerReply(opts: StreamChatOptions) {
  const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-suggest`;

  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      message: opts.message,
      chatHistory: opts.chatHistory,
      recentContext: opts.recentContext,
      memorySummary: opts.memorySummary,
      partnerStyle: opts.partnerStyle,
      meName: opts.meName,
      otherName: opts.otherName,
      timezone: opts.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });

  if (!resp.ok || !resp.body) {
    if (resp.status === 429) throw new Error('Rate limited, try again shortly');
    if (resp.status === 402) throw new Error('AI credits exhausted');
    throw new Error('Failed to get reply');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = '';
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') {
        streamDone = true;
        break;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) opts.onDelta(content);
      } catch {
        textBuffer = line + '\n' + textBuffer;
        break;
      }
    }
  }

  if (textBuffer.trim()) {
    for (let raw of textBuffer.split('\n')) {
      if (!raw) continue;
      if (raw.endsWith('\r')) raw = raw.slice(0, -1);
      if (raw.startsWith(':') || raw.trim() === '') continue;
      if (!raw.startsWith('data: ')) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) opts.onDelta(content);
      } catch { /* ignore */ }
    }
  }

  opts.onDone();
}

export async function fetchReplySuggestions(
  lastMessage: string,
  memorySummary: string,
  partnerStyle: string,
  meName: string,
  otherName: string
): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('chat-suggest', {
      body: {
        action: 'suggest-replies',
        lastMessage,
        memorySummary,
        partnerStyle,
        meName,
        otherName,
      },
    });
    if (error) return [];
    return (data as { replies: string[] })?.replies || [];
  } catch {
    return [];
  }
}
