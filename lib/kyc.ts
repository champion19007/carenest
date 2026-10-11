export const KYC_EVIDENCE=[
 {kind:'IDENTITY',label:'Government photo ID',hint:'Passport, driving licence, PAN or a masked government photo ID. Hide unnecessary ID numbers; Aadhaar is not required.'},
 {kind:'REGISTRATION',label:'Professional registration certificate',hint:'Current registration with the appropriate medical, dental, veterinary or other professional council.'},
 {kind:'QUALIFICATION',label:'Degree and specialty evidence',hint:'Qualifications supporting the specialty you want to publish, including postgraduate evidence where relevant.'},
 {kind:'CLINIC',label:'Clinic affiliation or address proof',hint:'Clinic authorisation, appointment letter or another document establishing your practice address and affiliation.'},
] as const
export type KycEvidenceKind=typeof KYC_EVIDENCE[number]['kind']
export const isKycEvidenceKind=(value:unknown):value is KycEvidenceKind=>KYC_EVIDENCE.some(item=>item.kind===value)
export const KYC_POLICY_VERSION='professional-verification-v1'
export type KycReviewChecks={identityMatched:boolean;registrationChecked:boolean;qualificationMatched:boolean;clinicMatched:boolean;sourceUrl:string;sourceReference:string;revision:number}
/** Pass newest-first files: an unsafe replacement must not silently reuse an older proof. */
export function missingKycEvidence(files:{evidence_kind:string|null;state:string}[]){return KYC_EVIDENCE.filter(item=>files.find(file=>file.evidence_kind===item.kind)?.state!=='CLEAN').map(item=>item.label)}
