/** Public service copy: describe only implemented workflows and explicit setup requirements. */
export const services = [
 {slug:'doctors',name:'Clinic appointments',oneLine:'Request a published appointment time.',what:'Compare a listed provider and request an available time. The clinic must accept before the appointment is confirmed.',why:'An account keeps the request, confirmation and care records together.',how:['Search by name, specialty or area','Review the provider fee and sample/verification status','Choose an owned household subject and consent','Check the actual status in your account'],priceNote:'See the selected provider fee',href:'/search'},
 {slug:'video',name:'Video consultation',oneLine:'Join a confirmed consultation through a connected provider.',what:'A clinician can connect Zoom or Google Meet. Joining requires a current confirmed appointment, provider consent and a ready room.',why:'The account shows actual connection and appointment status.',how:['Select an eligible clinician','Consent to the external meeting provider','Wait for clinic acceptance','Join from your account near the scheduled time'],priceNote:'See the selected provider fee',href:'/search?video=1'},
 {slug:'labs',name:'Laboratory requests',oneLine:'Request a published laboratory package.',what:'The assigned lab confirms collection arrangements and later attaches a safety-checked result. Sample packages perform no actual test.',why:'Orders and results remain associated with the account and selected household member.',how:['Review the package and laboratory','Submit an authenticated request','Wait for laboratory confirmation','Read the actual result when staff complete the order'],priceNote:'See the published package fee',href:'/labs'},
 {slug:'surgeries',name:'Planned care enquiries',oneLine:'Record an enquiry for operator review.',what:'An authenticated enquiry can be reviewed, routed and linked to versioned estimates. The platform does not guarantee hospital admission, insurer approval or financing.',why:'Previous issued quotes remain readable when an operator publishes a new version.',how:['Submit the enquiry under your account','An authorized operator reviews it','Read any issued estimate in enquiry history','Raise a dispute linked to the specific estimate'],priceNote:'Only an issued provider estimate specifies a price',href:'/surgeries'},
 {slug:'pets',name:'Pet care',oneLine:'Keep pet records separate and request veterinary care.',what:'Add an owned pet and choose a listed veterinarian who supports its species. Sample profiles are demonstrations.',why:'Species, weights and vaccination records remain associated with the pet.',how:['Add the pet identity','Filter published veterinarians by supported species','Request a compatible appointment','Record dated health history and check account updates'],priceNote:'See the selected veterinarian fee',href:'/pets'},
]
export const glossary = [
 {term:'Requested',plain:'The appointment has been recorded and is awaiting clinic acceptance. It is not yet confirmed.'},
 {term:'Confirmed',plain:'The clinician accepted the current reservation for that appointment.'},
 {term:'Sample profile',plain:'Fictional local demonstration data. It is not evidence of professional registration or a real service.'},
 {term:'Quarantined file',plain:'An uploaded file has not passed the required safety check and cannot be used as a clean clinical result or registration proof.'},
 {term:'Consultation fee',plain:'The fee recorded for the selected consultation. Ask the provider about additional tests, procedures or medicines.'},
]
export const faqs = [
 {q:'Is CareNest a hospital?',a:'CareNest is an appointment and care-record application. Practitioners and laboratories are responsible for actual services; local sample data supplies none.'},
 {q:'Do I need an account to browse?',a:'Public search does not require sign-in. Requests and private account data do.'},
 {q:'When is my appointment confirmed?',a:'After the clinic accepts your current request. A request banner or URL parameter alone cannot establish confirmation.'},
 {q:'Can I cancel or reschedule?',a:'Eligible future visits have account controls. Started appointments require clinic review. A paid visit requires a separate refund review; cancellation does not automatically transfer money.'},
 {q:'How do I get my records?',a:'Read assigned consultation records in your account. You can download an individual record or export your account data. Privacy and retention requests go through Contact support.'},
 {q:'Does CareNest process insurance or emergency care?',a:'The current implementation does not process insurer/ABDM integrations or operate an emergency helpline. Confirm actual services directly with the relevant provider.'},
]
export const trustPoints = [
 {title:'Publication requires a review',body:'Real provider publication requires recorded professional verification. Local sample profiles are explicitly marked.'},
 {title:'Fees before a request',body:'Listed consultation/package fees are displayed before a request. A surgery quote is available only when an operator actually issues it.'},
 {title:'Completed visits gate reviews',body:'A patient review requires an appointment that the clinic records as attended. A provider/account pair cannot insert duplicate reviews.'},
 {title:'Scoped care records',body:'Actual encounter ownership, current clinician access and recorded consent govern clinical records. The platform does not claim automatic ABHA portability.'},
]