/**
 * Content for the CareNest surfaces, written for the Indian market:
 * rupee fees, metro + tier-2 cities, Indian insurers/TPAs, and the
 * clinic-visit / video-consult / home-lab mix people actually book here.
 */

export type ServiceTab = 'doctors' | 'video' | 'labs' | 'medicines'

export const serviceTabs: { id: ServiceTab; label: string; hint: string }[] = [
  { id: 'doctors', label: 'Find doctors', hint: 'Condition, speciality or doctor name' },
  { id: 'video', label: 'Video consult', hint: 'Talk to a doctor in 15 minutes' },
  { id: 'labs', label: 'Lab tests', hint: 'Blood test, thyroid, full body checkup' },
  { id: 'medicines', label: 'Medicines', hint: 'Search medicines and healthcare products' },
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

export type Provider = {
  id: string
  name: string
  speciality: string
  qualification: string
  experience: number
  clinic: string
  locality: string
  city: string
  /** Consultation fee in rupees. */
  fee: number
  rating: number
  reviews: number
  /** Percentage of patients who recommended this doctor. */
  recommended: number
  video: boolean
  cashless: boolean
  languages: string[]
  gender: 'Female' | 'Male'
  /** Indices into the visible 14-day strip that have open slots. */
  openDays: number[]
  nextSlot: string
  initials: string
  tone: string
}

export const providers: Provider[] = [
  {
    id: 'ananya-deshmukh',
    name: 'Dr. Ananya Deshmukh',
    speciality: 'General Physician',
    qualification: 'MBBS, MD (Internal Medicine)',
    experience: 12,
    clinic: 'Sunrise Multispeciality Clinic',
    locality: 'Kharghar',
    city: 'Navi Mumbai',
    fee: 600,
    rating: 4.8,
    reviews: 238,
    recommended: 97,
    video: true,
    cashless: true,
    languages: ['English', 'Hindi', 'Marathi'],
    gender: 'Female',
    openDays: [0, 1, 3, 5, 8, 10, 12],
    nextSlot: 'Today, 6:30 PM',
    initials: 'AD',
    tone: 'bg-soft',
  },
  {
    id: 'rohit-menon',
    name: 'Dr. Rohit Menon',
    speciality: 'Cardiologist',
    qualification: 'MBBS, MD, DM (Cardiology)',
    experience: 18,
    clinic: 'Heartcare Institute',
    locality: 'Vashi',
    city: 'Navi Mumbai',
    fee: 1200,
    rating: 4.9,
    reviews: 412,
    recommended: 99,
    video: true,
    cashless: true,
    languages: ['English', 'Hindi', 'Malayalam'],
    gender: 'Male',
    openDays: [2, 4, 9, 11],
    nextSlot: 'Tomorrow, 11:00 AM',
    initials: 'RM',
    tone: 'bg-accent/20',
  },
  {
    id: 'fatima-sheikh',
    name: 'Dr. Fatima Sheikh',
    speciality: 'Gynaecologist',
    qualification: 'MBBS, DGO, DNB (Obs & Gynae)',
    experience: 9,
    clinic: 'Aarogya Women’s Clinic',
    locality: 'Panvel',
    city: 'Navi Mumbai',
    fee: 700,
    rating: 4.7,
    reviews: 156,
    recommended: 95,
    video: true,
    cashless: false,
    languages: ['English', 'Hindi', 'Urdu'],
    gender: 'Female',
    openDays: [1, 2, 6, 8, 13],
    nextSlot: 'Today, 8:00 PM',
    initials: 'FS',
    tone: 'bg-soft',
  },
  {
    id: 'karthik-iyer',
    name: 'Dr. Karthik Iyer',
    speciality: 'Dermatologist',
    qualification: 'MBBS, MD (Dermatology)',
    experience: 7,
    clinic: 'SkinWorks Clinic',
    locality: 'Kamothe',
    city: 'Navi Mumbai',
    fee: 800,
    rating: 4.6,
    reviews: 94,
    recommended: 92,
    video: false,
    cashless: true,
    languages: ['English', 'Tamil', 'Hindi'],
    gender: 'Male',
    openDays: [3, 7, 12],
    nextSlot: 'Wed, 5:15 PM',
    initials: 'KI',
    tone: 'bg-muted',
  },
  {
    id: 'meera-nair',
    name: 'Dr. Meera Nair',
    speciality: 'Paediatrician',
    qualification: 'MBBS, MD (Paediatrics)',
    experience: 14,
    clinic: 'Little Steps Child Care',
    locality: 'Belapur',
    city: 'Navi Mumbai',
    fee: 650,
    rating: 4.9,
    reviews: 321,
    recommended: 98,
    video: true,
    cashless: true,
    languages: ['English', 'Hindi', 'Malayalam'],
    gender: 'Female',
    openDays: [0, 2, 5, 7, 9, 11, 13],
    nextSlot: 'Today, 4:45 PM',
    initials: 'MN',
    tone: 'bg-soft',
  },
  {
    id: 'sandeep-rao',
    name: 'Dr. Sandeep Rao',
    speciality: 'Orthopaedic',
    qualification: 'MBBS, MS (Orthopaedics)',
    experience: 21,
    clinic: 'BoneJoint Care Centre',
    locality: 'Kharghar',
    city: 'Navi Mumbai',
    fee: 900,
    rating: 4.5,
    reviews: 187,
    recommended: 90,
    video: false,
    cashless: false,
    languages: ['English', 'Hindi', 'Kannada'],
    gender: 'Male',
    openDays: [4, 6, 10],
    nextSlot: 'Thu, 10:30 AM',
    initials: 'SR',
    tone: 'bg-muted',
  },
]

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
          'Enter your name, date of birth and gender exactly as they appear on your government ID or insurance policy. Clinics use these details to register you, and insurers use them to verify cashless eligibility.',
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
          'Go to Account settings, select Mobile number, and enter the new number. We send an OTP to both the old and new numbers to confirm the change.',
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
          'Confirm who the appointment is for, add your reason for visiting, and submit. You get an SMS and WhatsApp confirmation with the clinic address.',
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
          'Join from the link in your confirmation SMS about five minutes before the slot. You will need a stable connection and a quiet space.',
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
          'You can pay online using UPI, debit or credit card, net banking, or a supported wallet. Many clinics also allow you to pay in cash at the reception.',
        ],
      },
      {
        slug: 'cashless-claims',
        title: 'How do cashless claims work on CareNest?',
        blurb: 'Using your health insurance at a partner clinic.',
        date: '4 June 2026',
        body: [
          'Doctors marked Cashless are empanelled with one or more insurers or TPAs. Add your policy to your account and we check eligibility before you confirm.',
          'Carry your policy card and a photo ID to the clinic. Cashless approval is granted by the insurer, not by CareNest.',
        ],
      },
      {
        slug: 'ayushman-bharat',
        title: 'Can I use Ayushman Bharat on CareNest?',
        blurb: 'PM-JAY at empanelled hospitals.',
        date: '4 June 2026',
        body: [
          'Hospitals empanelled under Ayushman Bharat PM-JAY show a PM-JAY badge. Bring your Ayushman card and Aadhaar to the hospital help desk for verification.',
        ],
      },
      {
        slug: 'refunds',
        title: 'When will I get my refund?',
        blurb: 'Timelines for cancelled appointments.',
        date: '4 June 2026',
        body: [
          'Refunds for appointments cancelled in time are returned to the original payment method, usually within 5 to 7 working days.',
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
          'Pick a package and a time slot. A trained phlebotomist arrives at your address with sealed kits and collects the sample.',
          'Reports are uploaded to your CareNest account, usually within 24 to 36 hours depending on the test.',
        ],
      },
      {
        slug: 'fasting-tests',
        title: 'Which tests need fasting?',
        blurb: 'Preparing for your sample.',
        date: '4 June 2026',
        body: [
          'Tests such as fasting blood sugar and lipid profile need 8 to 12 hours of fasting. Water is allowed. Your booking confirmation lists the exact preparation.',
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
          'We do not sell your health data. You can request deletion of your account and records at any time from Account settings.',
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

export type Vet = {
  id: string
  name: string
  speciality: string
  qualification: string
  experience: number
  clinic: string
  locality: string
  city: string
  fee: number
  rating: number
  reviews: number
  video: boolean
  homeVisit: boolean
  treats: Species[]
  languages: string[]
  nextSlot: string
  initials: string
  tone: string
}

export const vets: Vet[] = [
  {
    id: 'neha-kulkarni',
    name: 'Dr. Neha Kulkarni',
    speciality: 'Small Animal Practice',
    qualification: 'B.V.Sc & A.H., M.V.Sc',
    experience: 11,
    clinic: 'PawCare Veterinary Clinic',
    locality: 'Kharghar',
    city: 'Navi Mumbai',
    fee: 700,
    rating: 4.9,
    reviews: 264,
    video: true,
    homeVisit: true,
    treats: ['Dog', 'Cat', 'Rabbit'],
    languages: ['English', 'Hindi', 'Marathi'],
    nextSlot: 'Today, 5:30 PM',
    initials: 'NK',
    tone: 'bg-soft',
  },
  {
    id: 'imran-qureshi',
    name: 'Dr. Imran Qureshi',
    speciality: 'Veterinary Surgeon',
    qualification: 'B.V.Sc & A.H., M.V.Sc (Surgery)',
    experience: 16,
    clinic: 'Companion Animal Hospital',
    locality: 'Vashi',
    city: 'Navi Mumbai',
    fee: 1000,
    rating: 4.8,
    reviews: 189,
    video: false,
    homeVisit: false,
    treats: ['Dog', 'Cat'],
    languages: ['English', 'Hindi', 'Urdu'],
    nextSlot: 'Tomorrow, 10:00 AM',
    initials: 'IQ',
    tone: 'bg-accent/20',
  },
  {
    id: 'lakshmi-raman',
    name: 'Dr. Lakshmi Raman',
    speciality: 'Avian & Exotic Pets',
    qualification: 'B.V.Sc & A.H.',
    experience: 8,
    clinic: 'Feathers & Friends Clinic',
    locality: 'Belapur',
    city: 'Navi Mumbai',
    fee: 800,
    rating: 4.7,
    reviews: 76,
    video: true,
    homeVisit: false,
    treats: ['Bird', 'Rabbit', 'Fish'],
    languages: ['English', 'Tamil', 'Hindi'],
    nextSlot: 'Today, 7:00 PM',
    initials: 'LR',
    tone: 'bg-muted',
  },
  {
    id: 'arjun-patil',
    name: 'Dr. Arjun Patil',
    speciality: 'Veterinary Dermatology',
    qualification: 'B.V.Sc & A.H., M.V.Sc (Medicine)',
    experience: 13,
    clinic: 'SkinVet Pet Clinic',
    locality: 'Panvel',
    city: 'Navi Mumbai',
    fee: 900,
    rating: 4.8,
    reviews: 142,
    video: true,
    homeVisit: true,
    treats: ['Dog', 'Cat'],
    languages: ['English', 'Hindi', 'Marathi'],
    nextSlot: 'Tomorrow, 12:30 PM',
    initials: 'AP',
    tone: 'bg-soft',
  },
  {
    id: 'suresh-gowda',
    name: 'Dr. Suresh Gowda',
    speciality: 'Livestock & Cattle',
    qualification: 'B.V.Sc & A.H.',
    experience: 22,
    clinic: 'Rural Livestock Care',
    locality: 'Uran',
    city: 'Raigad',
    fee: 500,
    rating: 4.6,
    reviews: 58,
    video: true,
    homeVisit: true,
    treats: ['Cattle'],
    languages: ['Kannada', 'Hindi', 'Marathi'],
    nextSlot: 'Thu, 8:00 AM',
    initials: 'SG',
    tone: 'bg-muted',
  },
]

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
export const drugCatalogue = [
  { name: 'Paracetamol', strength: '500 mg', form: 'TABLET' },
  { name: 'Azithromycin', strength: '250 mg', form: 'TABLET' },
  { name: 'Amoxicillin', strength: '500 mg', form: 'CAPSULE' },
  { name: 'Pantoprazole', strength: '40 mg', form: 'TABLET' },
  { name: 'Metformin', strength: '500 mg', form: 'TABLET' },
  { name: 'Cetirizine', strength: '10 mg', form: 'TABLET' },
  { name: 'Amlodipine', strength: '5 mg', form: 'TABLET' },
  { name: 'Ondansetron', strength: '4 mg', form: 'TABLET' },
]

export const intakeOptions = ['Before food', 'After food', 'With food', 'Empty stomach']

export const frequencyPresets = ['Once a day', 'Twice a day', 'Thrice a day', 'Every four hours', 'SOS']

export type QueuePatient = {
  id: string
  name: string
  age: number
  gender: 'Male' | 'Female'
  bloodGroup: string
  phone: string
  time: string
  reason: string
  status: 'Waiting' | 'Engaged' | 'Met'
  history: string[]
}

export const queuePatients: QueuePatient[] = [
  {
    id: 'p1',
    name: 'Ramesh Iyer',
    age: 30,
    gender: 'Male',
    bloodGroup: 'O+ve',
    phone: '+91 98450 98450',
    time: '10:15 AM',
    reason: 'Fever and body ache',
    status: 'Engaged',
    history: ['Diabetes', 'Hypothyroidism'],
  },
  {
    id: 'p2',
    name: 'Sunita Patil',
    age: 42,
    gender: 'Female',
    bloodGroup: 'B+ve',
    phone: '+91 98220 11223',
    time: '10:45 AM',
    reason: 'Follow-up — BP review',
    status: 'Waiting',
    history: ['Hypertension'],
  },
  {
    id: 'p3',
    name: 'Arjun Nair',
    age: 26,
    gender: 'Male',
    bloodGroup: 'A+ve',
    phone: '+91 99870 55221',
    time: '11:30 AM',
    reason: 'Skin rash',
    status: 'Waiting',
    history: [],
  },
]
