import { articles, site } from '../data/site';
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function GET() {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escape(site.name)} — Writing</title><link>${site.url}/writing/</link><description>Notes on AI engineering, DevOps, and working systems.</description><language>en</language>${articles.map(article => `<item><title>${escape(article.title)}</title><link>${site.url}/writing/${article.slug}/</link><guid>${site.url}/writing/${article.slug}/</guid><description>${escape(article.description)}</description><pubDate>${new Date(`${article.date}T12:00:00Z`).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
