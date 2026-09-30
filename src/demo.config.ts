import type { DemoConfig } from './types'
import { brand, questions, scenes } from './sovereign/story'
// Catalog metadata for the six-scene story. App owns the connected session and internal reveal state.
export const demoConfig: DemoConfig = {
  id: 'sovereign-ai-101', title: 'Sovereign AI 101', subtitle: 'Verify local inference governance', brand,
  audience: 'Platform and AI engineers, security reviewers and technical decision makers', cta: 'Choose one workload for a bounded governance lab.',
  acts: [
    { id:'stakes', label:'01', title:'The decision', scenes:[
      { id:'opening', type:'quote', beat:'stakes', title:scenes[0].title, quote:'An answer, a decision and a record establish different things.' },
      { id:'reframe', type:'reframe', beat:'reframe', title:scenes[1].title, before:'A useful answer', after:'A governed request', detail:'Rules classify. Policy decides. Generation follows permission. Evidence supports a human decision.' },
    ] },
    { id:'architecture', label:'02', title:'The boundaries', scenes:[
      { id:'architecture', type:'guided-architecture', beat:'system-reveal', title:scenes[2].title, layers:questions.map((q,i)=>({id:String(i),question:q.question,answer:q.answer,component:q.objects,detail:q.detail})) },
    ] },
    { id:'proof', label:'03', title:'The evidence', scenes:[
      { id:'proof', type:'live-journey', beat:'live-proof', title:scenes[3].title, cta:'Connect rehearsal service', nodes:questions.map((q,i)=>({id:String(i),label:q.objects,detail:q.boundary})), steps:[
        {id:'general',title:'General',detail:'Allow then inspect exact receipts',adapterId:'sovereign-general',activeNode:3,resultFields:[]},
        {id:'injection',title:'Injection',detail:'Deny and retain both conditions',adapterId:'sovereign-injection',activeNode:1,resultFields:[]},
      ] },
      { id:'policy', type:'mechanisms', beat:'trials', title:scenes[4].title, mechanisms:[
        {id:'source',label:'Reviewed source',claim:'Policy unavailable continues',detail:'OPA error handling is fail-open; source ledger writes are best-effort.'},
        {id:'contract',label:'Rehearsal contract v1.0',claim:'Policy unavailable abstains',detail:'No dispatch without known permission and decision acknowledgment; no text without completion acknowledgment.'},
      ] },
    ] },
    { id:'payoff', label:'04', title:'The human decision', scenes:[
      { id:'payoff', type:'evidence-payoff', beat:'transformation', title:scenes[5].title,adapterIds:[],evidenceFields:[],fallbackLine:'Proof not run.',line1:'Inspect the current session.',line2:'Human acceptance remains separate.' },
    ] },
  ],
  journeyHandoffs:[{depth:'lab',title:'Sovereign AI 101 guided lab',duration:'30 minutes + 5 recovery',question:'What evidence does your workload need?',technology:'Classification · deterministic policy · exact receipts',instruction:'Execute four governed conditions, verify the evidence, record a decision, and clean up. Production qualification remains separate.'}],
}
