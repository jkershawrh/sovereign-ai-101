import { useCallback, useEffect, useRef, useState } from 'react'
import { BrandLockup } from './components/BrandLockup'
import { brand, cases, questions, scenes, sourceRevision, type CaseId } from './sovereign/story'
import { RehearsalAdapter, evidenceComplete, type Evidence, type SafeSession } from './sovereign/adapter'
import { Topology } from './sovereign/Topology'
import { EvidenceCard, EvidenceDetail } from './sovereign/EvidenceView'
import './sovereign/presentation.css'

type Position = { scene: number; step: number; closed?: boolean }
function readPosition(): Position {
  const p = new URLSearchParams(location.search)
  const legacy = p.has('act') ? [[0,1],[2],[3,4],[5]][Number(p.get('act'))]?.[Number(p.get('scene') ?? 0)] : undefined
  const n = legacy ?? Number(p.get('scene') ?? 0)
  const scene = Number.isInteger(n) && n >= 0 && n < scenes.length ? n : 0
  const rawStep = Number(p.get('step') ?? 0)
  return { scene, step: Number.isInteger(rawStep) ? Math.max(0, Math.min(rawStep, scenes[scene].reveals - 1)) : 0, closed: p.get('closed') === '1' }
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export default function App() {
  const [position, setPosition] = useState(readPosition)
  const [presenter, setPresenter] = useState(false)
  const [session, setSession] = useState<SafeSession>()
  const [origin, setOrigin] = useState<'service' | 'fixture'>('service')
  const [results, setResults] = useState<Partial<Record<CaseId, Evidence>>>({})
  const [selected, setSelected] = useState<CaseId>('general')
  const [phase, setPhase] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [handoff, setHandoff] = useState(false)
  const [cleanup, setCleanup] = useState('')
  const adapter = useRef<RehearsalAdapter | null>(null)
  if (!adapter.current) adapter.current = new RehearsalAdapter()
  const controller = useRef<AbortController | null>(null)
  const lock = useRef(false)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const scene = scenes[position.scene]
  const navigate = useCallback((next: Position) => {
    setPosition(next); setHandoff(false)
    const p = new URLSearchParams({ scene: String(next.scene), step: String(next.step) })
    if (next.closed) p.set('closed', '1')
    history.pushState(null, '', `?${p}`)
  }, [])
  const next = useCallback(() => {
    if (position.closed || handoff) return
    if (position.step < scene.reveals - 1) navigate({ ...position, step: position.step + 1 })
    else if (position.scene < scenes.length - 1) navigate({ scene: position.scene + 1, step: 0 })
  }, [position, scene.reveals, navigate, handoff])
  const previous = useCallback(() => {
    if (position.closed) return navigate({ scene: 5, step: 0 })
    if (position.step > 0) navigate({ ...position, step: position.step - 1 })
    else if (position.scene > 0) navigate({ scene: position.scene - 1, step: scenes[position.scene - 1].reveals - 1 })
  }, [position, navigate])
  const fullscreen = () => { void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch(() => {}) }
  useEffect(() => {
    const pop = () => { setPosition(readPosition()); setHandoff(false) }
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('button,a,input,select,textarea,[role="dialog"]')) return
      if (['ArrowRight','PageDown',' '].includes(event.key)) { event.preventDefault(); next() }
      if (['ArrowLeft','PageUp'].includes(event.key)) { event.preventDefault(); previous() }
      if (event.key.toLowerCase() === 'p') setPresenter(v => !v)
      if (event.key.toLowerCase() === 'f') fullscreen()
      if (event.key === 'Home') navigate({ scene: 0, step: 0 })
      if (event.key === 'Escape') setHandoff(false)
    }
    window.addEventListener('popstate', pop); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('keydown', key) }
  }, [next, previous, navigate])
  useEffect(() => () => { controller.current?.abort() }, [])
  async function task(action: (signal: AbortSignal) => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); controller.current = new AbortController()
    try { await action(controller.current.signal) } catch (e) { setError(e instanceof Error ? e.message : 'Service unavailable. Proof not run.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function connect(fixture: boolean) {
    await task(async signal => {
      if (session) await adapter.current!.close()
      const safe = fixture ? await adapter.current!.loadFixture(signal) : await adapter.current!.connect(signal)
      setSession(safe); setOrigin(fixture ? 'fixture' : 'service'); setResults({}); setPhase(0)
      if (safe.source === 'OFFLINE') setError('OFFLINE — proof not run. Live dependencies are unimplemented.')
    })
  }
  async function run(id: CaseId) {
    await task(async signal => { const evidence = await adapter.current!.run(id, signal); setResults(r => ({ ...r, [id]: evidence })); setSelected(id); setPhase(0) })
  }
  const exportContext = () => download({ schema: 'sovereign-101-handoff/v1', source_revision: sourceRevision,
    source_dirty: 'ledger submodule modified; excluded from reviewed evidence', session, origin, results,
    inspected_at: new Date().toISOString(), live_qualified: false,
    unresolved_gaps: ['Local OVMS/model artifacts, Intel CPU and OpenShift identities unverified', 'Source adapter fail-open and best-effort ledger behavior remains', 'Unsigned rehearsal receipts do not prove truth, completeness or legal compliance', 'G01–G10 lab seat qualification pending'],
    lab: { duration_minutes: 36, recovery_minutes: 4, readiness: 'instructor-led inspection only', path: 'showroom/build/site/sovereign-ai-101/index.html', next: 'Allocate fresh learner session and request IDs; use presentation evidence as context only.' },
  }, 'sovereign-101-session-evidence.json')
  async function close() {
    if (lock.current) return
    await task(async () => { const removed = await adapter.current!.close(); setSession(undefined); setCleanup(removed ? 'Rehearsal session cleared. Downloaded evidence remains yours.' : 'Local credentials cleared. Server cleanup was not confirmed; the session expires automatically.'); navigate({ scene: 5, step: 0, closed: true }) })
  }
  const current = results[selected]
  const proofCards = <div className="so-evidence-grid">{(Object.keys(cases) as CaseId[]).map(id => <EvidenceCard key={id} id={id} evidence={results[id]} selected={selected === id} onSelect={() => { setSelected(id); setPhase(0) }} />)}</div>
  const connection = <div className="so-connect"><span className="so-tag">{session?.source ?? (error ? 'OFFLINE' : 'NOT CONNECTED')}{session ? ` · ${origin === 'fixture' ? 'recorded fixture' : 'service'}` : ''}</span>{(!session || session.source === 'OFFLINE') && <><button className="so-primary" disabled={busy} onClick={() => connect(false)}>Connect rehearsal service</button><button disabled={busy} onClick={() => connect(true)}>Use reviewed fixture</button></>}<span>No live model or platform qualification.</span>{Object.keys(results).length > 0 && <button onClick={exportContext}>Save session evidence</button>}</div>
  return <div className="so-app">
    <header className="so-header" inert={handoff}><button className="so-brand" aria-label="Restart presentation" onClick={() => navigate({ scene: 0, step: 0 })}><BrandLockup brand={brand} compact /></button><span className="so-header-title">SOVEREIGN AI / 101</span><nav aria-label="Presentation navigation"><button aria-label="Previous reveal" onClick={previous}>←</button>{scenes.map((s,i) => <button key={s.id} className={`so-dot ${position.scene === i ? 'active' : ''}`} aria-label={`Go to ${s.id}`} aria-current={position.scene === i ? 'step' : undefined} onClick={() => navigate({ scene: i, step: 0 })}>{i+1}</button>)}<button aria-label="Next reveal" onClick={next}>→</button><button aria-label="Toggle presenter prompt" aria-pressed={presenter} onClick={() => setPresenter(v => !v)}>P</button><button aria-label="Toggle fullscreen" onClick={fullscreen}>⛶</button></nav></header>
    <main inert={handoff} className={`so-stage so-scene-${position.scene}`} data-scene={scene.id} data-step={position.step}
      onClick={e => { if (!(e.target as Element).closest('button,a,details,dialog,[data-interactive]')) next() }}
      onTouchStart={e => { if (!(e.target as Element).closest('button,a,[data-interactive]')) touch.current = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY } }}
      onTouchEnd={e => { if (touch.current) { const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y; if (Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.5) dx<0 ? next() : previous(); touch.current=null } }}>
      {position.closed ? <section className="so-close"><span className="so-eyebrow">Presentation closed</span><h1>The next decision<br/>belongs to you.</h1><p>{cleanup || 'No proof has been run by opening this link.'}</p><p>Cleanup covers in-memory rehearsal state only; platform teardown is unverified.</p><button onClick={() => { setResults({}); navigate({ scene: 0, step: 0 }) }}>Restart story</button></section> : <>
      <div className="so-heading"><span className="so-eyebrow">{['01 / The stakes','02 / The reframe','03 / The architecture','04 / The proof','05 / The tradeoff','06 / The decision'][position.scene]}</span>{position.scene > 1 && <h1>{scene.title}</h1>}</div>
      {position.scene === 0 && <section className="so-opening" key={position.step}><div className="so-huge">{['A useful answer.','Who permitted it?','What can you prove?'][position.step]}</div><p>{['It sounds right. That is where the questions begin.','Generated text does not explain the governing rule.','An answer, a decision and a record establish different things.'][position.step]}</p><div className="so-opening-trail">{['Answer','Decision','Evidence'].slice(0, position.step+1).map((t,i) => <span key={t} className={i===position.step?'active':''}>{t}</span>)}</div><button className="so-text-button" onClick={next}>Click or press space to continue →</button></section>}
      {position.scene === 1 && <section className="so-reframe"><h1>Verify<br/><em>one request.</em></h1><div><p>Before expanding the claim,<br/>separate the responsibilities.</p><ol><li><strong>Policy</strong> decides permission.</li><li><strong>Granite</strong> generates text.</li><li><strong>Ledger</strong> preserves evidence.</li><li><strong>People</strong> accept the claim.</li></ol><span className="so-small">Choose one workload for a bounded governance lab.</span></div></section>}
      {position.scene === 2 && <section className="so-architecture"><div className="so-question"><span className="so-label">Question {Math.floor(position.step/2)+1} / 4</span><h2>{questions[Math.floor(position.step/2)].question}</h2>{position.step%2 ? <><h3>{questions[Math.floor(position.step/2)].answer}</h3><p>{questions[Math.floor(position.step/2)].detail}</p><span className="so-small">{questions[Math.floor(position.step/2)].source} · reviewed source, not a deployment observation</span></> : <p className="so-pause">Pause here. Let the room answer.</p>}<button className="so-primary" onClick={next}>{position.step%2 ? position.step===7?'Carry this path into proof →':'Ask next question →':'Reveal the boundary'}</button></div><Topology revealed={Math.floor((position.step+1)/2)} active={position.step%2 ? Math.floor(position.step/2) : -1}/></section>}
      {position.scene === 3 && <section className="so-proof">{connection}<Topology rehearsal active={current ? phase : -1} execution={current?.response.model_dispatch_count}/>{proofCards}<div className="so-proof-bottom">{current ? <EvidenceDetail evidence={current} phase={phase}/> : <div className="so-detail"><span className="so-label">Start with a general prompt</span><h3>First allow. Then challenge the boundary.</h3><p>“{cases.general.prompt}”</p><small>The service runs deterministic templates and in-memory receipts. The recorded fixture is a separate, explicitly chosen rehearsal.</small></div>}<div className="so-run-controls"><button className="so-primary" disabled={busy || !session || session.source==='OFFLINE' || !!results.general} onClick={() => run('general')}>{origin === 'fixture' ? 'Inspect general fixture' : 'Run general prompt'}</button><button disabled={busy || !results.general || !!results.injection} onClick={() => run('injection')}>{origin === 'fixture' ? 'Inspect injection fixture' : 'Run injection prompt'}</button>{current && <><button disabled={phase===0} onClick={() => setPhase(p => Math.max(0,p-1))}>← Previous boundary</button><button disabled={phase===3} onClick={() => setPhase(p => Math.min(3,p+1))}>Next evidence boundary →</button></>}</div></div></section>}
      {position.scene === 4 && <section className="so-policy"><div className="so-tradeoff"><article><span className="so-label">REVIEWED SOURCE · E02 / B01</span><h2>OPA unavailable?<br/><em>Continues.</em></h2><p>The original adapter fails open on an OPA error or missing result. Rego’s default deny cannot repair caller error handling.</p><small>Source ledger writes are best-effort. A routed_local event is written before generation.</small></article><article><span className="so-label">REHEARSAL CONTRACT v1.0</span><h2>OPA unavailable?<br/><em>Abstains.</em></h2><p>Unknown permission withholds dispatch. Acknowledged decision and completion receipts gate the template response.</p><small>This demonstrates the new contract. The source lab has not been hardened by this presentation.</small></article></div>{position.step === 0 ? <div className="so-policy-action">{connection}<button className="so-primary" disabled={busy || !session || session.source==='OFFLINE' || !!results.outage} onClick={() => run('outage')}>{origin==='fixture'?'Inspect policy-unavailable fixture':'Run policy-unavailable condition'}</button>{results.outage && <EvidenceCard id="outage" evidence={results.outage}/>}<button onClick={next}>Explain the mechanism →</button></div> : <div className="so-mechanism"><h3>Permission → acknowledged receipt → generation → completion receipt.</h3><p>Unknown policy stops the rehearsal path before generation. Missing completion evidence withholds text. Model output grants no authority.</p><small>Separate source policy test: sensitive_personal + local → true; us-east-1 → false (E03). This endpoint is absent from the rehearsal service; these are source expectations, not session results or observed egress blocking.</small></div>}</section>}
      {position.scene === 5 && <section className="so-payoff"><div className="so-payoff-statement">{Object.keys(results).length ? `${Object.values(results).filter(e => e && evidenceComplete(e)).length} of ${Object.keys(results).length} inspected conditions have matching verified receipts.` : 'Proof not run.'}<span>{Object.keys(results).length ? `REHEARSAL · ${origin==='fixture'?'recorded fixtures inspected in this session':'responses collected from this session’s service'}` : 'No current-session evidence supports an outcome yet.'}</span></div>{proofCards}<div className="so-payoff-lower"><div><h3>Still unproven</h3><p>Local Granite / OVMS execution, Intel CPU placement, OpenShift identity, geographic residency and production readiness.</p><small>Unsigned chains do not establish truth, completeness or compliance. The human reviewer owns acceptance.</small></div><div className="so-handoff"><span className="so-label">ONE NEXT STEP</span><h3>Bring one workload into the lab.</h3><p>36 minutes + 4 for recovery · G01–G10 qualification pending. Instructor-led inspection until a seat is qualified.</p><button className="so-primary" onClick={() => setHandoff(true)}>Continue to the lab handoff →</button></div></div><div className="so-final-actions"><button disabled={busy} onClick={close}>Close presentation</button><button className="so-text-button" onClick={() => navigate({ scene:0,step:0 })}>Restart story</button></div></section>}
      {busy && <div className="so-status" role="status">Working with the rehearsal service…</div>}{error && <div className="so-error" role="alert">{error} {Object.keys(results).length ? 'Earlier evidence is retained.' : 'Proof not run.'}</div>}
      </>}
    </main><footer className="so-footer" inert={handoff}><span>Source-backed governance · sovereignty remains a question</span><span>{position.scene+1} / 6 · {position.step+1} / {scene.reveals} · 6½ MIN</span></footer>
    {presenter && <aside className="so-presenter"><strong>Presenter prompt</strong><span>{scene.prompt}</span><button onClick={() => setPresenter(false)}>Hide prompt</button></aside>}
    {handoff && <dialog open aria-modal="true" className="so-dialog" aria-labelledby="handoff-title" onKeyDown={e => { if (e.key==='Escape') setHandoff(false); if (e.key==='Tab') { const buttons = e.currentTarget.querySelectorAll('button'); if (!e.shiftKey && document.activeElement===buttons[buttons.length-1]) { e.preventDefault(); buttons[0].focus() } else if (e.shiftKey && document.activeElement===buttons[0]) { e.preventDefault(); buttons[buttons.length-1].focus() } } }}><span className="so-eyebrow">Guided lab handoff · not a qualified seat</span><h2 id="handoff-title">Continue from this evidence.</h2><p>Save the session context for the instructor. Use the bundled Sovereign AI 101 Showroom guide: preflight → general and sensitive allow → injection deny → policy-unavailable abstain → correlate → explain authority → cleanup.</p><p>Start with fresh learner IDs and baseline receipts. Presentation records provide context; they are not learner completion evidence.</p><small>36 minutes + 4 recovery. Live seat release remains gated by G01–G10.</small><div><button autoFocus className="so-primary" onClick={exportContext}>Download lab handoff</button><button onClick={() => setHandoff(false)}>Return to the evidence</button></div></dialog>}
  </div>
}
