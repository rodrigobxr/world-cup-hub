import { createFileRoute } from '@tanstack/react-router'

// Mapa de nomes da API-Football (EN) -> nomes usados no app (PT-BR)
// Cobertura: 48 seleções da Copa do Mundo 2026
const EN_TO_PT: Record<string, string> = {
  'Mexico': 'México',
  'South Africa': 'África do Sul',
  'South Korea': 'Coreia do Sul',
  'Korea Republic': 'Coreia do Sul',
  'Czech Republic': 'República Tcheca',
  'Czechia': 'República Tcheca',
  'Canada': 'Canadá',
  'Bosnia and Herzegovina': 'Bósnia',
  'Bosnia & Herzegovina': 'Bósnia',
  'Qatar': 'Catar',
  'Switzerland': 'Suíça',
  'Brazil': 'Brasil',
  'Morocco': 'Marrocos',
  'Haiti': 'Haiti',
  'Scotland': 'Escócia',
  'United States': 'Estados Unidos',
  'USA': 'Estados Unidos',
  'Paraguay': 'Paraguai',
  'Australia': 'Austrália',
  'Turkey': 'Turquia',
  'Türkiye': 'Turquia',
  'Germany': 'Alemanha',
  'Curaçao': 'Curaçao',
  'Curacao': 'Curaçao',
  'Ivory Coast': 'Costa do Marfim',
  "Cote d'Ivoire": 'Costa do Marfim',
  'Ecuador': 'Equador',
  'Netherlands': 'Holanda',
  'Japan': 'Japão',
  'Sweden': 'Suécia',
  'Tunisia': 'Tunísia',
  'Belgium': 'Bélgica',
  'Egypt': 'Egito',
  'Iran': 'Irã',
  'IR Iran': 'Irã',
  'New Zealand': 'Nova Zelândia',
  'Spain': 'Espanha',
  'Cape Verde': 'Cabo Verde',
  'Cabo Verde': 'Cabo Verde',
  'Saudi Arabia': 'Arábia Saudita',
  'Uruguay': 'Uruguai',
  'France': 'França',
  'Senegal': 'Senegal',
  'Iraq': 'Iraque',
  'Norway': 'Noruega',
  'Argentina': 'Argentina',
  'Algeria': 'Argélia',
  'Austria': 'Áustria',
  'Jordan': 'Jordânia',
  'Portugal': 'Portugal',
  'DR Congo': 'RD Congo',
  'Congo DR': 'RD Congo',
  'Uzbekistan': 'Uzbequistão',
  'Colombia': 'Colômbia',
  'England': 'Inglaterra',
  'Croatia': 'Croácia',
  'Ghana': 'Gana',
  'Panama': 'Panamá',
}

const ptName = (en: string) => EN_TO_PT[en] ?? en

type Cached = { at: number; payload: unknown }
let cache: Cached | null = null
const TTL_MS = 60_000

export const Route = createFileRoute('/api/public/wc-live')({
  server: {
    handlers: {
      GET: async () => {
        const key = process.env.API_FOOTBALL_KEY
        if (!key) {
          return Response.json(
            { error: 'API_FOOTBALL_KEY ausente no servidor' },
            { status: 500 },
          )
        }

        const now = Date.now()
        if (cache && now - cache.at < TTL_MS) {
          return Response.json(cache.payload, {
            headers: { 'Cache-Control': 'public, max-age=30', 'X-Cache': 'HIT' },
          })
        }

        try {
          const r = await fetch(
            'https://v3.football.api-sports.io/fixtures?league=1&season=2026',
            { headers: { 'x-apisports-key': key } },
          )
          if (!r.ok) {
            return Response.json(
              { error: 'API-Football respondeu ' + r.status },
              { status: 502 },
            )
          }
          const json: any = await r.json()
          const fixtures: any[] = json.response ?? []

          const matches = fixtures.map((f) => {
            const dt = new Date(f.fixture.date)
            const dd = String(dt.getDate()).padStart(2, '0')
            const mm = String(dt.getMonth() + 1).padStart(2, '0')
            const hh = String(dt.getHours()).padStart(2, '0')
            const min = String(dt.getMinutes()).padStart(2, '0')
            const short = f.fixture.status?.short ?? 'NS'
            const isLive = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(short)
            const done = short === 'FT' || short === 'AET' || short === 'PEN'
            return {
              id: f.fixture.id,
              d: `${dd}/${mm}`,
              time: done ? 'FIM' : isLive ? `${f.fixture.status.elapsed ?? ''}'` : `${hh}h${min === '00' ? '' : min}`,
              status: done ? 'FT' : isLive ? 'LIVE' : 'NS',
              h: ptName(f.teams.home.name),
              a: ptName(f.teams.away.name),
              hs: f.goals.home ?? '',
              as: f.goals.away ?? '',
              round: f.league.round as string,
            }
          })

          const payload = {
            updatedAt: new Date().toISOString(),
            count: matches.length,
            matches,
          }
          cache = { at: now, payload }
          return Response.json(payload, {
            headers: { 'Cache-Control': 'public, max-age=30', 'X-Cache': 'MISS' },
          })
        } catch (e: any) {
          return Response.json(
            { error: 'Falha ao consultar API-Football', detail: String(e?.message ?? e) },
            { status: 500 },
          )
        }
      },
    },
  },
})
