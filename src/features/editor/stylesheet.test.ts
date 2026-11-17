import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'editor.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('the editor stylesheet takes every colour from the theme tokens', () => {
  const values = [...css.matchAll(/([-\w]+)\s*:\s*([^;{}]+);/g)].map(([, property, value]) => `${property}: ${value.trim()}`);
  expect(values.length).toBeGreaterThan(100);
  const literal = /(?:^|[\s,(])(?:#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|color-mix\(|white\b|black\b)/i;
  expect(values.filter(declaration => literal.test(declaration.slice(declaration.indexOf(':') + 1)))).toEqual([]);
});

test('the editor stylesheet avoids layout CSS newer than Safari 14', () => {
  expect(css).not.toMatch(/:has\(|light-dark\(|&|aspect-ratio|@container|\bdvh\b/);
});