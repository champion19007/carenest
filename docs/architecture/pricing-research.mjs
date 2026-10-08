// Read-only vendor pricing capture; no credentials or cloud account required.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const captured = { capturedAt: new Date().toISOString(), region: 'ap-south-1', services: [] }
for (const service of ['AmazonECS', 'AmazonRDS', 'AWSELB']) {
  const url = `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/${service}/current/ap-south-1/index.json`
  const cache = path.join(os.tmpdir(), `carenest-pricing-${service}.json`)
  const readFresh = async () => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${service}: HTTP ${response.status}`)
    const body = await response.text()
    await fs.writeFile(cache, body)
    return body
  }
  const j = JSON.parse(process.argv.includes('--cache') ? await fs.readFile(cache, 'utf8') : await readFresh())
  const rows = Object.values(j.products).filter(p => {
    const a = p.attributes
    if (service === 'AmazonECS') return a.usagetype.includes('Fargate') && !a.usagetype.includes('Windows')
    if (service === 'AWSELB') return a.operation === 'LoadBalancing:Application'
    return a.databaseEngine === 'PostgreSQL' && (['db.t4g.micro', 'db.t4g.small', 'db.t4g.large'].includes(a.instanceType) || a.volumeType === 'General Purpose-GP3')
  }).map(p => ({ sku: p.sku, attributes: p.attributes, rates: Object.values(j.terms.OnDemand[p.sku] ?? {}).flatMap(t => Object.values(t.priceDimensions)) }))
  captured.services.push({ service, url, publicationDate: j.publicationDate, rows })
}
await fs.writeFile(new URL('./aws-mumbai-price-capture.json', import.meta.url), JSON.stringify(captured, null, 2) + '\n')
for (const s of captured.services) console.log(`${s.service}: captured ${s.rows.length} regional products, published ${s.publicationDate}`)

if (process.argv.includes('--inspect-gcp')) {
  const html = await fs.readFile(path.join(os.tmpdir(), 'carenest-cloud-sql-pricing.html'), 'utf8')
  for (const term of ['asia-south1', '0.0413', '0.007', 'db-f1-micro']) {
    const all = [...html.matchAll(new RegExp(term.replaceAll('.', '\\.'), 'g'))]
    console.log(term, 'occurrences', all.length, 'last context', html.slice(all.at(-1)?.index - 180, all.at(-1)?.index + 550))
  }
}
