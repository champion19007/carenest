/**
 * Long-form explanatory copy for the public site.
 *
 * The rule here: never assume the reader knows the vocabulary. "Cashless",
 * "video consult", "in-network", "ABHA", "day care surgery" — every one of
 * these gets defined in plain language before it is used as a feature name.
 */

export const services = [
  {
    slug: 'doctors',
    name: 'Clinic appointments',
    oneLine: 'See a doctor in person, at a confirmed time.',
    what: 'You pick a doctor near you, choose a slot from their real calendar, and turn up. No phone calls, no waiting room queue, no “doctor is running late, please sit”.',
    why: 'In most Indian clinics you take a token and wait. Booking a specific slot means the clinic knows you are coming and roughly when, so the queue actually moves.',
    how: [
      'Search by locality, speciality, fee or language',
      'Compare experience, patient reviews and consultation fee before you pick',
      'Book a slot and get the address on SMS and WhatsApp',
      'Pay at the clinic by UPI, card or cash',
    ],
    from: 400,
    href: '/search',
  },
  {
    slug: 'video',
    name: 'Video consultation',
    oneLine: 'Talk to a doctor over video, usually within 15 minutes.',
    what: 'A scheduled video call with a registered doctor. You describe the problem, they examine what can be examined on camera, ask questions, and issue a digital prescription if one is needed.',
    why: 'Good for things that do not need a physical examination — a rash, a follow-up on test results, a repeat prescription, mental health, or a second opinion. It saves a trip across the city, and it works when you are travelling or caring for someone at home.',
    how: [
      'Pick a doctor marked “video consult”',
      'Join from the link in your confirmation SMS',
      'The doctor issues a digital prescription you can show at any pharmacy',
      'Free text follow-up with the same doctor for a short window afterwards',
    ],
    from: 300,
    href: '/search?mode=video',
  },
  {
    slug: 'labs',
    name: 'Lab tests at home',
    oneLine: 'A technician comes to your house to take the sample.',
    what: 'You book a blood test or a health package. A trained phlebotomist — the person who draws blood — arrives at your address with sealed, single-use kits. The sample goes to an NABL-accredited lab and the report lands in your account.',
    why: 'Most diagnostic centres are open only in the morning, and fasting tests mean going hungry in a queue. Home collection removes the trip entirely, which matters most for elderly parents and anyone who cannot travel easily.',
    how: [
      'Choose a package or an individual test',
      'Pick a slot between 7 am and 9 pm',
      'Fasting instructions are on your booking confirmation',
      'Digital report in 24 to 36 hours, stored in your account',
    ],
    from: 299,
    href: '/labs',
  },
  {
    slug: 'surgeries',
    name: 'Planned surgery',
    oneLine: 'Elective procedures with the cost agreed before admission.',
    what: 'For procedures you schedule rather than rush into — piles, hernia, cataract, kidney stones, gallstones. We match you with an experienced surgeon at a vetted hospital and tell you the expected cost upfront.',
    why: 'Surgery is where Indian patients get the biggest bill shock. Quotes vary hugely between hospitals, insurance paperwork is confusing, and nobody explains what the number actually covers. Agreeing the cost in writing first removes most of that.',
    how: [
      'Free consultation with a surgeon, arranged by a coordinator',
      'Written cost estimate, including room category and hospital stay',
      'We file the cashless paperwork with your insurer or TPA',
      'No-cost EMI over 3 to 12 months if you need it',
    ],
    from: 25000,
    href: '/surgeries',
  },
  {
    slug: 'pets',
    name: 'Pet care',
    oneLine: 'Vets for dogs, cats, birds, rabbits and cattle — including at home.',
    what: 'Registered veterinary doctors for vaccination, deworming, grooming, surgery and diagnostics. Many will visit your home, which is far less stressful for a frightened animal than a clinic waiting room.',
    why: 'Anti-rabies vaccination is expected for dogs under most municipal rules in India, and a stamped vaccination card is needed for boarding and travel. Beyond that, a sick pet cannot tell you what is wrong, so getting a vet quickly matters.',
    how: [
      'Filter by species — dog, cat, bird, rabbit, fish or cattle',
      'Choose a clinic visit or a home visit',
      'Vaccination schedule reminders for puppies and kittens',
      '24×7 emergency helpline for poisoning, accidents and breathing trouble',
    ],
    from: 300,
    href: '/pets',
  },
]

