import { describe, expect, it } from 'vitest';
import { checkSpokenText } from '../packages/cli/src/generate.js';

describe('speech text for TTS', () => {
  it('accepts spelled-out text and ignores the voice description', () => {
    expect(() => checkSpokenText('Im Jahr zweitausendsiebenundsiebzig, zum Beispiel.')).not.toThrow();
    expect(() => checkSpokenText('(tiefe Stimme, 40 Jahre)Keine Sorgen.')).not.toThrow();
  });

  it('rejects digits, symbols, and abbreviations', () => {
    expect(() => checkSpokenText('Im Jahr 2077')).toThrow(/2077.*zweitausendsiebenundsiebzig/);
    expect(() => checkSpokenText('um 23:15 Uhr')).toThrow(/23, 15/);
    expect(() => checkSpokenText('100 % sicher')).toThrow(/%/);
    expect(() => checkSpokenText('Das ist z. B. so.')).toThrow(/z\. B\./);
    expect(() => checkSpokenText('Treffen bei Dr. Vogel')).toThrow(/Dr\./);
  });
});
