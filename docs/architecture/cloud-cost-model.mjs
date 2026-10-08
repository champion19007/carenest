// Offline planning model. Reads captured public rates; never creates cloud resources.
// Edit workloads to explore scenarios. No free credits, tax or third-party charges included.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
const root = new URL('./', import.meta.url)
const aws = JSON.parse(await fs.readFile(new URL('aws-mumbai-price-capture.json', root)))
const gcp = JSON.parse(await fs.readFile(new URL('gcp-mumbai-sql-price-capture.json', root)))
const hours = 730
const seconds = hours * 3600
const dispatchRequests = hours * 60
const allowance = { pilot: 10, production: 40 }
const workloads = {
  pilot: { requests: 100_000, deliveries: 2_000, minInstances: 0 },
  production: { requests: 1_000_000, deliveries: 20_000, minInstances: 1 },
  growthSensitivity: { requests: 5_000_000, deliveries: 100_000, minInstances: 1 },
}
const assumptions = {
  hoursPerMonth: hours, regionAWS: 'ap-south-1', regionGCP: 'asia-south1',
  meanWebDurationSeconds: 0.3, effectiveBilledConcurrency: 1,
  workerSecondsPerDelivery: 2, dispatcherSecondsPerInvocation: 1,
  dispatchInvocationsPerMonth: dispatchRequests, awsAverageLCU: 0.25,
  awsProductionPublicIPv4Count: 5, freeCreditsIncluded: false,
  pilotMiscAllowanceUSD: allowance.pilot, productionMiscAllowanceUSD: allowance.production,
  excluded: ['tax', 'FX conversion', 'SMS/WhatsApp/email plans', 'Zoom/Workspace subscriptions',
    'payment fees', 'people/support/legal', 'large media/recording', 'extra NAT gateways',
    'backup/egress/log volume beyond allowances', 'database resize/CPU credits'],
  caution: 'Model, not a quote or capacity benchmark. Misc allowances are not vendor-priced line items. Growth keeps database size fixed only to isolate web sensitivity.',
}
function awsRate(sku) {
  const product = aws.services.flatMap(s => s.rows).find(r => r.sku === sku)
  assert(product, `Missing AWS SKU ${sku}`)
  const rates = product.rates.map(r => Number(r.pricePerUnit.USD))
  assert(rates.length === 1 && rates[0] > 0, `Ambiguous AWS rate ${sku}`)
  return rates[0]
}
function rdsRate(size, deployment) {
  const products = aws.services.find(s => s.service === 'AmazonRDS').rows
    .filter(r => r.attributes.instanceType === size && r.attributes.deploymentOption === deployment)
  assert(products.length === 1, `Ambiguous RDS ${size}/${deployment}`)
  return awsRate(products[0].sku)
}
function table(context, unit) {
  const candidates = gcp.rows.filter(r => r.context.includes('mysql-and-postgresql-pricing-1')
    && r.context.includes(context) && r.strings.some(s => s.startsWith('$') && s.includes(unit)))
  // Page also contains a repeated table with CUD columns. Select the compact list-price table.
  const shortest = Math.min(...candidates.map(r => r.strings.length))
  const listPriceTables = candidates.filter(r => r.strings.length === shortest)
  assert(listPriceTables.length === 1, `Ambiguous GCP ${context}/${unit}`)
  return listPriceTables[0].strings
}
function gcpRate(strings, label) {
  const index = strings.indexOf(label)
  assert(index >= 0, `Missing GCP label ${label}`)
  const value = strings.slice(index + 1).find(s => s.startsWith('$'))
  assert(value, `Missing price for ${label}`)
  return Number(value.match(/^\$([\d.]+)/)[1])
}
const sql = table('enterprise-edition---general-purpose-machine-series', 'hour')
const storage = table('storage', 'month')
const haStorage = table('ha-storage', 'month')
// Shared-core rows use a separate section name. Select PostgreSQL hourly table explicitly.
const sharedCandidates = gcp.rows.filter(r => r.context.includes('mysql-and-postgresql-pricing-1')
  && r.strings.includes('db-g1-small*') && r.strings.some(s => s.startsWith('$') && s.includes('hour')))
