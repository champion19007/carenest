/**
 * Content for the CareNest surfaces, written for the Indian market:
 * rupee fees, metro + tier-2 cities, Indian insurers/TPAs, and the
 * clinic-visit / video-consult / home-lab mix people actually book here.
 */

export type ServiceTab = 'doctors' | 'video' | 'labs' | 'medicines'

export const serviceTabs: { id: ServiceTab; label: string; hint: string }[] = [
  { id: 'doctors', label: 'Find doctors', hint: 'Condition, speciality or doctor name' },
  { id: 'video', label: 'Video consult', hint: 'Explore scheduled video consultations' },
  { id: 'labs', label: 'Lab tests', hint: 'Blood test, thyroid, full body checkup' },
]

export const browseMenu = [
  'Specialities',
  'Doctors near you',
  'Clinics & hospitals',
  'Video consultation',
  'Lab tests at home',
  'Health insurance',
  'Ayushman Bharat',
  'Health articles',
]

/** Insurers and TPAs commonly used for cashless outpatient claims in India. */
export const insurers = [
  { name: 'Star Health', tint: '#0f6b3f' },
  { name: 'HDFC ERGO', tint: '#0b4da2' },
  { name: 'ICICI Lombard', tint: '#a8201a' },
  { name: 'Niva Bupa', tint: '#0072ce' },
  { name: 'Care Health', tint: '#00857d' },
  { name: 'Ayushman Bharat PM-JAY', tint: '#c2410c' },
]

export const topSpecialities = [
  { name: 'General Physician', emoji: '\u{1FA7A}', fee: 500 },
  { name: 'Dentist', emoji: '\u{1F9B7}', fee: 400 },
  { name: 'Gynaecologist', emoji: '\u{1F930}', fee: 700 },
  { name: 'Dermatologist', emoji: '\u{2728}', fee: 800 },
  { name: 'Paediatrician', emoji: '\u{1F476}', fee: 600 },
  { name: 'Orthopaedic', emoji: '\u{1F9B4}', fee: 700 },
  { name: 'Cardiologist', emoji: '\u{1FAC0}', fee: 1000 },
  { name: 'Psychiatrist', emoji: '\u{1F9E0}', fee: 1200 },
  { name: 'ENT Specialist', emoji: '\u{1F442}', fee: 600 },
  { name: 'Ophthalmologist', emoji: '\u{1F441}', fee: 550 },
]

export const cities = [
  'Mumbai', 'Navi Mumbai', 'Delhi NCR', 'Bengaluru', 'Hyderabad',
  'Chennai', 'Pune', 'Kolkata', 'Ahmedabad',
  'Jaipur', 'Lucknow', 'Chandigarh', 'Kochi',
  'Indore', 'Bhopal', 'Nagpur', 'Coimbatore',
]

export const languages = ['English', 'Hindi', 'Marathi', 'Telugu', 'Tamil', 'Bengali', 'Kannada', 'Gujarati']

export const healthConcerns: Record<string, string[]> = {
  'General health': ['Fever & viral', 'Cold and cough', 'Body ache', 'Annual health checkup'],
  'Women’s health': ['PCOS / PCOD', 'Pregnancy care', 'Irregular periods', 'Thyroid in women'],
  'Long-term care': ['Diabetes management', 'High BP / hypertension', 'Asthma', 'Cholesterol'],
  'Mind & sleep': ['Anxiety', 'Depression', 'Insomnia', 'Stress at work'],
}

export const labPackages = [
  { name: 'Full Body Checkup', tests: 82, price: 1499, mrp: 3200 },
  { name: 'Diabetes Screening', tests: 12, price: 599, mrp: 1200 },
  { name: 'Thyroid Profile (T3 T4 TSH)', tests: 3, price: 349, mrp: 800 },
  { name: 'Vitamin D + B12', tests: 2, price: 899, mrp: 1900 },
]

export const hospitalGroups = ['Apollo Hospitals', 'Fortis Healthcare', 'Manipal Hospitals', 'Max Healthcare']

/* ---------------------------------------------------------------- search */

export const specialityFilters = [
  'General Physician',
  'Cardiologist',
  'Gynaecologist',
  'Dermatologist',
  'Paediatrician',
  'Orthopaedic',
]

export const experienceBands = ['0-5 years', '5-10 years', '10+ years', '15+ years']
export const feeBands = ['Under ₹500', '₹500 - ₹800', '₹800 - ₹1200', '₹1200+']
export const availabilityBands = ['Available today', 'Available tomorrow', 'Next 7 days']

