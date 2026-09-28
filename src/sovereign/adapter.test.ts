import { describe, expect, it, vi } from 'vitest'
import fixture from '../../public/fixtures/sovereign-rehearsal.json'
import { RehearsalAdapter, evidenceComplete, parseFixture, validateResponse, type Evidence } from './adapter'
const fresh = () => structuredClone(fixture)
const evidence = () => ({ ...parseFixture(fresh()).cases.general, origin: 'fixture', inspectedAt: new Date().toISOString() }) as Evidence

describe('rehearsal evidence contract', () => {
  it('validates the reviewed allow, deny and abstain fixtures without changing source or times', () => {
    const f = parseFixture(fresh())
    expect(Object.values(f.cases).map(x=>x.response.decision)).toEqual(['allow','deny','abstain'])
    expect(Object.values(f.cases).map(x=>x.response.model_dispatch_count)).toEqual([1,0,0])
    expect(JSON.stringify(f)).not.toContain('session_token')
  })
  it.each(['wrong-session','empty-chain','empty-ids','wrong-hash','missing-completion','duplicate-id','altered-content','invalid-chain','malformed-receipt'])('withholds a verified payoff for %s', variant => {
    const e = evidence()
    if(variant==='wrong-session') e.verification!.session_id='other'
    if(variant==='empty-chain') e.verification!.chains=[]
    if(variant==='empty-ids') e.verification!.matched_entry_ids=[]
    if(variant==='wrong-hash') e.receipts[0].entry_hash='0'.repeat(64)
    if(variant==='missing-completion') e.receipts.pop()
    if(variant==='duplicate-id') e.verification!.matched_entry_ids[1]=e.verification!.matched_entry_ids[0]
    if(variant==='altered-content') e.receipts[0].content.classification='sensitive-data'
    if(variant==='invalid-chain') e.verification!.chains[0].chain_valid=false
    if(variant==='malformed-receipt') e.receipts[0]=null as never
    expect(evidenceComplete(e)).toBe(false)
  })
  it('rejects LIVE claims, stale evidence and inconsistent HTTP decisions', () => {
    const f = parseFixture(fresh()), e=f.cases.general
    expect(()=>validateResponse({...e.response, source:'LIVE'}, f.session,e.request,200)).toThrow()
    expect(()=>validateResponse({...e.response, collected_at:'2000-01-01T00:00:00Z'}, f.session,e.request,200)).toThrow()
    expect(()=>validateResponse(e.response,f.session,e.request,403)).toThrow()
  })
  it('never substitutes fixture success for an unavailable service', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Unavailable'))
    const adapter = new RehearsalAdapter(fetcher)
    await expect(adapter.connect()).rejects.toThrow('Unavailable')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('accepts service HTTP 403 and 503 as decisions and preserves incomplete inspection', async () => {
    const f = parseFixture(fresh()), caseData=f.cases.injection
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path=String(url)
      let data: unknown = {}; let status=200
      if(path==='/api/sessions') { data={...f.session,session_token:'token'};status=201 }
      if(path==='/api/session/fault') data={source:'REHEARSAL',fault:'none'}
      if(path==='/api/route') { const request=JSON.parse(String(init?.body)); data={...caseData.response,request_id:request.request_id};status=403 }
      if(path.startsWith('/api/ledger')) { data={error:'unavailable'};status=503 }
      return new Response(JSON.stringify(data),{status})
    })
    const adapter=new RehearsalAdapter(fetcher)
    await adapter.connect()
    const result=await adapter.run('injection')
    expect(result.response.decision).toBe('deny')
    expect(result.evidenceError).toBeTruthy()
    expect(evidenceComplete(result)).toBe(false)
  })
})
