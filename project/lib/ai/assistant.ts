export type UniEcoAiChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

// The built-in assistant is deliberately local and provider-free: no API key,
// external model request, metered token use, or surprise AI billing.
export type UniEcoAiMode = 'safe-fallback';
export type UniEcoAiCitation = { title: string; url: string };

const MAX_CONTEXT = 8_000;

function healthFacts(context: string): string[] {
  try {
    const parsed = JSON.parse(context) as { systemHealth?: { communicationQueue?: unknown; paymentProviders?: unknown } };
    const health = parsed.systemHealth;
    if (!health || typeof health !== 'object') return [];
    const sections = [
      ['Communication queue', health.communicationQueue],
      ['Payment provider setup', health.paymentProviders],
    ] as const;
    return sections.flatMap(([label, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      return Object.entries(value as Record<string, unknown>)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
        .slice(0, 8)
        .map(([key, count]) => `${label} — ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${count}`);
    });
  } catch {
    return [];
  }
}

function offlineReply(message: string, context: string): string {
  const lower = message.toLowerCase();
  if (/\b(health|status|queue|failure|monitor|system)\b/.test(lower)) {
    const facts = healthFacts(context);
    return facts.length
      ? `Here is the latest authorised platform snapshot I can see:\n\n${facts.map((fact) => `• ${fact}`).join('\n')}\n\nThese are aggregate signals, not a full investigation. Open the relevant management page to verify individual records. I can suggest next steps, but I cannot change or send anything.`
      : 'I could not retrieve the aggregate health snapshot just now. Please refresh System Health and check the relevant queue there. I can still help you plan a safe investigation, but I will not invent a status.';
  }
  if (/\b(news|update|university|universities|today|latest)\b/.test(lower)) {
    return 'To find current campus updates without any paid AI service, choose a trusted official university source and tap “Scan now”. I will show public leads with their source links; check the original page and date before sharing. Then use “Prepare for approval” to create a draft. I cannot claim what is new until a scan returns results.';
  }
  if (/\b(broadcast|announcement|push|email|notify|通知)\b/.test(lower) || (/\bmessage\b/.test(lower) && !/\b(idea|ideas|campaign|content)\b/.test(lower))) {
    return 'I can help prepare a broadcast draft from a trusted source. Keep it factual, name the relevant campus and date, include the original source link, and choose the right audience. “Prepare for approval” saves it to Broadcasts; a human must review and approve it before anything is delivered.';
  }
  if (/\b(idea|ideas|campaign|promote|engagement|content|post)\b/.test(lower)) {
    return 'Here are practical, no-cost content ideas for UniEco Ghana:\n\n1. Weekly campus notice round-up with official links and dates.\n2. Student/vendor spotlight, published only with clear consent.\n3. Short marketplace safety tip (meet safely, verify listings, report suspicious activity).\n4. Upcoming campus event reminder, confirmed with the organiser.\n5. Student-made campus moment or useful service, with the creator’s permission.\n\nUse short, mobile-friendly copy, one clear action, and the relevant campus audience. Keep drafts in review until a human verifies them.';
  }
  if (/\b(video|photo|image|media|upload)\b/.test(lower)) {
    return 'For campus posts, use a clear caption and make sure you have permission to share everyone shown. Large videos may take longer on mobile data, so compressing the file while preserving visible quality helps students. Check the post on a phone after upload.';
  }
  if (/\b(help|can you|what can you|capabilit|how do i|how can)\b/.test(lower)) {
    return 'I am UniEco’s built-in, provider-free operations helper. I can summarize the authorised aggregate health snapshot, guide you through read-only scans of official university pages, suggest campus content, and prepare source-linked broadcast drafts. No paid AI service or metered AI request is used. I cannot publish, send, approve, change roles, or act on payments; a human remains in control.';
  }
  return 'I can help with platform health, trusted university news scans, campus content ideas, and safe broadcast drafts. I work without a paid AI provider, so I use UniEco’s available aggregate data and clear workflows rather than pretending to know facts I cannot verify. What would you like help with?';
}

export async function askUniEcoAi(params: {
  messages: UniEcoAiChatMessage[];
  context?: string;
  instruction?: string;
}): Promise<{ text: string; mode: UniEcoAiMode; citations?: UniEcoAiCitation[]; webSearched?: boolean }> {
  const context = (params.context || '').slice(0, MAX_CONTEXT);
  const lastUserMessage = [...params.messages].reverse().find((message) => message.role === 'user')?.content || params.instruction || '';
  return {
    text: offlineReply(lastUserMessage.slice(0, 2_000), context),
    mode: 'safe-fallback',
    citations: [],
    webSearched: false,
  };
}

export async function createUniEcoAiDraft(params: {
  update: { title: string; summary: string; url: string; sourceLabel: string };
  audience: 'all' | 'students' | 'vendors';
}): Promise<{ title: string; body: string; mode: UniEcoAiMode }> {
  const title = params.update.title.replace(/\s+/g, ' ').trim().slice(0, 120);
  const summary = params.update.summary.replace(/\s+/g, ' ').trim();
  const sourceLabel = params.update.sourceLabel.replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
  const url = new URL(params.update.url);
  const audienceLabel = params.audience === 'all' ? 'students and vendors' : params.audience;
  const prefix = `${sourceLabel}: `;
  const suffix = `\n\nFor ${audienceLabel}. Verify dates and details at the source.\nSource: ${url.toString()}`;
  const body = `${prefix}${summary.slice(0, Math.max(0, 900 - prefix.length - suffix.length))}${suffix}`;
  return { title, body, mode: 'safe-fallback' };
}
