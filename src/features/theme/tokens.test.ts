import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = withoutComments(readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8'));

type Block = {selector: string; declarations: Map<string, string>};

function blocks(css: string): Block[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.trim(),
    declarations: new Map(body.split(';').map(line => line.trim()).filter(Boolean).map(line => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()] as const;
    })),
  }));
}

function only(selector: string, filter: (block: Block) => boolean = () => true): Map<string, string> {
  const matches = blocks(tokens).filter(block => block.selector === selector && filter(block));
  expect(matches, selector).toHaveLength(1);
  return matches[0].declarations;
}

const light = () => only(':root', block => block.declarations.has('color-scheme'));
const systemDark = () => only(":root:not([data-theme='light'])");
const forcedDark = () => only(":root[data-theme='dark']");

function hsl(red: number, green: number, blue: number) {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  const hue = delta === 0 ? 0
    : max === r ? 60 * (((g - b) / delta + 6) % 6)
      : max === g ? 60 * ((b - r) / delta + 2)
        : 60 * ((r - g) / delta + 4);
  return {hue, saturation};
}

function colours(css: string): {literal: string; red: number; green: number; blue: number}[] {
  const hex = [...css.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)].map(([literal, digits]) => {
    const full = digits.length === 3 ? [...digits].map(digit => digit + digit).join('') : digits;
    return {literal, red: parseInt(full.slice(0, 2), 16), green: parseInt(full.slice(2, 4), 16), blue: parseInt(full.slice(4, 6), 16)};
  });
  const rgb = [...css.matchAll(/rgba?\(([^)]*)\)/g)].map(([literal, channels]) => {
    const [red, green, blue] = channels.split(',').map(Number);
    return {literal, red, green, blue};
  });
  return [...hex, ...rgb];
}

test('the system-dark and forced-dark blocks are identical', () => {
  expect(tokens).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{/);
  expect([...systemDark()]).toEqual([...forcedDark()]);
});

test('light and dark declare the same tokens', () => {
  expect([...light().keys()].sort()).toEqual([...forcedDark().keys()].sort());
  expect(light().get('color-scheme')).toBe('light');
  expect(forcedDark().get('color-scheme')).toBe('dark');
});

test('tokens spend hue only on red and amber', () => {
  const found = colours(tokens);
  expect(found.length).toBeGreaterThan(20);
  for (const colour of found) {
    const {hue, saturation} = hsl(colour.red, colour.green, colour.blue);
    const neutral = saturation <= 0.15;
    const redOrAmber = hue <= 50 || hue >= 340;
    expect(neutral || redOrAmber, `${colour.literal} has hue ${Math.round(hue)}`).toBe(true);
  }
});

test('tokens avoid CSS newer than Safari 14', () => {
  expect(tokens).not.toMatch(/light-dark\(|:has\(|&/);
});