const INJECTION_PATTERNS: Array<{ id: string; regex: RegExp }> = [
  {
    id: 'instruction_override',
    regex: /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts|rules)\b/i
  },
  {
    id: 'role_hijack',
    regex: /\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be|switch\s+to\s+developer\s+mode)\b/i
  },
  {
    id: 'chat_delimiter_injection',
    regex: /(<\|im_start\|>|<\|system\|>|\[INST\]|###\s*System\s*Prompt)/i
  },
  {
    id: 'tool_execution_attempt',
    regex: /\b(call\s+provide-evidence|execute\s+submit|auto-?approve|issue\s+refund|accept\s+claim)\b/i
  },
  {
    id: 'secret_exfiltration_attempt',
    regex: /\b(reveal|print|output|leak)\s+(the\s+)?(api[_\s]?key|client[_\s]?secret|session[_\s]?secret|env\s+variables)\b/i
  }
];

export function detectPromptInjectionSignals(text: string): string[] {
  const detected: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.regex.test(text)) {
      detected.push(pattern.id);
    }
  }
  return detected;
}

function escapeXmlEntities(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeUntrustedText(text: string): string {
  // Neutralize any variant of untrusted_evidence tags (including whitespace/attributes) and escape XML markup.
  const neutralized = text
    .replace(/<\s*\/\s*untrusted_evidence\b[^>]*>/gi, '[escaped-closing-tag]')
    .replace(/<\s*untrusted_evidence\b[^>]*>/gi, '[escaped-opening-tag]');
  return escapeXmlEntities(neutralized);
}

export function wrapUntrustedEvidence(params: {
  assetId: string;
  filename: string;
  sha256Hash: string;
  extractedText: string;
}): string {
  const safeText = sanitizeUntrustedText(params.extractedText);
  return [
    `<untrusted_evidence asset_id="${escapeXmlEntities(params.assetId)}" filename="${escapeXmlEntities(params.filename)}" sha256="${escapeXmlEntities(params.sha256Hash)}">`,
    safeText,
    '</untrusted_evidence>'
  ].join('\n');
}

