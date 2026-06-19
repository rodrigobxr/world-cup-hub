import { createFileRoute } from '@tanstack/react-router'

// TheSportsDB - free tier, no API key required (use key "3" for public access)
// FIFA World Cup league id no TheSportsDB = 4429 ("Soccer World Cup")
const TSDB_KEY = '3'
const WC_LEAGUE_ID = '4429'

// Mapa de nomes (EN -> PT-BR) - mesmas 48 seleções da Copa 2026
const EN_TO_PT: Record<string, string> = {
  Mexico: 'México',
  'South Africa': 'África do Sul',
  'South Korea': 'Coreia do Sul',
  'Korea Republic': 'Coreia do Sul',
  'Czech Republic': 'República Tcheca',
  Czechia: 'República Tcheca',
  Canada: 'Canadá',
  'Bosnia and Herzegovina': 'Bósnia',
  'Bosnia & Herzegovina': 'Bósnia',
  'Bosnia-Herzegovina': 'Bósnia',

  Qatar: 'Catar',
  Switzerland: 'Suíça',
  Brazil: 'Brasil',
  Morocco: 'Marrocos',
  Haiti: 'Haiti',
  Scotland: 'Escócia',
  'United States': 'Estados Unidos',
  USA: 'Estados Unidos',
  Paraguay: 'Paraguai',
  Australia: 'Austrália',
  Turkey: 'Turquia',
  Türkiye: 'Turquia',
  Germany: 'Alemanha',
  Curaçao: 'Curaçao',
  Curacao: 'Curaçao',
  'Ivory Coast': 'Costa do Marfim',
  "Cote d'Ivoire": 'Costa do Marfim',
  Ecuador: 'Equador',
  Netherlands: 'Holanda',
  Japan: 'Japão',
  Sweden: 'Suécia',
  Tunisia: 'Tunísia',
  Belgium: 'Bélgica',
  Egypt: 'Egito',
  Iran: 'Irã',
  'IR Iran': 'Irã',
  'New Zealand': 'Nova Zelândia',
  Spain: 'Espanha',
  'Cape Verde': 'Cabo Verde',
  'Cabo Verde': 'Cabo Verde',
  'Saudi Arabia': 'Arábia Saudita',
  Uruguay: 'Uruguai',
  France: 'França',
  Senegal: 'Senegal',
  Iraq: 'Iraque',
  Norway: 'Noruega',
  Argentina: 'Argentina',
  Algeria: 'Argélia',
  Austria: 'Áustria',
  Jordan: 'Jordânia',
  Portugal: 'Portugal',
  'DR Congo': 'RD Congo',
  'Congo DR': 'RD Congo',
  Uzbekistan: 'Uzbequistão',
  Colombia: 'Colômbia',
  England: 'Inglaterra',
  Croatia: 'Croácia',
  Ghana: 'Gana',
  Panama: 'Panamá',
}

const ptName = (en: string) => EN_TO_PT[en] ?? en

type Cached = { at: number; payload: unknown }
let cache: Cached | null = null
const TTL_MS = 60_000

type TsdbEvent = {
  idEvent: string
  strEvent?: string
  strHomeTeam: string
  strAwayTeam: string
  intHomeScore: string | null
  intAwayScore: string | null
  dateEvent: string // YYYY-MM-DD
  strTime?: string // HH:MM:SS UTC
  strTimestamp?: string // ISO UTC
  strStatus?: string
  strProgress?: string
  postponed?: string
}

const LIVE_STATUSES = new Set([
  '1H', '2H', 'HT', 'ET', 'IN_PLAY', 'In Play', 'Playing',
])

