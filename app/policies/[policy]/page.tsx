import {companySettings} from '@/lib/domain/governance'
export const dynamic='force-dynamic'
import {notFound} from 'next/navigation'
import {SiteHeader} from '@/components/site-header'
import {SiteFooter} from '@/components/site-footer'
const policies:Record<string,{title:string;paragraphs:string[]}>= {
 privacy:{title:'Privacy and care data',paragraphs:[
  'This local build stores account, appointment, household and pet records in a local database. Clinical record content, private attachments, provider tokens and support details are encrypted. Authentication secrets are kept outside public files.',
  'Patients access their own care records. Practitioners access assigned encounters with current authorization and consent. Laboratory operators see orders for their active clinic memberships. Platform verification operators can review professional evidence; this does not grant them general clinical chart access.',
  'Booking and lab consent records identify the permitted purpose and policy version. Video integrations, payment gateways and external messages require configured accounts; these providers may process the necessary communication or transaction data. Local mode does not send real SMS/email messages.',
  'Clinical text is not sent to product analytics. External enquiry AI processing is disabled in local mode and needs separate purpose-specific consent and an explicit operator configuration elsewhere.',
  'You can download account-linked data and submit correction, sharing, deletion or grievance requests through the support form. Clinical retention and deletion exceptions need qualified review for the actual business. An immutable signed record is amended rather than silently rewritten.',
  'This implementation description is not a completed legal privacy notice for an operating healthcare business. The actual operator must supply contact details, vendors, retention periods and applicable reviewed policies before a public launch.'
 ]},
 terms:{title:'Service terms and local limitations',paragraphs:[
  'A submitted appointment is a request until an authorized clinic accepts its current reservation. A displayed date does not authorize a booking; availability is checked on the server. Sample profiles and packages are demonstrations, not verified real-world service supply.',
  'Professional registration review, actual care delivery and prescription suitability are responsibilities of qualified operators and practitioners. This app does not certify medical outcomes, emergency coverage, insurer acceptance or ABDM participation.',
  'A laboratory request needs an assigned lab to confirm collection and attach an actual result. An estimate is versioned information, not an automatically binding hospital agreement.',
  'Zoom/Meet and online payments require provider accounts, necessary approvals and real account tests. The local development mode is for testing and must not be exposed as a real phone-verified clinical service.',
  'The actual operator must replace this implementation description with reviewed business terms, identity and support arrangements before serving the public.'
 ]},
 cancellations:{title:'Cancellation, changes and refunds',paragraphs:[
  'Patients can cancel or request a different published time for their own eligible appointments. Rescheduling needs a current revision and valid reservation; failure to reserve the replacement leaves the original appointment unchanged.',
  'Expired or previously answered requests cannot release or confirm another patient’s reservation. Clinic acceptance applies only to the current live request.',
  'Appointment status and money are separate. Cancelling a consultation does not prove that a payment was refunded. Gateway captures and refunds are reconciled from verified provider records; local clinic receipts record payments the clinic actually received.',
  'Refund requests have their own review and processing states. Unknown provider outcomes need reconciliation rather than blind resubmission. Contact the operator for a disputed fee or a payment that does not match the invoice.',
  'Actual cancellation windows, fee/refund rules and legally required remedies must be supplied and reviewed for the operating business. No universal refund-time guarantee is made by this local build.'
 ]}
}
export default async function Policy({params}:{params:Promise<{policy:string}>}){const{policy}=await params,item=policies[policy],company=await companySettings();if(!item)notFound();return <main className="min-h-screen bg-background"><SiteHeader/><article className="care-container max-w-3xl py-10"><h1 className="text-3xl">{item.title}</h1><p className="mt-3 text-xs text-muted-foreground">Implementation description · version 1 · 8 October 2026</p><div className="mt-7 space-y-5 text-sm leading-8">{item.paragraphs.map(p=><p key={p}>{p}</p>)}</div>{company&&<section className="mt-7 rounded-2xl border p-5"><h2 className="text-xl">Operator-entered public details</h2><p className="mt-3">{String(company.legalName)} · {String(company.registration)}</p><p>{String(company.address)}</p><p className="mt-3">Grievance contact: {String(company.grievanceName)} · {String(company.grievanceEmail)} · {String(company.grievancePhone)}</p><p className="mt-3 text-xs">These details were entered by the operator. This build does not claim independent company or legal verification.</p></section>}<a href="/contact" className="care-button mt-7">Support and data requests</a><a href="/api/account/export" className="ml-4 inline-flex min-h-11 items-center text-sm text-primary">Download your data</a></article><SiteFooter/></main>}
