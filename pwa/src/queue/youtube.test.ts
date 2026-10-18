import { describe, expect, it } from 'vitest';
import { youtubeVideoId } from './youtube';

describe('lien vidéo depuis le téléphone', () => {
  it.each([
    'https://youtu.be/dQw4w9WgXcQ?si=partage', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45',
    'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://youtube.com/live/dQw4w9WgXcQ',
  ])('accepte %s et ignore les paramètres de partage', (url) => expect(youtubeVideoId(url)).toBe('dQw4w9WgXcQ'));
  it.each([
    '', 'https://youtube.com/playlist?list=abc', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'ftp://youtube.com/watch?v=dQw4w9WgXcQ', 'https://user:password@youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/court',
  ])('refuse %s', (url) => expect(youtubeVideoId(url)).toBeNull());
});
