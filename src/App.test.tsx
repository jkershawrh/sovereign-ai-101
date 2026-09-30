import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import fixture from '../public/fixtures/sovereign-rehearsal.json'
beforeEach(()=>window.history.replaceState(null,'','/'))
afterEach(()=>vi.unstubAllGlobals())
describe('Sovereign presentation',()=>{
  it('advances opening internal reveals before changing scenes',()=>{
    render(<App/>);expect(screen.getByText('The answer sounds useful.')).toBeInTheDocument()
    fireEvent.keyDown(window,{key:' '});expect(screen.getByText('Was it permitted?')).toBeInTheDocument()
    fireEvent.keyDown(window,{key:' '});expect(screen.getByText('Can you prove it?')).toBeInTheDocument()
    expect(new URLSearchParams(location.search).get('scene')).toBe('0')
  })
  it('asks first, reveals only earned boundaries, and supports legacy links',()=>{
    history.replaceState(null,'','/?act=1&scene=0');render(<App/>)
    expect(screen.getByText('Who receives the prompt?')).toBeInTheDocument()
    expect(screen.queryByText('Demo API → GCL prompt adapter')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Reveal the boundary'}))
    expect(screen.getByText('Demo API → GCL prompt adapter')).toBeInTheDocument()
    expect(screen.queryByText('GCL RuleEngine → OPA')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Ask next question →'}))
    expect(screen.getByText('Who decides whether it proceeds?')).toBeInTheDocument()
  })
  it('does not hijack space on focused buttons or advance a clicked control',()=>{
    render(<App/>);const toggle=screen.getByRole('button',{name:'Toggle presenter prompt'})
    fireEvent.keyDown(toggle,{key:' '});expect(screen.getByText('The answer sounds useful.')).toBeInTheDocument()
    fireEvent.click(toggle);expect(screen.getByText('Presenter prompt')).toBeInTheDocument()
    expect(screen.getByText('The answer sounds useful.')).toBeInTheDocument()
  })
  it('clamps malformed deep links and exposes fullscreen',()=>{
    history.replaceState(null,'','/?scene=NaN&step=-20')
    Object.defineProperty(document.documentElement,'requestFullscreen',{value:vi.fn(),configurable:true})
    render(<App/>);expect(screen.getByText('The answer sounds useful.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Toggle fullscreen'}))
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled()
  })
  it('shows proof not run on direct payoff navigation',()=>{
    history.replaceState(null,'','/?scene=5');render(<App/>)
    expect(screen.getByText('Proof not run.')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Close presentation'})).toBeInTheDocument()
  })
  it('retains both fixture outcomes across scenes and never implies Granite ran',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture))))
    history.replaceState(null,'','/?scene=3');render(<App/>)
    fireEvent.click(screen.getByRole('button',{name:'Use reviewed fixture'}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'Inspect general fixture'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:'Inspect general fixture'}))
    await screen.findByText('allow')
    fireEvent.click(screen.getByRole('button',{name:'Inspect injection fixture'}))
    await screen.findByText('deny')
    expect(screen.getByText('allow')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Go to payoff'}))
    expect(screen.getByText('2 of 2 inspected conditions have matching verified receipts.')).toBeInTheDocument()
    expect(screen.getByText(/recorded fixtures inspected in this session/)).toBeInTheDocument()
  })
})
