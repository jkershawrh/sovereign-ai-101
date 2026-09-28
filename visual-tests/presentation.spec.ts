import { expect, test, type Page } from '@playwright/test'
import { createApp } from '../server/http'
import type { AddressInfo } from 'node:net'

let server: ReturnType<typeof createApp>
let endpoint: string
test.beforeAll(async()=>{
  server=createApp()
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  endpoint=`http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
test.afterAll(async()=>{ await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())) })
async function service(page: Page) {
  await page.route('**/api/**', async route=>{
    const req=route.request(), url=new URL(req.url()), headers={...req.headers()}
    delete headers.origin;delete headers.host;delete headers['content-length']
    const response=await fetch(`${endpoint}${url.pathname}${url.search}`,{method:req.method(),headers,body:req.postData()??undefined})
    await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()})
  })
}
async function fits(page: Page) {
  const viewport=page.viewportSize()!
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
  if(viewport.width>900) {
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height)
    const overflow=await page.evaluate(()=>{
      const bottom=document.querySelector('.so-footer')!.getBoundingClientRect().top
      return [...document.querySelectorAll('.so-stage h1,.so-stage h2,.so-stage h3,.so-stage p,.so-stage button,.so-stage small,.so-stage code,.so-stage .so-detail-meta')]
        .filter(el=>el.getBoundingClientRect().bottom>bottom+1).map(el=>el.textContent?.slice(0,70))
    })
    expect(overflow).toEqual([])
  }
}
async function shot(page: Page, name: string) {
  await expect(page.locator('.so-stage')).toBeVisible()
  await page.evaluate(()=>document.fonts.ready)
  await fits(page)
  await expect(page).toHaveScreenshot(`${name}.png`,{fullPage:true,animations:'disabled',mask:[page.locator('[data-variable]')],maxDiffPixels:100})
}
test('every story reveal fits and preserves the sparse causal sequence',async({page})=>{
  for (const [scene,count] of [[0,3],[1,1],[2,8],[4,2],[5,1]]) {
    for(let step=0;step<count;step++) {
      await page.goto(`/?scene=${scene}&step=${step}`)
      await shot(page,`scene-${scene}-reveal-${step}`)
      if(scene===2) expect(await page.locator('.so-node.revealed').count()).toBe(Math.floor((step+1)/2))
    }
  }
})
test('service proof accumulates allow, deny, abstain and verified payoff',async({page})=>{
  await service(page)
  await page.goto('/?scene=3')
  await page.getByRole('button',{name:'Connect rehearsal service'}).click()
  await expect(page.getByRole('button',{name:'Run general prompt'})).toBeEnabled()
  for(const condition of ['general','injection']) {
    await page.getByRole('button',{name:`Run ${condition} prompt`}).click()
    await expect(page.locator('.so-detail')).toContainText('One synthetic input.')
    await expect(page.getByRole('button',{name:`Inspect ${condition==='general'?'General':'Injection'} evidence`})).toContainText('chains valid')
    for(let phase=0;phase<4;phase++) {
      if(phase) await page.getByRole('button',{name:'Next evidence boundary →'}).click()
      await shot(page,`${condition}-boundary-${phase}`)
    }
  }
  await expect(page.getByRole('button',{name:'Inspect General evidence'})).toContainText('allow')
  await expect(page.getByRole('button',{name:'Inspect Injection evidence'})).toContainText('deny')
  await page.getByRole('button',{name:'Go to policy'}).click()
  await page.getByRole('button',{name:'Run policy-unavailable condition'}).click()
  await expect(page.getByRole('button',{name:'Inspect Policy unavailable evidence'})).toContainText('abstain')
  await expect(page.getByRole('button',{name:'Inspect Policy unavailable evidence'})).toContainText('dispatches 0')
  await shot(page,'policy-abstained')
  await page.getByRole('button',{name:'Go to payoff'}).click()
  await expect(page.getByText('3 of 3 inspected conditions have matching verified receipts.')).toBeVisible()
  await shot(page,'payoff-service')
  await page.getByRole('button',{name:'Continue to the lab handoff →'}).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page).toHaveScreenshot('lab-handoff.png',{fullPage:true,maxDiffPixels:100})
  const downloadPromise=page.waitForEvent('download')
  await page.getByRole('button',{name:'Download lab handoff'}).click()
  const download=await downloadPromise
  expect(download.suggestedFilename()).toBe('sovereign-101-session-evidence.json')
  const stream=await download.createReadStream();let content='';for await(const chunk of stream!) content+=chunk.toString()
  const exported=JSON.parse(content)
  expect(Object.keys(exported.results)).toHaveLength(3)
  expect(content).not.toContain('session_token')
  expect(content).not.toContain('Bearer')
  await page.getByRole('button',{name:'Return to the evidence'}).click()
  await page.getByRole('button',{name:'Close presentation'}).click()
  await expect(page.getByText('Presentation closed')).toBeVisible()
  await shot(page,'closed')
})
test('offline stays unproven until explicitly selecting reviewed fixture',async({page})=>{
  await page.route('**/api/**',route=>route.abort())
  await page.goto('/?scene=3')
  await page.getByRole('button',{name:'Connect rehearsal service'}).click()
  await expect(page.getByRole('alert')).toContainText('Proof not run')
  await expect(page.locator('.so-connect')).toContainText('OFFLINE')
  await page.getByRole('button',{name:'Use reviewed fixture'}).click()
  await page.getByRole('button',{name:'Inspect general fixture'}).click()
  await expect(page.getByRole('button',{name:'Inspect General evidence'})).toContainText('REHEARSAL · recorded fixture')
  await page.getByRole('button',{name:'Go to payoff'}).click()
  await expect(page.getByText('1 of 1 inspected conditions have matching verified receipts.')).toBeVisible()
  await shot(page,'payoff-fixture')
  await page.reload()
  await expect(page.getByText('Proof not run.')).toBeVisible()
})
test('keyboard, history, reduced motion and touch preserve navigation',async({page})=>{
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button',{name:'Restart presentation'})).toBeFocused()
  await page.locator('body').click({position:{x:2,y:2}})
  await page.keyboard.press('Space')
  await expect(page.getByText('Who permitted it?')).toBeVisible()
  await page.goBack()
  await expect(page.getByText('A useful answer.')).toBeVisible()
  await page.locator('.so-stage').evaluate(el=>{
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,changedTouches:[new Touch({identifier:1,target:el,clientX:320,clientY:300})]}))
    el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[new Touch({identifier:1,target:el,clientX:100,clientY:300})]}))
  })
  await expect(page.getByText('Who permitted it?')).toBeVisible()
  expect(await page.locator('.so-opening').evaluate(el=>getComputedStyle(el).animationName)).toBe('none')
  await page.getByRole('button',{name:'Toggle presenter prompt'}).click()
  await expect(page.getByText('Presenter prompt')).toBeVisible()
})