export const Route = createFileRoute('/api/public/wc-live')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const debug = url.searchParams.get('debug') === '1'
        const seasonParam = url.searchParams.get('season') ?? '2026'

        if (debug) {
          // Descobre se a liga 4429 tem dados desta temporada
          const r = await fetch(
            `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/eventsseason.php?id=${WC_LEAGUE_ID}&s=${seasonParam}`,
          )
          const data = await r.json()
          return Response.json({
            ok: r.ok,
            httpStatus: r.status,
            league: WC_LEAGUE_ID,
            season: seasonParam,
            eventCount: data.events?.length ?? 0,
            sample: data.events?.slice(0, 3) ?? null,
            raw: data.events ? undefined : data,
          })
        }

        const now = Date.now()
        if (cache && now - cache.at < TTL_MS) {
          return Response.json(cache.payload, {
            headers: { 'Cache-Control': 'public, max-age=30', 'X-Cache': 'HIT' },
          })
        }

        try {
          // 1) Pega todas as partidas da temporada
          const seasonRes = await fetch(
            `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/eventsseason.php?id=${WC_LEAGUE_ID}&s=${seasonParam}`,
          )
          const seasonData: { events?: TsdbEvent[] | null } = await seasonRes.json()
          const events: TsdbEvent[] = seasonData.events ?? []

          // 2) Pega jogos AO VIVO globais (livescore) para sobrescrever status/placar em tempo real
          let liveEvents: TsdbEvent[] = []
          try {
            const liveRes = await fetch(
              `https://www.thesportsdb.com/api/v2/json/livescore/soccer`,
              { headers: { 'X-API-KEY': TSDB_KEY } },
            )
            if (liveRes.ok) {
              const liveData: { livescore?: TsdbEvent[] | null } = await liveRes.json()
              liveEvents = (liveData.livescore ?? []).filter(
                (e: any) => e.idLeague === WC_LEAGUE_ID || e.strLeague === 'Soccer World Cup',
              )
            }
          } catch {
            // tier free pode não ter livescore — segue só com eventsseason
          }

          const liveById = new Map<string, TsdbEvent>()
          liveEvents.forEach((e) => liveById.set(e.idEvent, e))

          const matches = events.map((e) => {
            const live = liveById.get(e.idEvent)
            const src = live ?? e
            const status = (src.strStatus ?? src.strProgress ?? '').trim()

            // Data UTC -> Brasília (UTC-3)
            const ts = src.strTimestamp
              ? new Date(src.strTimestamp)
              : new Date(`${src.dateEvent}T${src.strTime ?? '00:00:00'}Z`)
            const brt = new Date(ts.getTime() - 3 * 3600_000)
            const dd = String(brt.getUTCDate()).padStart(2, '0')
            const mm = String(brt.getUTCMonth() + 1).padStart(2, '0')
            const hh = String(brt.getUTCHours()).padStart(2, '0')
            const mi = String(brt.getUTCMinutes()).padStart(2, '0')

            const hs = src.intHomeScore
            const as_ = src.intAwayScore
            const hasScore = hs !== null && hs !== '' && as_ !== null && as_ !== ''
            const isLive = !!live || LIVE_STATUSES.has(status)
            const isDone =
              status === 'Match Finished' ||
              status === 'FT' ||
              status === 'Finished' ||
              (!isLive && hasScore && !!e.dateEvent && new Date(e.dateEvent) < new Date())

            return {
              id: e.idEvent,
              d: `${dd}/${mm}`,
              time: isDone ? 'FIM' : isLive ? (status || 'AO VIVO') : `${hh}h${mi === '00' ? '' : mi}`,
              status: isDone ? 'FT' : isLive ? 'LIVE' : 'NS',
              h: ptName(e.strHomeTeam),
              a: ptName(e.strAwayTeam),
              hs: hasScore ? Number(hs) : '',
              as: hasScore ? Number(as_) : '',
            }
          })

          const payload = {
            updatedAt: new Date().toISOString(),
            source: 'TheSportsDB',
            league: WC_LEAGUE_ID,
            season: seasonParam,
            count: matches.length,
            matches,
          }
          cache = { at: now, payload }
          return Response.json(payload, {
            headers: { 'Cache-Control': 'public, max-age=30', 'X-Cache': 'MISS' },
          })
        } catch (e: any) {
          return Response.json(
            { error: 'Falha ao consultar TheSportsDB', detail: String(e?.message ?? e) },
            { status: 500 },
          )
        }
      },
    },
  },
})
