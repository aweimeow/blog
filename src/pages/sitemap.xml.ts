import { articles, site, topics } from '../data/site';
export function GET() {
  const paths = ['/', '/about/', '/contact/', '/archives/', '/categories/', '/services/ai-engineering/', '/services/devops/', '/writing/', ...topics.map(t => `/categories/${t.slug}/`), ...articles.map(a => `/writing/${a.slug}/`)];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${site.url}${path}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