/* ------------------------------------------------------------------ help */

export type HelpArticle = {
  slug: string
  title: string
  blurb: string
  date: string
  body: string[]
}

export type HelpCollection = {
  slug: string
  title: string
  emoji: string
  articles: HelpArticle[]
}

export const helpCollections: HelpCollection[] = [
  {
    slug: 'my-account',
    title: 'My account',
    emoji: '\u{1F464}',
    articles: [
      {
        slug: 'create-account',
        title: 'How do I create a CareNest account?',
        blurb: 'Sign up with your mobile number in under a minute.',
        date: '4 June 2026',
        body: [
          'Anyone booking an appointment on CareNest needs an account. Tap Sign up at the top of any page and enter your 10-digit mobile number.',
          'We send a 6-digit OTP to that number. CareNest is passwordless — you log in with an OTP every time, so there is no password to remember or reset.',
          'Add the correct name and household details for the person receiving care. This app does not verify insurance eligibility.',
          'You can add family members to the same account later, which is useful if you book for parents or children.',
        ],
      },
      {
        slug: 'account-locked',
        title: 'My account is locked. How do I get back in?',
        blurb: 'Why sign-in can fail, and how to fix it.',
        date: '6 May 2026',
        body: [
          'Accounts can be temporarily restricted if appointments are repeatedly cancelled or missed without notice, since that blocks slots other patients could have used.',
          'If you think your account was locked by mistake, contact our support team with your registered mobile number and we will review it.',
        ],
      },
      {
        slug: 'change-mobile-number',
        title: 'How do I change my registered mobile number?',
        blurb: 'Update the number that receives your OTP.',
        date: '4 June 2026',
        body: [
          'Phone changes are not yet self-service. Submit a support request; never share an OTP with an operator.',
        ],
      },
      {
        slug: 'add-family-member',
        title: 'How do I add a family member to my account?',
        blurb: 'Book for parents, a spouse, or children.',
        date: '4 June 2026',
        body: [
          'Open Account settings and choose Family members. Add their name, date of birth and relationship, and you can pick them at booking time.',
        ],
      },
    ],
  },
  {
    slug: 'booking',
    title: 'Booking & appointments',
    emoji: '\u{1F4C5}',
    articles: [
      {
        slug: 'book-appointment',
        title: 'How do I book a clinic appointment?',
        blurb: 'From search to confirmed slot.',
        date: '4 June 2026',
        body: [
          'Search for a speciality or doctor, set your city and locality, then pick an open slot from the doctor’s card.',
          'Select an owned household member or pet, consent to appointment sharing and request the time. The clinic must accept the request. Current status and updates appear in your account.',
        ],
      },
      {
        slug: 'reschedule-cancel',
        title: 'How do I reschedule or cancel?',
        blurb: 'Change your slot before the visit.',
        date: '4 June 2026',
        body: [
          'Open the appointment from My bookings and choose Reschedule or Cancel. Please do this at least 2 hours before the slot so it can be released to someone else.',
        ],
      },
      {
        slug: 'video-consult',
        title: 'How does a video consultation work?',
        blurb: 'What to expect on a video call.',
        date: '4 June 2026',
        body: [
          'For a confirmed video appointment, open your account near the appointment time. Joining opens ten minutes before the slot and requires the clinician to have a connected Zoom or Google Meet account.',
          'The doctor can issue a digital prescription at the end of the call, which appears in your CareNest account.',
        ],
      },
    ],
  },
  {
    slug: 'payments-insurance',
    title: 'Payments & insurance',
    emoji: '\u{1F4B3}',
    articles: [
      {
        slug: 'payment-methods',
        title: 'Which payment methods can I use?',
        blurb: 'UPI, cards, net banking and cash at clinic.',
        date: '4 June 2026',
        body: [
          'Online payments appear only when the payment provider is configured. Otherwise arrange payment directly with the clinic. Recorded offline receipts do not process a transfer.',
        ],
      },
      {
        slug: 'cashless-claims',
        title: 'How do cashless claims work on CareNest?',
        blurb: 'Using your health insurance at a partner clinic.',
        date: '4 June 2026',
        body: [
          'CareNest does not currently perform policy checks or cashless claims. Confirm arrangements directly with the provider and insurer.',
          'Carry your policy card and a photo ID to the clinic. Cashless approval is granted by the insurer, not by CareNest.',
        ],
      },
      {
        slug: 'ayushman-bharat',
        title: 'Can I use Ayushman Bharat on CareNest?',
        blurb: 'PM-JAY at empanelled hospitals.',
        date: '4 June 2026',
        body: [
          'CareNest does not currently verify or process PM-JAY benefits. Ask the hospital and official scheme help desk about eligibility.',
        ],
      },
      {
        slug: 'refunds',
        title: 'When will I get my refund?',
        blurb: 'Timelines for cancelled appointments.',
        date: '4 June 2026',
        body: [
          'Cancellation does not automatically issue a refund. For a captured online payment, request refund review from billing. The account shows the authoritative recorded state; processing times depend on the provider.',
        ],
      },
    ],
  },
  {
    slug: 'lab-tests',
    title: 'Lab tests',
    emoji: '\u{1F9EA}',
    articles: [
      {
        slug: 'home-sample-collection',
        title: 'How does home sample collection work?',
        blurb: 'A phlebotomist visits you.',
        date: '4 June 2026',
        body: [
          'Request a published lab package. The lab must confirm the actual collection arrangement and time. Sample packages are local demonstrations.',
          'A result appears after authorized lab staff upload a safety-checked file and complete the order. No turnaround-time guarantee is provided.',
        ],
      },
      {
        slug: 'fasting-tests',
        title: 'Which tests need fasting?',
        blurb: 'Preparing for your sample.',
        date: '4 June 2026',
        body: [
          'Ask the laboratory or treating clinician for preparation instructions for your specific test. Do not change medicines or diet based on a generic help article.',
        ],
      },
    ],
  },
  {
    slug: 'for-doctors',
    title: 'For doctors & clinics',
    emoji: '\u{1FA7A}',
    articles: [
      {
        slug: 'list-your-practice',
        title: 'How do I list my practice on CareNest?',
        blurb: 'Get discovered by patients near you.',
        date: '4 June 2026',
        body: [
          'Register with your medical council registration number, qualification proof and clinic address. Our team verifies your credentials before your profile goes live.',
        ],
      },
      {
        slug: 'manage-slots',
        title: 'How do I manage my consultation slots?',
        blurb: 'Control your availability.',
        date: '4 June 2026',
        body: [
          'Your practice dashboard lets you set clinic timings, slot duration and video-consult windows for each day of the week.',
        ],
      },
    ],
  },
  {
    slug: 'privacy',
    title: 'Privacy & data',
    emoji: '\u{1F512}',
    articles: [
      {
        slug: 'how-we-use-data',
        title: 'How CareNest handles your health data',
        blurb: 'What we store, and who can see it.',
        date: '4 June 2026',
        body: [
          'We collect only what is needed to book and verify your care. Prescriptions and reports are visible to you and to the doctor you booked with.',
          'Use the account export to obtain your data. Submit privacy, correction or deletion requests through Contact support. Clinical and financial retention requires operator review.',
        ],
      },
    ],
  },
]

