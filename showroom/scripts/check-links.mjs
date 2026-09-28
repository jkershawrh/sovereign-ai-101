#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../build/site')
async function files(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await files(p)); else out.push(p)
  }
  return out
}
const pages = (await files(root)).filter(p => p.endsWith('.html'))
assert.ok(pages.length >= 11, 'missing rendered journey')
let checked = 0
const errors = []
for (const page of pages) {
  const html = await readFile(page, 'utf8')
  if (path.relative(root, page).startsWith(`sovereign-ai-101${path.sep}`)) {
    for (const text of ['Implemented contract in this package', 'REHEARSAL evidence', 'Blocked live steps']) assert.ok(html.includes(text), `${page}: missing rendered ${text}`)
    assert.ok(!html.includes('class="xref unresolved"'), 'unresolved Antora xref')
  }
  for (const [, raw] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = raw.replaceAll('&amp;', '&')
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url) || url === '#') continue
    const [local, fragment] = url.split('#')
    const clean = decodeURIComponent(local.split('?')[0])
    let target = !clean ? page : clean.startsWith('/') ? path.join(root, clean.slice(1)) : path.resolve(path.dirname(page), clean)
    try {
      assert.ok(target === root || target.startsWith(root + path.sep), 'link outside build root')
      if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html')
      const data = await readFile(target, 'utf8')
      if (fragment && target.endsWith('.html')) {
        const id = decodeURIComponent(fragment)
        assert.ok([...data.matchAll(/\b(?:id|name)="([^"]+)"/g)].some(m => m[1] === id), `missing anchor ${id}`)
      }
      checked++
    } catch (error) { errors.push(`${path.relative(root, page)} → ${url}: ${error.message}`) }
  }
}
assert.deepEqual(errors, [], errors.join('\n'))
console.log(`Rendered links valid: ${pages.length} HTML pages, ${checked} local file/anchor references checked.`)
