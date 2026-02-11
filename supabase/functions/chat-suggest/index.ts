import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getTimeContext(timezone?: string): { timeOfDay: string; greeting: string; mood: string } {
  const now = new Date();
  // Try to use user's timezone, fallback to UTC
  let hour = now.getUTCHours();
  if (timezone) {
    try {
      const formatted = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(now);
      hour = parseInt(formatted);
    } catch { /* fallback to UTC */ }
  }

  if (hour >= 5 && hour < 12) return { timeOfDay: "morning", greeting: "good morning", mood: "fresh, gentle, waking-up energy" };
  if (hour >= 12 && hour < 17) return { timeOfDay: "afternoon", greeting: "good afternoon", mood: "casual, active, mid-day energy" };
  if (hour >= 17 && hour < 21) return { timeOfDay: "evening", greeting: "good evening", mood: "relaxed, winding down, warm" };
  return { timeOfDay: "night", greeting: "goodnight", mood: "sleepy, soft, intimate, late-night vibes" };
}

function detectEmotion(message: string): string {
  const lower = message.toLowerCase();
  const emojiMap: [RegExp, string][] = [
    [/😢|😭|😞|😔|💔|😿|🥺/, "sad, needs comfort"],
    [/😡|😤|🤬|💢/, "angry, frustrated"],
    [/😂|🤣|😆|😹|haha|lol|lmao/, "playful, laughing"],
    [/❤|💕|💗|💖|🥰|😍|😘|love|miss you|jaanu|jaan/, "loving, romantic"],
    [/😊|🥳|🎉|yay|happy/, "happy, excited"],
    [/😰|😥|😟|worried|scared/, "anxious, worried"],
    [/🙄|😒|bore|ugh/, "bored, annoyed"],
  ];
  for (const [pat, emotion] of emojiMap) {
    if (pat.test(lower)) return emotion;
  }
  if (/\?{2,}|wtf|what|why|how/.test(lower)) return "curious, questioning";
  if (/!{2,}|omg|wow/.test(lower)) return "excited, surprised";
  return "neutral";
}

async function callAI(body: Record<string, unknown>, stream = false) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const t = await response.text();
    console.error("AI error:", response.status, t);
    if (response.status === 429) return { error: "Rate limited", status: 429 };
    if (response.status === 402) return { error: "Credits exhausted", status: 402 };
    throw new Error("AI gateway error");
  }

  if (stream) return { stream: response };
  return { data: await response.json() };
}

function errorResponse(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    // ─── Build Memory ───
    if (body.action === "build-memory") {
      const { sampleMessages, myTexts, partnerTexts, meName, otherName } = body;

      const result = await callAI({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Analyze this WhatsApp chat and produce THREE sections as JSON:

1. "summary": Key relationship dynamics, recurring topics, inside jokes, important dates, how they talk to each other. Max 500 words.

2. "partnerStyle": Detailed analysis of how "${otherName}" writes messages. Include: typical message length, emoji/emoticon usage, pet names they use, how they express love/anger/humor, common phrases, greeting style, texting quirks, language mixing patterns. Max 400 words.

3. "styleProfile": How "${meName}" writes. Same analysis. Max 200 words.

Return valid JSON with keys: summary, partnerStyle, styleProfile`,
          },
          {
            role: "user",
            content: `Full chat:\n${sampleMessages}\n\n${otherName}'s messages:\n${partnerTexts}\n\n${meName}'s messages:\n${myTexts}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_analysis",
            description: "Return the chat analysis",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string" },
                partnerStyle: { type: "string" },
                styleProfile: { type: "string" },
              },
              required: ["summary", "partnerStyle", "styleProfile"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_analysis" } },
      });

      if ("error" in result) return errorResponse(result.error as string, result.status as number);
      const toolCall = (result.data as any).choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) return new Response(toolCall.function.arguments, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ summary: "", partnerStyle: "", styleProfile: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── Suggest Replies ───
    if (body.action === "suggest-replies") {
      const { lastMessage, memorySummary, partnerStyle, meName, otherName } = body;

      const result = await callAI({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You help ${meName} reply to ${otherName}. Based on their texting style and relationship, suggest 3 short quick replies that ${meName} would naturally send. Each reply should be 3-10 words, casual, matching ${meName}'s style.

Context: ${memorySummary}
${meName}'s style: ${partnerStyle}`,
          },
          {
            role: "user",
            content: `${otherName} just said: "${lastMessage}"\n\nGive 3 quick reply options for ${meName}.`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_suggestions",
            description: "Return reply suggestions",
            parameters: {
              type: "object",
              properties: { replies: { type: "array", items: { type: "string" } } },
              required: ["replies"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_suggestions" } },
      });

      if ("error" in result) return errorResponse(result.error as string, result.status as number);
      const toolCall = (result.data as any).choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) return new Response(toolCall.function.arguments, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ replies: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── Chat Reply (streaming) ───
    const { message, chatHistory, recentContext, memorySummary, partnerStyle, meName, otherName, timezone } = body;

    const timeCtx = getTimeContext(timezone);
    const emotion = detectEmotion(message);

    const systemPrompt = `You ARE ${otherName}. You are texting ${meName} on WhatsApp right now.

CURRENT TIME CONTEXT:
- It's ${timeCtx.timeOfDay} right now
- The mood/energy should be: ${timeCtx.mood}
- If greeting, use "${timeCtx.greeting}" style naturally (in their language/style)

DETECTED EMOTION FROM ${meName}'s MESSAGE: ${emotion}
- Match your emotional response accordingly. If they're sad, be comforting. If playful, be fun. If loving, be warm.

RELATIONSHIP CONTEXT:
${memorySummary}

${otherName}'s EXACT TEXTING STYLE (mimic this perfectly):
${partnerStyle}

ABSOLUTE RULES — FOLLOW STRICTLY:
- Send EXACTLY ONE short message. Like ONE single WhatsApp bubble.
- Keep it 3-12 words. That's it. One line.
- Match ${otherName}'s exact emoji style, pet names, language mixing.
- If they say "hi" → reply with a simple greeting like they would. NOT multiple questions.
- If they ask "kese ho" → reply ONE short answer. Not a paragraph.
- NEVER send multiple sentences. NEVER use newlines to send multiple messages.
- NEVER ask 3+ questions in one reply. Max 1 question per reply.
- Think: what would ONE WhatsApp bubble look like? Send only that.
- No markdown. Plain text only.
- Be natural, warm, in-character.
- Time-appropriate: don't say "good morning" at night, etc.

EXAMPLES OF CORRECT LENGTH:
- "hii jaanu 💗"
- "acha batao kya hua 😂"  
- "miss you so much 🥺"
- "haan bolo na jaan 💗"
- "pagal ho kya 😭😂"`;

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (recentContext) {
      messages.push({ role: "system", content: `Recent real conversation for context:\n${recentContext}` });
    }

    if (chatHistory?.length > 0) {
      for (const msg of chatHistory) {
        messages.push({ role: msg.role === "user" ? "user" : "assistant", content: msg.content });
      }
    }

    messages.push({ role: "user", content: message });

    const result = await callAI({ model: "google/gemini-3-flash-preview", messages, stream: true, max_tokens: 60 }, true);
    if ("error" in result) return errorResponse(result.error as string, result.status as number);

    return new Response((result as any).stream.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
