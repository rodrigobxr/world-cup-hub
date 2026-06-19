import { createFileRoute } from '@tanstack/react-router'

const ESPN_NEWS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/news?region=br&lang=pt&limit=12'

const headers = {
  'Cache-Control': 'public, max-age=300',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
}

type Cached = { at: number; payload: unknown }
let cache: Cached | null = null
const TTL_MS = 5 * 60_000

type EspnArticle = {
  headline?: string
  description?: string
  published?: string
  links?: { web?: { href?: string } }
  images?: { url?: string }[]
}

export const Route = createFileRoute('/api/public/wc-news')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers }),
      GET: async () => {
        const now = Date.now()
        if (cache && now - cache.at < TTL_MS) {
          return Response.json(cache.payload, { headers: { ...headers, 'X-Cache': 'HIT' } })
        }

        try {
          const response = await fetch(ESPN_NEWS_URL, {
            headers: { Accept: 'application/json', 'User-Agent': 'RodrigaoCopa/1.0' },
          })
          if (!response.ok) throw new Error(`ESPN News HTTP ${response.status}`)

          const data: { articles?: EspnArticle[] } = await response.json()
          const news = (data.articles ?? []).slice(0, 8).map((article) => ({
            title: article.headline ?? 'Notícia da Copa',
            summary: article.description ?? '',
            source: 'ESPN Brasil',
            url: article.links?.web?.href ?? '#',
            published: article.published ?? null,
            image: article.images?.[0]?.url ?? null,
          }))

          const payload = { updatedAt: new Date().toISOString(), source: 'ESPN Brasil', count: news.length, news }
          cache = { at: now, payload }
          return Response.json(payload, { headers: { ...headers, 'X-Cache': 'MISS' } })
        } catch (e: any) {
          return Response.json(
            { error: 'Falha ao consultar notícias públicas', detail: String(e?.message ?? e), news: [] },
            { status: 500, headers },
          )
        }
      },
    },
  },
})