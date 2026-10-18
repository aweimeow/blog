export const site = {
  name: 'Wei-Yu Chen',
  role: 'AI Engineering & DevOps Consultant',
  url: 'https://weiyu.dev',
  description: 'Wei-Yu Chen’s personal blog. Notes on AI engineering, DevOps, cloud infrastructure, and the things learned along the way.',
};

import restoredPosts from './posts.json';

export const articles = restoredPosts;
export const topics = [
  { slug: 'devops', name: 'DevOps & cloud' },
  { slug: 'ai-engineering', name: 'AI engineering' },
  { slug: 'software', name: 'Software development' },
  { slug: 'mobile-networks', name: 'Mobile networks' },
];
export function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date.slice(0, 10) + 'T00:00:00Z'));
}
export const years = [...new Set(articles.map(article => article.date.slice(0,4)))];
