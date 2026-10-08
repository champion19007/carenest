// Parse official pricing-page JSON as data. Never execute vendor scripts.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const url = 'https://cloud.google.com/sql/pricing'
const cachePath = path.join(os.tmpdir(), 'carenest-cloud-sql-pricing.html')
const readFresh = async () => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.text()
  await fs.writeFile(cachePath, body)
  return body
}
const html = process.argv.includes('--cache') ? await fs.readFile(cachePath, 'utf8') : await readFresh()
const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.startsWith('AF_initDataCallback(') && s.includes('asia-south1'))
if (!source) throw new Error('Vendor page structure changed; update parser')
const data = JSON.parse(source.slice(source.indexOf('data:') + 5, source.lastIndexOf(', sideChannel:')))
function strings(n) { return typeof n === 'string' ? [n.replace(/<[^>]+>/g, '')] : Array.isArray(n) ? n.flatMap(strings) : [] }
const rows = []
function walk(node, context) {
  if (!Array.isArray(node)) return
  const direct = node.filter(x => typeof x === 'string' && x.length < 100)
  const nextContext = [...context, ...direct].filter(x => !x.startsWith('$')).slice(-12)
  if (node.includes('Mumbai (asia-south1)')) {
    const flat = strings(node)
    if (flat.some(x => x.includes('$'))) rows.push({ context, strings: flat.filter(x => !['Cloud SQL CUD - 1 Year', 'Cloud SQL CUD - 3 Year'].includes(x)) })
  }
  for (const child of node) walk(child, nextContext)
}
walk(data, [])
const capture = { capturedAt: new Date().toISOString(), url, region: 'asia-south1', note: 'Raw flattened regional pricing tables; distinguish edition, hourly/monthly, and CUD columns before using.', rows }
await fs.writeFile(new URL('./gcp-mumbai-sql-price-capture.json', import.meta.url), JSON.stringify(capture, null, 2) + '\n')
console.log(`Captured ${rows.length} Mumbai tables. Inspect edition/table context in gcp-mumbai-sql-price-capture.json before choosing rates.`)
