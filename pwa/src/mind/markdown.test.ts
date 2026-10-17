import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('Markdown de My Mind', () => {
  it('rend titres, listes, gras, italique et liens https', () => {
    const html = renderMarkdown('# Idée\n\nUn **point** et un *détail*.\n\n- a\n- b\n\n1. un\n2. deux\n\n[source](https://example.com)');
    expect(html).toBe(
      '<h2>Idée</h2><p>Un <strong>point</strong> et un <em>détail</em>.</p><ul><li>a</li><li>b</li></ul>'
      + '<ol><li>un</li><li>deux</li></ol><p><a href="https://example.com" target="_blank" rel="noopener noreferrer">source</a></p>',
    );
  });

  it('échappe tout HTML et refuse les liens non https', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> [x](javascript:alert(1)) [y](http://a.b)');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('href="javascript');
    expect(html).not.toContain('href="http://');
  });

  it('garde les retours à la ligne d’un paragraphe', () => {
    expect(renderMarkdown('ligne 1\nligne 2')).toBe('<p>ligne 1<br>ligne 2</p>');
  });
});
