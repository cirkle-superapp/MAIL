/**
 * GET /api/sitemap.xml
 * -----------------------------------------------------------------------------
 * Dynamic XML sitemap generated from the Document index. Lists every indexed
 * page's URL + lastmod (crawledAt). Helps Google/Bing discover + re-crawl the
 * index. Pagination via the ?page=N query param (1000 URLs per page).
 *
 * The sitemap is also linked from `<link rel="sitemap" href="/api/sitemap.xml">`
 * in layout.tsx + referenced in public/robots.txt.
 *
 * Cache: 1 hour (the index doesn't change more often than that).
 */
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PAGE_SIZE = 1000
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cirkle.search'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10))
  const skip = page * PAGE_SIZE

  // Fetch documents ordered by crawledAt desc — freshest first.
  const docs = await db.document.findMany({
    where: { deletedAt: null },
    select: { url: true, canonicalUrl: true, crawledAt: true, updatedAt: true, title: true },
    orderBy: { crawledAt: 'desc' },
    skip,
    take: PAGE_SIZE,
  }).catch(() => [])

  const total = await db.document.count({ where: { deletedAt: null } }).catch(() => 0)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Build the XML sitemap.
  const urls = docs.map((d) => {
    const loc = d.canonicalUrl || d.url
    const lastmod = (d.updatedAt ?? d.crawledAt).toISOString()
    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
  }).join('\n')

  // Also include the home page + the search route as static entries.
  const staticUrls = [
    `  <url>
    <loc>${escapeXml(BASE_URL)}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`,
  ].join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${urls}
</urlset>`

  const headers: Record<string, string> = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  }
  if (page < totalPages - 1) {
    headers['Link'] = `<${BASE_URL}/api/sitemap.xml?page=${page + 1}>; rel="next"`
  }

  return new Response(xml, { headers })
}
