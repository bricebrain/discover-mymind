import { expect, it } from 'vitest';
import { validArticleUrl } from './articleUrl';

it('accepte un lien http(s) ou vide, refuse le reste', () => {
  expect(validArticleUrl('')).toBe(true);
  expect(validArticleUrl('https://www.theguardian.com/world/x')).toBe(true);
  expect(validArticleUrl('https://www.thegua')).toBe(true);
  expect(validArticleUrl('theguardian.com/x')).toBe(false);
  expect(validArticleUrl('javascript:alert(1)')).toBe(false);
});
