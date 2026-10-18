# Wei-Yu Chen’s Blog

A static Astro personal blog. Three columns, white article cards, a pale gray background, and muted brown accents. The archive contains 12 full-length English technical articles, consolidated from 16 original files. Pet travel, airline miles, scam identification, and the Nostr article are excluded. Original publication dates and source timestamps are preserved; the editing date is separate. Original illustrations and screenshots are restored locally; identifying values in screenshots are masked. The approved static site is deployed to Cloudflare Pages through GitHub Actions.

## Local preview

Use Node 24 (see `.nvmrc`).

```sh
npm ci
npm run dev -- --port 4321
```

Visit http://localhost:4321. To verify the static output:

```sh
npm run build
npm run preview -- --port 4321
```

## Content

- `src/pages/index.astro`: article feed.
- `src/components/BlogShell.astro`: author, topic and recent-post sidebars.
- `src/pages/archives/` and `src/pages/categories/`: archive and topic browsing.
- `src/pages/services/`: AI engineering and DevOps service pages.
- `src/pages/writing/*.md`: fresh Markdown articles.
- `src/data/site.ts`: public identity, email, and article metadata.
- `src/styles/global.css`: responsive visual system.
- `src/layouts/Base.astro`: shared navigation, footer, canonical URLs, and structured data.

Article publication dates refer to the original articles. The separate modification date records the English/privacy edit. Article summaries and dates in `posts.json` feed the listing, RSS, and article layout.

## Cloudflare Pages

- Project: `weiyu-blog`.
- Workflow: `.github/workflows/cloudflare-pages.yml`. Pushes to `main` build and publish; pull requests build only.
- Repository secret: `CLOUDFLARE_API_TOKEN` with Pages Edit for the deployment account.
- Repository variable: `CLOUDFLARE_ACCOUNT_ID`.
- Framework: Astro / static site.
- Build command: `npm run build`.
- Output directory: `dist`.
- Build environment: `NODE_VERSION=24.19.0`.
- Production domain: `weiyu.dev`.
- No server adapter, database, AWS credentials, or backend required.

Check that the production domain is final before publishing. For a publicly accessible preview, configure noindex on that preview hostname. Review and approve all new copy before publishing.

## Review boundaries

The migration is a normal commit on top of the original history. No existing commits or timestamps are rewritten. A future history replacement requires separate approval. For any later historical rewrite, preserve both author and committer timestamps (including time-zone offsets), compare the complete before/after timestamp records, and keep a private recovery copy. Do not backdate new work.