/* ------------------------------------------------------------ pet care */

export type Species = 'Dog' | 'Cat' | 'Bird' | 'Rabbit' | 'Cattle' | 'Fish'

export const petSpecies: { name: Species; emoji: string }[] = [
  { name: 'Dog', emoji: '\u{1F415}' },
  { name: 'Cat', emoji: '\u{1F408}' },
  { name: 'Bird', emoji: '\u{1F99C}' },
  { name: 'Rabbit', emoji: '\u{1F407}' },
  { name: 'Fish', emoji: '\u{1F41F}' },
  { name: 'Cattle', emoji: '\u{1F404}' },
]

/**
 * Services Indian pet owners actually book. Vaccination and deworming lead
 * because anti-rabies is legally expected for dogs in most municipalities.
 */
export const petServices = [
  {
    name: 'Vaccination',
    emoji: '\u{1F489}',
    from: 600,
    body: 'Anti-rabies, DHPPi for dogs, tricat for cats — with a stamped vaccination card.',
  },
  {
    name: 'Deworming',
    emoji: '\u{1FAB1}',
    from: 300,
    body: 'Routine deworming for puppies, kittens and adult pets on a vet-set schedule.',
  },
  {
    name: 'Grooming at home',
    emoji: '\u{2702}',
    from: 800,
    body: 'Bath, haircut, nail trim, ear cleaning and de-shedding at your doorstep.',
  },
  {
    name: 'Spay / Neuter',
    emoji: '\u{1F3E5}',
    from: 4500,
    body: 'Sterilisation surgery with pre-op bloodwork and post-op follow-up.',
  },
  {
    name: 'Dental scaling',
    emoji: '\u{1F9B7}',
    from: 3500,
    body: 'Ultrasonic scaling under mild sedation, plus a full oral examination.',
  },
  {
    name: 'Diagnostics',
    emoji: '\u{1FA7B}',
    from: 900,
    body: 'Blood profile, X-ray, ultrasound and skin scrape at partner pet clinics.',
  },
  {
    name: 'Pet boarding',
    emoji: '\u{1F3E1}',
    from: 700,
    body: 'Day care and overnight boarding at verified, camera-monitored facilities.',
  },
  {
    name: 'Pet taxi',
    emoji: '\u{1F695}',
    from: 350,
    body: 'Air-conditioned, crate-equipped rides to the clinic and back.',
  },
]

