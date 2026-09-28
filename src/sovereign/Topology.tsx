import { questions } from './story'
export function Topology({ revealed = 4, active = -1, execution, rehearsal = false }: { revealed?: number; active?: number; execution?: number; rehearsal?: boolean }) {
  return <div className="so-topology" aria-label="Governed inference architecture">
    <div className="so-map-caption">{rehearsal ? 'SOURCE ARCHITECTURE · highlighted by rehearsal evidence, not traced service calls' : 'REVIEWED SOURCE ARCHITECTURE · deployment unverified'}</div>
    <div className="so-path">{questions.map((q, i) => <div key={q.title} className={`so-node ${i < revealed ? 'revealed' : 'concealed'} ${active === i ? 'selected' : ''}`} data-node={i}>
      {i < revealed ? <><span className="so-node-number">0{i + 1} / {q.title}{i === 2 && execution !== undefined ? execution ? ' · template dispatched' : ' · skipped' : ''}</span><strong>{q.objects}</strong><code>{q.protocol}</code><small>{q.boundary}</small></> : <span className="so-unrevealed">Next boundary</span>}
    </div>)}</div>
    {revealed === 4 && <div className="so-map-foot"><span>Inspect: GET /api/ledger + /api/ledger/verify → REST query/verify → gRPC</span><span>Human acceptance stays outside generation.</span></div>}
  </div>
}
