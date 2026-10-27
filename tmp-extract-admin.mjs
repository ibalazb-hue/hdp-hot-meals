import { readFileSync } from 'node:fs'
const s = readFileSync(new URL('./apps/web/dist/assets/index--AZZ1uH0.js', import.meta.url), 'utf8')
const start = s.indexOf('className:"grid gap-4"')
console.log('start', start)
console.log(s.slice(start, start + 6000))
