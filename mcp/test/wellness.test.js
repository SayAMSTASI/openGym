import { describe, it, expect } from 'vitest'
import { withRemoteState } from '../src/state.js'
import { WELLNESS_TOOLS } from '../src/wellness-tools.js'
import { connection, readRemoteProfile } from '../src/remote.js'
const food = { id: 'p', name: 'Протеин', kcal: 400, protein: 80, fat: 4, carbs: 11 }
const profile = id => ({ user: { id, name: id }, state: { workouts: [], bodyweight: [], nutritionLog: { a: { date: '2026-10-20', meal: 'lunch', food, grams: 100 } },
  supplementLog: { b: { date: '2026-10-20', status: 'taken', name: 'Протеин', time: '09:00', nutrition: { food, grams: 30 } } } }, meta: { readOnly: true, scope: 'profile:read' } })
const call = (name, args) => WELLNESS_TOOLS.find(t => t.name === name).handler(args)
describe('remote wellness tools', () => {
  it('uses UI nutrition arithmetic and reports missing days as unlogged', () => withRemoteState(profile('a'), () => {
    const result = call('get_nutrition', { from: '2026-10-19', to: '2026-10-20' })
    expect(result.logged_days).toBe(1); expect(result.daily[0].logged).toBe(false)
    expect(result.daily[1].totals).toEqual({ kcal: 520, protein: 104, fat: 5.2, carbs: 14.3 })
  }))
  it('isolates concurrent profiles without mutating a global state cache', async () => {
    const out = await Promise.all(['a', 'b'].map(id => withRemoteState(profile(id), async () => {
      await new Promise(resolve => setTimeout(resolve, id === 'a' ? 5 : 1))
      return call('get_profile_summary', { from: '2026-10-20', to: '2026-10-20' }).profile.id
    })))
    expect(out).toEqual(['a', 'b'])
  })
  it('rejects bad ranges and impossible dates through tool schemas', () => withRemoteState(profile('a'), () => {
    expect(() => call('get_nutrition', { from: '2026-01-01', to: '2026-12-01' })).toThrow('31 days')
    const schema = WELLNESS_TOOLS.find(t => t.name === 'get_nutrition').schema
    expect(schema.from.safeParse('2026-02-30').success).toBe(false)
  }))
  it('requires a dedicated key and TLS away from localhost', () => {
    expect(connection({})).toBeNull()
    expect(() => connection({ OPENGYM_URL: 'http://public.example.com', OPENGYM_READ_TOKEN: 'gym_ro_' + 'a'.repeat(43) })).toThrow('HTTPS')
    expect(() => connection({ OPENGYM_URL: 'https://example.com', OPENGYM_READ_TOKEN: 'session' })).toThrow('dedicated')
  })
  it('marks truncated intake history instead of silently presenting it as complete', () => {
    const fixture = profile('a')
    fixture.state.supplementLog = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [String(i), { date: '2026-10-20', status: 'taken', name: 'fixture' }]))
    withRemoteState(fixture, () => {
      const result = call('get_supplements', { from: '2026-10-20', to: '2026-10-20' })
      expect(result.recorded).toHaveLength(2000)
      expect(result.recorded_truncated).toBe(true)
      expect(result.planned_truncated).toBe(false)
    })
  })
  it('uses a fixed authenticated endpoint with no redirects and refuses revoked keys', async () => {
    const config = { url: 'http://localhost:18081', token: 'gym_ro_' + 'a'.repeat(43) }
    const result = await readRemoteProfile(config, async (url, opts) => {
      expect(url).toBe(config.url + '/api/integrations/profile'); expect(opts.redirect).toBe('error')
      return new Response(JSON.stringify(profile('a')))
    })
    expect(result.user.id).toBe('a')
    await expect(readRemoteProfile(config, async () => new Response('', { status: 401 }))).rejects.toThrow('revoked')
  })
})
