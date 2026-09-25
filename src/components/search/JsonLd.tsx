/**
 * JsonLd.tsx
 * -----------------------------------------------------------------------------
 * Renders schema.org structured data (JSON-LD) for SEO. Lets Google/Bing
 * render rich results (e.g., "SearchResultsPage" with sitelinks search box).
 *
 * The component is server-renderable (no 'use client' needed) — it just
 * emits a <script type="application/ld+json"> tag.
 */

interface JsonLdProps {
  data: Record<string, unknown> | Record<string, unknown>[]
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
    />
  )
}

/**
 * Build the schema.org JSON-LD for the home page — a WebSite with a
 * SearchAction (potentially eligible for Google's "sitelinks search box").
 *
 *   {
 *     "@context": "https://schema.org",
 *     "@type": "WebSite",
 *     "name": "CIRKLE",
 *     "url": "https://cirkle.search/",
 *     "potentialAction": {
 *       "@type": "SearchAction",
 *       "target": "https://cirkle.search/?q={search_term_string}",
 *       "query-input": "required name=search_term_string"
 *     }
 *   }
 */
export function homePageJsonLd(baseUrl: string = 'https://cirkle.search') {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'CIRKLE',
    alternateName: 'دواير',
    url: `${baseUrl}/`,
    description:
      'Independent, privacy-first web search engine with its own crawler, index, ranking, source transparency, evidence-grounded AI, and user-controlled search modes.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
    publisher: {
      '@type': 'Organization',
      name: 'CIRKLE',
      logo: {
        '@type': 'ImageObject',
        url: `${baseUrl}/cirkle-logo.svg`,
      },
    },
  }
}

/**
 * Build the schema.org JSON-LD for a search results page — a
 * SearchResultsPage with itemListElement entries for each result.
 *
 *   {
 *     "@context": "https://schema.org",
 *     "@type": "SearchResultsPage",
 *     "mainEntity": {
 *       "@type": "ItemList",
 *       "numberOfItems": 6,
 *       "itemListElement": [
 *         { "@type": "ListItem", "position": 1, "url": "...", "name": "..." },
 *         ...
 *       ]
 *     }
 *   }
 */
export function searchResultsJsonLd(
  query: string,
  results: { url: string; title: string }[],
  baseUrl: string = 'https://cirkle.search',
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SearchResultsPage',
    name: `${query} — CIRKLE Search`,
    url: `${baseUrl}/?q=${encodeURIComponent(query)}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: results.length,
      itemListElement: results.slice(0, 10).map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: r.url,
        name: r.title,
      })),
    },
  }
}