export const petConcerns: Record<string, string[]> = {
  'Skin & coat': ['Ticks and fleas', 'Hair fall', 'Fungal infection', 'Hot spots'],
  'Stomach': ['Vomiting', 'Loose motions', 'Not eating', 'Bloating'],
  'Bones & movement': ['Limping', 'Hip dysplasia', 'Fracture care', 'Arthritis in seniors'],
  'Routine care': ['Vaccination due', 'Deworming', 'Nail trimming', 'Annual checkup'],
}

export const vetSpecialities = [
  'Small Animal Practice',
  'Veterinary Surgeon',
  'Avian & Exotic Pets',
  'Veterinary Dermatology',
  'Livestock & Cattle',
]

/** Age-based vaccination reminders shown on the pet profile card. */
export const petVaccineSchedule = [
  { age: '6-8 weeks', shots: 'DHPPi first dose, deworming' },
  { age: '10-12 weeks', shots: 'DHPPi booster, anti-rabies' },
  { age: '14-16 weeks', shots: 'DHPPi + Lepto, anti-rabies booster' },
  { age: 'Yearly', shots: 'Annual booster, anti-rabies, deworming' },
]

/* ----------------------------------------------------------- surgeries */

/**
 * Elective procedures Indian patients most often search for, grouped the way
 * they are actually browsed. Costs are indicative ranges in rupees.
 */
export const surgeryCategories: {
  name: string
  procedures: { name: string; from: number; stay: string }[]
}[] = [
  {
    name: 'Popular',
    procedures: [
      { name: 'Piles (Haemorrhoids)', from: 35000, stay: 'Day care' },
      { name: 'Hernia repair', from: 55000, stay: '1 day' },
      { name: 'Cataract surgery', from: 25000, stay: 'Day care' },
      { name: 'Kidney stone (RIRS)', from: 60000, stay: '1 day' },
      { name: 'Gallstone removal', from: 65000, stay: '1-2 days' },
      { name: 'LASIK', from: 40000, stay: 'Day care' },
    ],
  },
  {
    name: 'General surgery',
    procedures: [
      { name: 'Appendicitis', from: 50000, stay: '1-2 days' },
      { name: 'Lipoma removal', from: 20000, stay: 'Day care' },
      { name: 'Sebaceous cyst', from: 15000, stay: 'Day care' },
      { name: 'Pilonidal sinus', from: 40000, stay: '1 day' },
    ],
  },
  {
    name: 'Proctology',
    procedures: [
      { name: 'Anal fistula', from: 45000, stay: '1 day' },
      { name: 'Anal fissure', from: 30000, stay: 'Day care' },
      { name: 'Perianal abscess', from: 35000, stay: '1 day' },
    ],
  },
  {
    name: 'Orthopaedics',
    procedures: [
      { name: 'Knee replacement', from: 180000, stay: '4-5 days' },
      { name: 'ACL reconstruction', from: 120000, stay: '2 days' },
      { name: 'Spine surgery', from: 200000, stay: '4-6 days' },
    ],
  },
  {
    name: 'Urology',
    procedures: [
      { name: 'Circumcision', from: 25000, stay: 'Day care' },
      { name: 'Hydrocele', from: 30000, stay: 'Day care' },
      { name: 'TURP (prostate)', from: 85000, stay: '2-3 days' },
    ],
  },
  {
    name: 'Women’s health',
    procedures: [
      { name: 'Hysterectomy', from: 90000, stay: '2-3 days' },
      { name: 'Ovarian cyst removal', from: 60000, stay: '1-2 days' },
      { name: 'Breast lump removal', from: 45000, stay: '1 day' },
    ],
  },
  {
    name: 'Ophthalmology',
    procedures: [
      { name: 'Cataract surgery', from: 25000, stay: 'Day care' },
      { name: 'LASIK', from: 40000, stay: 'Day care' },
      { name: 'Glaucoma surgery', from: 55000, stay: '1 day' },
      { name: 'Squint correction', from: 45000, stay: 'Day care' },
    ],
  },
  {
    name: 'Cosmetic surgery',
    procedures: [
      { name: 'Hair transplant', from: 60000, stay: 'Day care' },
      { name: 'Rhinoplasty', from: 120000, stay: '1 day' },
      { name: 'Liposuction', from: 90000, stay: '1 day' },
      { name: 'Gynaecomastia', from: 70000, stay: 'Day care' },
    ],
  },
  {
    name: 'Dental',
    procedures: [
      { name: 'Dental implant', from: 25000, stay: 'Day care' },
      { name: 'Root canal', from: 6000, stay: 'Day care' },
      { name: 'Teeth whitening', from: 8000, stay: 'Day care' },
    ],
  },
]