export const glossary = [
  {
    term: 'Cashless',
    plain:
      'Your insurer pays the hospital directly, so you do not pay first and claim later. It only works at clinics and hospitals that are empanelled with your specific insurer, and it has to be approved before treatment.',
  },
  {
    term: 'TPA',
    plain:
      'Third Party Administrator — the company your insurer uses to process claims. When a hospital says “waiting for TPA approval”, this is who they mean.',
  },
  {
    term: 'Ayushman Bharat (PM-JAY)',
    plain:
      'A government health scheme that covers hospitalisation for eligible families at empanelled hospitals. You need your Ayushman card and an ID at the hospital help desk.',
  },
  {
    term: 'ABHA number',
    plain:
      'A free digital health ID issued under the Ayushman Bharat Digital Mission. Linking it lets your records follow you between hospitals instead of living in one clinic’s files.',
  },
  {
    term: 'NABL-accredited lab',
    plain:
      'A lab audited by the National Accreditation Board for Testing and Calibration Laboratories. It is the mark that a lab’s results are reliable.',
  },
  {
    term: 'Day care procedure',
    plain:
      'Surgery where you go home the same day rather than staying overnight. Cataract and piles procedures are usually day care.',
  },
  {
    term: 'NMC-verified',
    plain:
      'The doctor’s registration has been checked against the National Medical Commission register, so you know the qualification is real.',
  },
  {
    term: 'Consultation fee',
    plain:
      'What the doctor charges to see you. It does not include tests, procedures or medicines — those are billed separately.',
  },
]

export const faqs = [
  {
    q: 'Is CareNest a hospital or a clinic?',
    a: 'Neither. CareNest is a booking platform. The doctors, clinics, labs and hospitals are independent — we verify their registration, show you their real availability, and handle the booking. Your treatment is between you and that provider.',
  },
  {
    q: 'Does it cost anything to book?',
    a: 'No. There is no booking fee and no subscription. You pay the doctor, lab or hospital directly for the care you receive.',
  },
  {
    q: 'Why do I have to create an account to search?',
    a: 'Because a clinic calendar is a limited, real resource. Tying bookings to a verified mobile number stops slots being held by people who never turn up, which is what makes same-day availability possible for everyone else. It also lets us keep your prescriptions and reports in one place.',
  },
  {
    q: 'Are the reviews real?',
    a: 'We only invite a review after a completed appointment that was booked through CareNest. You cannot review a doctor you never saw, and providers cannot delete reviews they dislike.',
  },
  {
    q: 'What if I need to cancel?',
    a: 'Cancel or reschedule from My bookings, ideally at least two hours before the slot so it can be released to someone else. Refunds for prepaid bookings go back to the original payment method in 5 to 7 working days.',
  },
  {
    q: 'Is my health data safe?',
    a: 'Your records are visible to you and to the doctor you booked with. We do not sell health data, and we do not pass your number to advertisers. You can request deletion of your account and records at any time.',
  },
  {
    q: 'What if it is an emergency?',
    a: 'Do not book online. Call 108 for an ambulance or go straight to the nearest hospital emergency department. CareNest is for planned and same-day care, not emergencies.',
  },
]

export const trustPoints = [
  {
    title: 'Every doctor is verified before they appear',
    body: 'We check the medical council registration number and qualification documents against the register. A profile does not go live until that passes. Doctors whose verification lapses are removed.',
  },
  {
    title: 'Fees are shown before you book',
    body: 'The consultation fee is on the card, not revealed at the reception desk. For surgery you get a written estimate that names the hospital and room category, because that is what actually moves the number.',
  },
  {
    title: 'Reviews come only from completed visits',
    body: 'A review invitation is sent after an appointment that actually happened. Providers cannot buy, edit or remove them.',
  },
  {
    title: 'Your records stay yours',
    body: 'Prescriptions, lab reports and visit notes live in your account, not in one clinic’s filing cabinet. Link an ABHA number and they follow you between providers.',
  },
]
