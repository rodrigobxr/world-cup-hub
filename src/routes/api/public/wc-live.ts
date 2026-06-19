import { createFileRoute } from '@tanstack/react-router'

const ESPN_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200'

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
  "Côte d'Ivoire": 'Costa do Marfim',
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

const jsonHeaders = {
  'Cache-Control': 'public, max-age=30',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
}

type Cached = { at: number; payload: unknown }
let cache: Cached | null = null
const TTL_MS = 60_000

type EspnCompetitor = {
  homeAway: 'home' | 'away'
  score?: string
  team: { id: string; displayName: string; shortDisplayName?: string }
}

type EspnDetail = {
  scoringPlay?: boolean
  ownGoal?: boolean
  penaltyKick?: boolean
  shootout?: boolean
  clock?: { displayValue?: string }
  team?: { id: string }
  athletesInvolved?: { displayName?: string; shortName?: string; team?: { id: string } }[]
}

type EspnEvent = {
  id: string
  date: string
  competitions: {
    competitors: EspnCompetitor[]
    status: { type: { state?: string; completed?: boolean; name?: string; shortDetail?: string; detail?: string } }
    details?: EspnDetail[]
  }[]
}

function toBrasiliaDateTime(iso: string) {
  const utc = new Date(iso)
  const brt = new Date(utc.getTime() - 3 * 3600_000)
  const dd = String(brt.getUTCDate()).padStart(2, '0')
  const mm = String(brt.getUTCMonth() + 1).padStart(2, '0')
  const hh = String(brt.getUTCHours()).padStart(2, '0')
  const mi = String(brt.getUTCMinutes()).padStart(2, '0')
  return { d: `${dd}/${mm}`, time: `${hh}h${mi === '00' ? '' : mi}` }
}

function formatGoal(detail: EspnDetail) {
  const athlete = detail.athletesInvolved?.[0]
  const name = athlete?.displayName || athlete?.shortName || 'Gol'
  const minute = detail.clock?.displayValue ? ` ${detail.clock.displayValue}` : ''
  const suffix = detail.ownGoal ? ' (contra)' : detail.penaltyKick ? ' (pên.)' : ''
  return `${name}${suffix}${minute}`.trim()
}

function convertEspnEvent(event: EspnEvent) {
  const competition = event.competitions?.[0]
  const home = competition?.competitors?.find((c) => c.homeAway === 'home')
  const away = competition?.competitors?.find((c) => c.homeAway === 'away')
  if (!competition || !home || !away) return null

  const { d, time } = toBrasiliaDateTime(event.date)
  const state = competition.status?.type?.state
  const completed = competition.status?.type?.completed || state === 'post'
  const status = completed ? 'FT' : state === 'in' ? 'LIVE' : 'NS'
  const goals = { h: [] as string[], a: [] as string[] }

  ;(competition.details ?? [])
    .filter((detail) => detail.scoringPlay && !detail.shootout)
    .forEach((detail) => {
      const scoringTeamId = detail.team?.id
      const goal = formatGoal(detail)
      if (scoringTeamId === home.team.id) goals.h.push(goal)
      else if (scoringTeamId === away.team.id) goals.a.push(goal)
    })

  return {
    id: event.id,
    d,
    time: completed ? 'FIM' : status === 'LIVE' ? (competition.status?.type?.shortDetail || 'AO VIVO') : time,
    status,
    h: ptName(home.team.displayName),
    a: ptName(away.team.displayName),
    hs: home.score !== undefined && home.score !== '' ? Number(home.score) : '',
    as: away.score !== undefined && away.score !== '' ? Number(away.score) : '',
    goals,
  }
}

export const Route = createFileRoute('/api/public/wc-live')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: jsonHeaders }),
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const debug = url.searchParams.get('debug') === '1'

        const now = Date.now()
        if (!debug && cache && now - cache.at < TTL_MS) {
          return Response.json(cache.payload, {
            headers: { ...jsonHeaders, 'X-Cache': 'HIT' },
          })
        }

        try {
          const espnRes = await fetch(ESPN_SCOREBOARD_URL, {
            headers: { Accept: 'application/json', 'User-Agent': 'RodrigaoCopa/1.0' },
          })
          if (!espnRes.ok) throw new Error(`ESPN HTTP ${espnRes.status}`)

          const espnData: { events?: EspnEvent[]; leagues?: unknown[] } = await espnRes.json()
          const matches = (espnData.events ?? []).map(convertEspnEvent).filter(Boolean)

          const payload = {
            updatedAt: new Date().toISOString(),
            source: 'ESPN public scoreboard',
            league: 'fifa.world',
            season: '2026',
            count: matches.length,
            matches,
          }
          if (!debug) cache = { at: now, payload }
          if (debug) {
            return Response.json(
              { ok: true, httpStatus: espnRes.status, eventCount: matches.length, sample: matches.slice(0, 5) },
              { headers: { ...jsonHeaders, 'X-Cache': 'BYPASS' } },
            )
          }
          return Response.json(payload, {
            headers: { ...jsonHeaders, 'X-Cache': 'MISS' },
          })
        } catch (e: any) {
          return Response.json(
            { error: 'Falha ao consultar ESPN pública', detail: String(e?.message ?? e) },
            { status: 500, headers: jsonHeaders },
          )
        }
      },
    },
  },
})
