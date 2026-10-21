import { attrOf, openTags, parseDate, parseFeedStream, rawTag, stripHtml, text, type FeedItem, type ParseOptions } from '../feedParser';

export const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const channelFeedUrl = (id: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;

/** Atom officiel : les vidéos gardent un lien de page, jamais présenté comme un MP3. */
function parseVideo(xml: string): FeedItem | null {
  const videoId = text(xml, 'yt:videoId');
  const title = text(xml, 'title');
  if (!videoId || !VIDEO_ID.test(videoId) || !title) return null;
  const thumbnail = openTags(xml, 'media:thumbnail')[0];
  return {
    videoId, guid: `yt:video:${videoId}`, title: stripHtml(title).slice(0, 300),
    description: stripHtml(text(xml, 'media:description', 6000) ?? '').slice(0, 2000) || null,
    publishedAt: parseDate(text(xml, 'published')), durationSec: null,
    audioUrl: `https://www.youtube.com/watch?v=${videoId}`,
    imageUrl: thumbnail ? attrOf(thumbnail, 'url') : null,
  };
}

export function parseYoutubeFeed(body: ReadableStream<Uint8Array>, options: Omit<ParseOptions, 'atom'>) {
  return parseFeedStream(body, { ...options, atom: {
    parseItem: parseVideo,
    parseChannel: (xml) => ({ title: text(xml, 'title'), author: text(rawTag(xml, 'author') ?? '', 'name'), language: null, imageUrl: null }),
  } });
}
