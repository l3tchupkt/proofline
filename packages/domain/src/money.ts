import { DomainError } from './errors.js';

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'PYG', 'UGX']);
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

export function getCurrencyFractionDigits(currencyCode: string): number {
  const upper = currencyCode.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(upper)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(upper)) return 3;
  return 2;
}

export class Money {
  public readonly amountMinor: number;
  public readonly currencyCode: string;

  private constructor(amountMinor: number, currencyCode: string) {
    if (!Number.isSafeInteger(amountMinor)) {
      throw new DomainError(
        'INVALID_MONETARY_MINOR_UNIT',
        'Monetary minor-unit value must be a safe integer'
      );
    }
    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      throw new DomainError(
        'INVALID_CURRENCY_CODE',
        `Currency code must be a 3-letter ISO-4217 code, received "${currencyCode}"`
      );
    }
    this.amountMinor = amountMinor;
    this.currencyCode = currencyCode;
  }

  static fromMinorUnits(amountMinor: number, currencyCode: string): Money {
    return new Money(amountMinor, currencyCode.toUpperCase());
  }

  /**
   * Parses an exact decimal string (e.g., "850.00") without floating-point arithmetic.
   */
  static fromDecimalString(decimalValue: string, currencyCode: string): Money {
    const normalizedCurrency = currencyCode.toUpperCase();
    const trimmed = decimalValue.trim();
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
    if (!match) {
      throw new DomainError(
        'INVALID_MONETARY_STRING',
        `Cannot parse monetary decimal string "${decimalValue}"`
      );
    }

    const sign = match[1] === '-' ? -1 : 1;
    const wholePart = match[2] ?? '0';
    const fractionalRaw = match[3] ?? '';
    const scale = getCurrencyFractionDigits(normalizedCurrency);

    if (fractionalRaw.length > scale) {
      const extraDigits = fractionalRaw.slice(scale);
      if (/[^0]/.test(extraDigits)) {
        throw new DomainError(
          'MONETARY_PRECISION_OVERFLOW',
          `Monetary value "${decimalValue}" exceeds ${scale} decimal places for ${normalizedCurrency}`
        );
      }
    }

    const paddedFraction = fractionalRaw.slice(0, scale).padEnd(scale, '0');
    const combinedDigits = `${wholePart}${paddedFraction}`;
    const parsedMinor = sign * Number(combinedDigits);

    return new Money(parsedMinor, normalizedCurrency);
  }

  toDecimalString(): string {
    const scale = getCurrencyFractionDigits(this.currencyCode);
    const sign = this.amountMinor < 0 ? '-' : '';
    const absDigits = String(Math.abs(this.amountMinor));

    if (scale === 0) {
      return `${sign}${absDigits}`;
    }

    const padded = absDigits.padStart(scale + 1, '0');
    const splitAt = padded.length - scale;
    const whole = padded.slice(0, splitAt);
    const fraction = padded.slice(splitAt);
    return `${sign}${whole}.${fraction}`;
  }

  format(): string {
    return `${this.currencyCode} ${this.toDecimalString()}`;
  }

  add(other: Money): Money {
    if (other.currencyCode !== this.currencyCode) {
      throw new DomainError(
        'CURRENCY_MISMATCH',
        `Cannot add ${this.currencyCode} and ${other.currencyCode}`
      );
    }
    return Money.fromMinorUnits(this.amountMinor + other.amountMinor, this.currencyCode);
  }
}

