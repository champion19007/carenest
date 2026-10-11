// Planning assumptions, not actual revenue, vendor quotes or a forecast.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const assumptions = {
  currency: 'INR',
  subscriptionNet: 2999,
  subscriptionTaxAssumption: 0.18,
  gatewayCashRate: 0.0236,
  clinicVariableCost: 600,
  consultationCollected: 700,
  transactionNetRevenueAssumption: 49,
  transactionVideoAllocation: 8,
  transactionCommunication: 4,
  transactionSupport: 12,
  transactionRecoveryReserve: 5,
  clinicAcquisitionCost: 8000,
  monthlyClinicChurnAssumption: 0.03,
  notes: [
    'All values are hypotheses. No real sales, retention, acquisition or conversion data was supplied.',
    '18% subscription tax and gateway GST cash cost are modelling assumptions; confirm actual classification, credits and contracts with the accountant.',
    'Transaction scenario assumes INR49 net recognized technology revenue within INR700 collected. Provider pass-through is not platform revenue. Actual tax and settlement structure must be priced separately.',
    'Subscription gateway cost is computed on the tax-inclusive amount. No input-tax-credit recovery is assumed.',
    'A transaction charge is an optional, legally reviewed experiment, not an implemented or approved referral commission.',
    'Fixed costs include staffing, sales and a hypothetical cloud allowance. They exclude one-time setup, financing and corporation income taxes.',
  ],
}
const subscriptionGateway = assumptions.subscriptionNet * (1 + assumptions.subscriptionTaxAssumption) * assumptions.gatewayCashRate
const clinicContribution = assumptions.subscriptionNet - assumptions.clinicVariableCost - subscriptionGateway
const transactionContribution = assumptions.transactionNetRevenueAssumption
  - assumptions.consultationCollected * assumptions.gatewayCashRate
  - assumptions.transactionVideoAllocation - assumptions.transactionCommunication
  - assumptions.transactionSupport - assumptions.transactionRecoveryReserve
const scenarios = [
  { name: 'pilot', clinics: 20, completedTransactions: 300, fixedCost: 100000 },
  { name: 'base', clinics: 80, completedTransactions: 1500, fixedCost: 210000 },
  { name: 'growth', clinics: 120, completedTransactions: 3000, fixedCost: 210000 },
  { name: 'expanded', clinics: 200, completedTransactions: 7000, fixedCost: 300000 },
].map(s => ({ ...s,
  subscriptionRevenue: s.clinics * assumptions.subscriptionNet,
  transactionRevenue: s.completedTransactions * assumptions.transactionNetRevenueAssumption,
  careGMV: s.completedTransactions * assumptions.consultationCollected,
  subscriptionContribution: s.clinics * clinicContribution,
  transactionContribution: s.completedTransactions * transactionContribution,
  operatingResult: s.clinics * clinicContribution + s.completedTransactions * transactionContribution - s.fixedCost,
}))
const summary = {
  date: '2026-10-09', assumptions, subscriptionGateway, clinicContribution, transactionContribution,
  clinicCACPaybackMonths: assumptions.clinicAcquisitionCost / clinicContribution,
  simplifiedClinicLTV: clinicContribution / assumptions.monthlyClinicChurnAssumption,
  saasOnlyBreakEvenClinics: Math.ceil(210000 / clinicContribution),
  breakEvenClinicsWith1500Transactions: Math.ceil((210000 - 1500 * transactionContribution) / clinicContribution),
  churnSensitivity: [0.01, 0.03, 0.06].map(churn => ({ churn, simplifiedLTV: clinicContribution / churn })),
  scenarios,
}
writeFileSync(path.join(root, 'unit-economics.json'), JSON.stringify(summary, null, 2) + '\n')
const columns = Object.keys(scenarios[0])
writeFileSync(path.join(root, 'unit-economics.csv'), columns.join(',') + '\n' + scenarios.map(s => columns.map(k => typeof s[k] === 'number' ? s[k].toFixed(2) : s[k]).join(',')).join('\n') + '\n')
console.log(JSON.stringify({ clinicContribution: Number(clinicContribution.toFixed(2)), transactionContribution: Number(transactionContribution.toFixed(2)), saasOnlyBreakEvenClinics: summary.saasOnlyBreakEvenClinics, breakEvenClinicsWith1500Transactions: summary.breakEvenClinicsWith1500Transactions, scenarios: scenarios.map(s => ({ name: s.name, operatingResult: Number(s.operatingResult.toFixed(2)) })) }))
