import type { SourceLocator, VerificationStatus } from '@proofline/domain';
import type { ParsedEvidenceDocument } from '../parsers/types.js';

export interface CandidateExtractedFact {
  factType: string;
  factText: string;
  locator: SourceLocator;
  confidence: number;
  verificationStatus: VerificationStatus;
  extractionVersion: string;
  isOcrDerived: boolean;
  timestamp: Date | null;
}

export const FACT_EXTRACTOR_VERSION = 'deterministic-extractor-v1.0.0';

const FACT_RULES: Array<{
  factType: string;
  regex: RegExp;
  confidence: number;
}> = [
  {
    factType: 'CUSTOMER_ACKNOWLEDGEMENT',
    regex: /\b(approved|confirmed|received|looks great|thank you for delivering|accepted|signed off|live on)\b/i,
    confidence: 0.9
  },
  {
    factType: 'DELIVERY_COMPLETION',
    regex: /\b(delivered|deployed|handover|handed over|completed|repository|staging|production|milestone|final build)\b/i,
    confidence: 0.88
  },
  {
    factType: 'CONTRACT_AGREEMENT',
    regex: /\b(agreement|scope of work|statement of work|deliverables|contract|milestone|payment terms|non-refundable|fee)\b/i,
    confidence: 0.86
  },
  {
    factType: 'PAYMENT_OR_AMOUNT_REFERENCE',
    regex: /\b(USD|EUR|GBP|\$\d+|\d+\.\d{2}|invoice|transaction)\b/i,
    confidence: 0.82
  },
  {
    factType: 'CARRIER_OR_TRACKING',
    regex: /\b(tracking|fedex|ups|usps|dhl|shipment|shipped)\b/i,
    confidence: 0.84
  }
];

function extractDateFromText(text: string): Date | null {
  const isoMatch = /\b(20\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?)\b/.exec(text);
  if (isoMatch?.[1]) {
    const parsed = new Date(isoMatch[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/**
 * Extracts verifiable candidate facts strictly tied to real parsed chunks and locators.
 * Never invents facts that are absent from the source chunks.
 */
export function extractCandidateFacts(parsed: ParsedEvidenceDocument): CandidateExtractedFact[] {
  const facts: CandidateExtractedFact[] = [];

  for (const chunk of parsed.chunks) {
    const text = chunk.text.trim();
    if (text.length < 12) continue;

    for (const rule of FACT_RULES) {
      if (rule.regex.test(text)) {
        const verificationStatus: VerificationStatus = parsed.isOcrDerived
          ? 'REQUIRES_REVIEW'
          : 'VERIFIED';

        facts.push({
          factType: rule.factType,
          factText: text.length > 360 ? `${text.slice(0, 357)}...` : text,
          locator: chunk.locator,
          confidence: parsed.isOcrDerived ? Math.min(rule.confidence, 0.72) : rule.confidence,
          verificationStatus,
          extractionVersion: FACT_EXTRACTOR_VERSION,
          isOcrDerived: parsed.isOcrDerived,
          timestamp: chunk.timestamp ?? extractDateFromText(text) ?? parsed.documentCreatedAt
        });
        break;
      }
    }
  }

  return facts;
}

