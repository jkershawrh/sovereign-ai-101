import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { demoConfig } from '../demo.config'
import { SceneRenderer } from './SceneRenderer'
import { scenes } from '../sovereign/story'
describe('story catalog',()=>{
  for(const scene of demoConfig.acts.flatMap(a=>a.scenes)) it(`renders ${scene.id}`,()=>{
    const {container}=render(<SceneRenderer scene={scene} brand={demoConfig.brand}/>);expect(container.querySelector('.scene')).toBeInTheDocument()
  })
  it('keeps the approved six-scene, 390-second arc',()=>{
    expect(demoConfig.acts.flatMap(a=>a.scenes)).toHaveLength(6)
    expect(scenes.reduce((sum,s)=>sum+s.seconds,0)).toBe(390)
    expect(demoConfig.journeyHandoffs).toHaveLength(1)
  })
})