export const surgeryAssurances = [
  { title: 'No-cost EMI', body: 'Split the bill over 3 to 12 months at zero interest.' },
  { title: 'Insurance desk', body: 'We file your cashless paperwork with the hospital TPA.' },
  { title: 'Free cab', body: 'Pick-up and drop on the day of your procedure.' },
  { title: 'Care buddy', body: 'One coordinator with you from consultation to discharge.' },
]

/* ----------------------------------------------------------- medicines */

export const medicineCategories = [
  { name: 'Diabetes care', emoji: '\u{1FA78}' },
  { name: 'Heart & BP', emoji: '\u{2764}' },
  { name: 'Vitamins', emoji: '\u{1F48A}' },
  { name: 'Skin care', emoji: '\u{1F9F4}' },
  { name: 'Baby care', emoji: '\u{1F476}' },
  { name: 'Ayurveda', emoji: '\u{1F33F}' },
]

export const offers = [
  {
    title: 'Flat ₹200 off your first video consult',
    code: 'FIRSTCARE',
    body: 'Valid on consultations above ₹500. New users only.',
  },
  {
    title: '25% off full body checkup',
    code: 'HEALTH25',
    body: 'On home sample collection booked before 9 PM.',
  },
  {
    title: 'Free vet teleconsult with vaccination',
    code: 'PAWCARE',
    body: 'Book any vaccination at home and get a follow-up call free.',
  },
]

/* ------------------------------------------------- practice (clinic app) */

export const degrees = [
  'MBBS',
  'MD - General Medicine',
  'MS - General Surgery',
  'BDS',
  'MDS - Orthodontics',
  'BAMS',
  'BHMS',
  'BPTh/BPT - Physiotherapy',
  'MPTh/MPT - Orthopedic Physiotherapy',
  'B.V.Sc & A.H. - Veterinary',
]

export const colleges = [
  'All India Institute of Medical Sciences, New Delhi',
  'Christian Medical College, Vellore',
  'Grant Medical College, Mumbai',
  'Kasturba Medical College, Manipal',
  'Maulana Azad Medical College, Delhi',
  'Sikkim Manipal University, Sikkim',
  'Seth GS Medical College, Mumbai',
]

export const councils = [
  'Maharashtra Medical Council',
  'Karnataka Medical Council',
  'Delhi Medical Council',
  'Tamil Nadu Medical Council',
  'Telangana State Medical Council',
  'National Medical Commission (NMC)',
]

export const localitiesByCity: Record<string, string[]> = {
  Mumbai: ['Andheri West', 'Bandra', 'Chira Bazaar', 'Dadar', 'Powai'],
  'Navi Mumbai': ['Kharghar', 'Vashi', 'Belapur', 'Panvel', 'Kamothe'],
  Bengaluru: ['Koramangala', 'Indiranagar', 'Whitefield', 'JP Nagar'],
  'Delhi NCR': ['Saket', 'Dwarka', 'Gurugram', 'Noida'],
}

/** A small stand-in for the drug catalogue a real EMR would query. */
export const intakeOptions = ['Before food', 'After food', 'With food', 'Empty stomach']

export const frequencyPresets = ['Once a day', 'Twice a day', 'Thrice a day', 'Every four hours', 'SOS']