assert(sharedCandidates.length === 1, 'Missing/ambiguous GCP shared-core hourly table')
const units = {
  awsCPU: awsRate('KV4FGA39G96M59TH'), awsGBHour: awsRate('N4Q5MGA6V9TFA2MG'),
  awsArmCPU: awsRate('D8HH737U8NPWA5K7'), awsArmGBHour: awsRate('2FMN22NTTSFVP7KR'),
  awsALBHour: awsRate('WJ2MHASNP2ZNKFXX'), awsLCUHour: awsRate('HFFD75W4GFXQPHZR'),
  awsRDSMicroHour: rdsRate('db.t4g.micro', 'Single-AZ'),
  awsRDSLargeHAHour: rdsRate('db.t4g.large', 'Multi-AZ'),
  awsStorageGBMonth: awsRate('7Z4F2SQPHDHNHDBP'),
  awsHAStorageGBMonth: awsRate('XM7MWF7WAQDJ997K'),
  gcpSQLCPUHour: gcpRate(sql, 'vCPUs'), gcpSQLRAMGiBHour: gcpRate(sql, 'Memory'),
  gcpSQLHACPUHour: gcpRate(sql, 'HA vCPUs'), gcpSQLHARAMGiBHour: gcpRate(sql, 'HA Memory'),
  gcpSQLSmallHour: gcpRate(sharedCandidates[0].strings, 'db-g1-small*'),
  gcpStorageGiBMonth: gcpRate(storage, 'SSD storage capacity'),
  gcpHAStorageGiBMonth: gcpRate(haStorage, 'SSD storage capacity'),
  gcpBackupGiBMonth: gcpRate(storage, 'Backups (used)'),
  // Published product rates captured by research, with source links in the document.
  gcpRunActiveCPUSecond: 0.000024, gcpRunMemoryGiBSecond: 0.0000025,
  gcpRunIdleCPUSecond: 0.0000025, gcpRunRequest: 0.4 / 1_000_000,
  gcpLBHour: 0.025, awsIPv4Hour: 0.005, lightsailIPv4TwoGBMonth: 12,
}
for (const [key, value] of Object.entries(units)) assert(Number.isFinite(value) && value > 0, key)
const round = n => Number(n.toFixed(2))
function scenario(name, items) {
  const exactTotal = Object.values(items).reduce((a, b) => a + b, 0)
  return { name, itemsUSD: Object.fromEntries(Object.entries(items).map(([k,v]) => [k,round(v)])), totalUSD: round(exactTotal), exactTotalUSD: exactTotal }
}
function cloudRun(workload) {
  const active = workload.requests * assumptions.meanWebDurationSeconds / assumptions.effectiveBilledConcurrency
  const idle = workload.minInstances * Math.max(0, seconds - active)
  const web = active * (units.gcpRunActiveCPUSecond + units.gcpRunMemoryGiBSecond)
    + idle * (units.gcpRunIdleCPUSecond + units.gcpRunMemoryGiBSecond)
    + workload.requests * units.gcpRunRequest
  const worker = (workload.deliveries * 2 + dispatchRequests) * (units.gcpRunActiveCPUSecond + 0.5 * units.gcpRunMemoryGiBSecond)
    + (workload.deliveries + dispatchRequests) * units.gcpRunRequest
  return { web, worker, activeSeconds: active, idleSeconds: idle }
}
const pilotRun = cloudRun(workloads.pilot)
const productionRun = cloudRun(workloads.production)
const growthRun = cloudRun(workloads.growthSensitivity)
const ecs = (cpu, ram) => hours * (2 * (0.5 * cpu + ram) + 0.25 * cpu + 0.5 * ram)
const awsProductionItems = {
  fargateWebAndWorker: ecs(units.awsCPU, units.awsGBHour),
  loadBalancerWithAssumedLCU: hours * (units.awsALBHour + assumptions.awsAverageLCU * units.awsLCUHour),
  publicIPv4: 5 * hours * units.awsIPv4Hour,
  rdsTwoCPU8GiBMultiAZ: hours * units.awsRDSLargeHAHour,
  rds100GBHAStorage: 100 * units.awsHAStorageGBMonth,
  miscAllowance: allowance.production,
}
const gcpProductionItems = {
  cloudRunWeb: productionRun.web, cloudRunWorkerAndDispatcher: productionRun.worker,
  cloudSQLTwoCPU8GiBHA: hours * (2 * units.gcpSQLHACPUHour + 8 * units.gcpSQLHARAMGiBHour),
  cloudSQL100GiBHAStorage: 100 * units.gcpHAStorageGiBMonth,
  usedBackup50GiB: 50 * units.gcpBackupGiBMonth,
  httpsLBForwarding: hours * units.gcpLBHour, miscAllowance: allowance.production,
}
const scenarios = [
  scenario('AWS budget pilot: single server and small database; no HA', {
    lightsailTwoGB: 12, rdsMicro: hours * units.awsRDSMicroHour,
    rds20GBStorage: 20 * units.awsStorageGBMonth, miscAllowance: allowance.pilot,
  }),
  scenario('GCP managed pilot: shared-core small database and custom-domain LB; no HA', {
    cloudRunWeb: pilotRun.web, cloudRunWorkerAndDispatcher: pilotRun.worker,
    cloudSQLSharedSmall: hours * units.gcpSQLSmallHour,
    sql20GiBStorage: 20 * units.gcpStorageGiBMonth,
    usedBackup20GiB: 20 * units.gcpBackupGiBMonth,
    httpsLBForwarding: hours * units.gcpLBHour, miscAllowance: allowance.pilot,
  }),
  scenario('AWS managed production baseline: x86 Fargate and Multi-AZ RDS', awsProductionItems),
  scenario('GCP managed production baseline: Cloud Run and HA Cloud SQL', gcpProductionItems),
  scenario('AWS ARM sensitivity: same task allocations; image compatibility required', {
    ...awsProductionItems, fargateWebAndWorker: ecs(units.awsArmCPU, units.awsArmGBHour),
  }),
  scenario('GCP growth sensitivity: 5M requests, same DB allocation only for isolation', {
    ...gcpProductionItems, cloudRunWeb: growthRun.web, cloudRunWorkerAndDispatcher: growthRun.worker,
  }),
]
const result = {
  generatedAt: new Date().toISOString(), rateCaptureDates: { aws: aws.capturedAt, gcp: gcp.capturedAt },
  sources: { awsRegionalCatalogs: aws.services.map(s => s.url), gcpSQL: gcp.url,
    gcpRun: 'https://cloud.google.com/run/pricing', gcpLB: 'https://cloud.google.com/load-balancing/pricing',
    lightsail: 'https://aws.amazon.com/lightsail/pricing/', ipv4: 'https://aws.amazon.com/vpc/pricing/' },
  assumptions, workloads, unitRatesUSD: units, scenarios,
}
await fs.writeFile(new URL('CLOUD_COST_ESTIMATES.json', root), JSON.stringify(result, null, 2) + '\n')
const tableText = '| Planning scenario | USD/month including stated allowance |\n|---|---:|\n' + scenarios.map(s => `| ${s.name} | $${s.totalUSD.toFixed(2)} |`).join('\n') + '\n'
await fs.writeFile(new URL('CLOUD_COST_ESTIMATES.md', root), '# Reproducible cloud estimate\n\nGenerated by cloud-cost-model.mjs from saved Mumbai price captures. Read assumptions/exclusions in CLOUD_COST_ESTIMATES.json and the full engineering document. Not a quote or a capacity benchmark.\n\n' + tableText)
console.log(tableText)
