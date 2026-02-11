export interface ParsedMessage {
  id: string;
  timestamp: Date;
  sender: string;
  text: string;
  isSystem: boolean;
}

export interface ParseResult {
  messages: ParsedMessage[];
  participants: string[];
  preview: string[];
}

const WHATSAPP_REGEX = /^\[?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\]?\s*[-–—]?\s*(.+?):\s([\s\S]*)/;
const SYSTEM_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /created group/i,
  /added you/i,
  /changed the subject/i,
  /changed this group/i,
  /left$/i,
  /removed /i,
  /joined using/i,
  /changed the group/i,
  /your security code/i,
  /disappeared message/i,
  /message was deleted/i,
  /you were added/i,
];

function parseTimestamp(dateStr: string, timeStr: string): Date {
  const parts = dateStr.split(/[\/\-\.]/);
  let day: number, month: number, year: number;

  if (parseInt(parts[0]) > 12) {
    day = parseInt(parts[0]);
    month = parseInt(parts[1]) - 1;
  } else if (parseInt(parts[1]) > 12) {
    month = parseInt(parts[0]) - 1;
    day = parseInt(parts[1]);
  } else {
    month = parseInt(parts[0]) - 1;
    day = parseInt(parts[1]);
  }

  year = parseInt(parts[2]);
  if (year < 100) year += 2000;

  let timeParts = timeStr.trim();
  const isPM = /pm/i.test(timeParts);
  const isAM = /am/i.test(timeParts);
  timeParts = timeParts.replace(/\s*[AaPp][Mm]/, '');
  const [hours, minutes] = timeParts.split(':').map(Number);

  let h = hours;
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;

  return new Date(year, month, day, h, minutes || 0);
}

function isSystemMessage(text: string): boolean {
  return SYSTEM_PATTERNS.some(p => p.test(text));
}

export function parseWhatsAppChat(content: string): ParseResult {
  const lines = content.split('\n');
  const messages: ParsedMessage[] = [];
  const participantSet = new Set<string>();
  const preview: string[] = [];
  let currentMsg: ParsedMessage | null = null;
  let lineCount = 0;

  for (const line of lines) {
    if (lineCount < 30) {
      preview.push(line);
      lineCount++;
    }

    const match = line.match(WHATSAPP_REGEX);
    if (match) {
      if (currentMsg) {
        if (!currentMsg.isSystem) {
          participantSet.add(currentMsg.sender);
        }
        messages.push(currentMsg);
      }

      const [, dateStr, timeStr, sender, text] = match;
      const timestamp = parseTimestamp(dateStr, timeStr);
      const sysCheck = isSystemMessage(text.trim());

      currentMsg = {
        id: crypto.randomUUID(),
        timestamp,
        sender: sender.trim(),
        text: text.trim(),
        isSystem: sysCheck,
      };
    } else if (currentMsg && line.trim()) {
      currentMsg.text += '\n' + line;
    }
  }

  if (currentMsg) {
    if (!currentMsg.isSystem) participantSet.add(currentMsg.sender);
    messages.push(currentMsg);
  }

  return {
    messages: messages.filter(m => !m.isSystem),
    participants: Array.from(participantSet),
    preview,
  };
}

export function maskSensitiveInfo(text: string): string {
  return text
    .replace(/\b\d{10,}\b/g, '***PHONE***')
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, '***EMAIL***')
    .replace(/\b(?:\d{4}[\s-]?){3}\d{4}\b/g, '***CARD***');
}
