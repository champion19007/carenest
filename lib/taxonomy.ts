/**
 * Symptom to speciality routing.
 *
 * Patients misroute themselves constantly — a General Physician booked for
 * what needed a Rheumatologist, an Orthopaedic surgeon for nerve pain — and
 * every misroute is a wasted consultation fee and a wasted clinical hour.
 *
 * This is a lookup table, not a model. That matters for three reasons:
 *
 *   - It is *actually* deterministic. An LLM at temperature zero still varies
 *     across versions and quantisations; calling that deterministic in a
 *     clinical path is the kind of claim that stops people testing it.
 *   - It needs no key, no worker instance and no network call, so it works on
 *     the free tier and in an offline test.
 *   - Every routing decision is attributable to a line someone can read and
 *     argue with, which is what makes it correctable by a clinician rather
 *     than by a prompt.
 *
 * Nothing here diagnoses. The output is which desk to walk to, and the copy
 * says so.
 *
 * No `server-only`: the search box formats these suggestions client-side.
 */

export type Routing = {
  /** Specialities to offer, best first. */
  specialities: string[]
  /** Shown to the patient, phrased as a suggestion. */
  because: string
  /**
   * True when the wording suggests this should not wait for an appointment.
   * A flag to show emergency guidance — never a diagnosis, and never a reason
   * to refuse a booking.
   */
  redFlag?: boolean
}

type Rule = {
  /** Any of these present in the text triggers the rule. */
  any: string[]
  /** All of these must also be absent, to stop obvious mis-triggers. */
  not?: string[]
  routing: Routing
}

/**
 * Checked before anything else. These describe presentations where the honest
 * answer is "do not book an appointment, go now" — so they are matched on
 * whole phrases rather than single words, because "chest" alone is a chest
 * infection as often as it is a cardiac event.
 */
const RED_FLAGS: Rule[] = [
  {
    any: ['chest pain', 'chest tightness', 'pain in chest', 'crushing chest'],
    routing: {
      specialities: ['Cardiologist'],
      because: 'Chest pain can be an emergency.',
      redFlag: true,
    },
  },
  {
    any: ['cannot breathe', "can't breathe", 'breathless', 'gasping', 'shortness of breath'],
    routing: {
      specialities: ['General Physician', 'Cardiologist'],
      because: 'Difficulty breathing can be an emergency.',
      redFlag: true,
    },
  },
  {
    any: ['unconscious', 'fainted', 'seizure', 'fit', 'convulsion', 'slurred speech', 'face droop'],
    routing: {
      specialities: ['Neurologist'],
      because: 'Loss of consciousness or sudden weakness needs urgent assessment.',
      redFlag: true,
    },
  },
  {
    any: ['heavy bleeding', 'bleeding a lot', 'wont stop bleeding', "won't stop bleeding"],
    routing: {
      specialities: ['General Physician'],
      because: 'Bleeding that will not stop needs urgent care.',
      redFlag: true,
    },
  },
]

/**
 * Ordinary routing. Order matters: the first match wins, so the more specific
 * rules are listed before the general ones.
 */
const RULES: Rule[] = [
  {
    any: ['shoots down', 'radiating', 'pins and needles', 'numbness', 'tingling', 'sciatica'],
    routing: {
      specialities: ['Neurologist', 'Orthopaedic'],
      because: 'Pain that travels or comes with numbness often involves a nerve.',
    },
  },
  {
    any: ['back pain', 'lower back', 'slipped disc', 'spine'],
    not: ['shoots down', 'numbness', 'tingling'],
    routing: {
      specialities: ['Orthopaedic', 'General Physician'],
      because: 'Back pain without nerve symptoms usually starts here.',
    },
  },
  {
    any: ['joint pain', 'swollen joints', 'stiff in the morning', 'morning stiffness', 'arthritis'],
    routing: {
      specialities: ['Orthopaedic', 'General Physician'],
      because: 'Joints that are stiff in the morning are worth examining properly.',
    },
  },
  {
    any: ['rash', 'itching', 'acne', 'pimples', 'hair fall', 'hair loss', 'eczema', 'skin'],
    routing: { specialities: ['Dermatologist'], because: 'Skin, hair and nail problems.' },
  },
  {
    any: ['toothache', 'tooth', 'gums', 'cavity', 'dental'],
    routing: { specialities: ['Dentist'], because: 'Teeth and gums.' },
  },
  {
    any: ['blurred vision', 'eyesight', 'eye pain', 'red eye', 'watering eyes'],
    routing: { specialities: ['Ophthalmologist'], because: 'Vision and eye symptoms.' },
  },
  {
    any: ['ear pain', 'ear ache', 'hearing', 'sore throat', 'tonsil', 'sinus', 'blocked nose'],
    routing: { specialities: ['ENT Specialist'], because: 'Ear, nose and throat symptoms.' },
  },
  {
    any: ['period', 'periods', 'pregnant', 'pregnancy', 'menstrual', 'pcod', 'pcos'],
    routing: { specialities: ['Gynaecologist'], because: 'Menstrual and pregnancy care.' },
  },
  {
    any: ['my child', 'my son', 'my daughter', 'my baby', 'toddler', 'infant', 'newborn'],
    routing: {
      specialities: ['Paediatrician'],
      because: 'Children are seen by a paediatrician, whatever the symptom.',
    },
  },
  {
    any: ['anxious', 'anxiety', 'depressed', 'depression', 'panic', 'cannot sleep', 'insomnia', 'stress'],
    routing: { specialities: ['Psychiatrist'], because: 'Mental health and sleep.' },
  },
  {
    any: ['stomach pain', 'stomach ache', 'vomiting', 'loose motion', 'diarrhoea', 'diarrhea', 'acidity', 'constipation'],
    routing: {
      specialities: ['General Physician'],
      because: 'Digestive symptoms usually start with a general physician.',
    },
  },
  {
    any: ['fever', 'cough', 'cold', 'body ache', 'weakness', 'tired'],
    routing: {
      specialities: ['General Physician'],
      because: 'Fever and general symptoms start here.',
    },
  },
  {
    any: ['sugar', 'diabetes', 'thyroid', 'bp', 'blood pressure', 'cholesterol'],
    routing: {
      specialities: ['General Physician', 'Cardiologist'],
      because: 'Long-term conditions like these are managed here.',
    },
  },
]

/** Lowercased, punctuation flattened, so "Chest-pain!" matches "chest pain". */
function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `
}

function matches(rule: Rule, text: string): boolean {
  if (rule.not?.some((phrase) => text.includes(normalise(phrase).trim()))) return false
  return rule.any.some((phrase) => text.includes(normalise(phrase).trim()))
}

/**
 * Suggest which speciality to book. Null when nothing matched, which is the
 * common case for a two-word search like "dentist andheri" — the caller falls
 * back to ordinary search rather than guessing.
 */
export function routeSymptoms(input: string): Routing | null {
  const text = normalise(input)
  if (text.trim().length < 3) return null

  for (const rule of RED_FLAGS) {
    if (matches(rule, text)) return rule.routing
  }

  for (const rule of RULES) {
    if (matches(rule, text)) return rule.routing
  }

  return null
}

/** Every speciality this table can route to — used to check they all exist. */
export function routableSpecialities(): string[] {
  const found = new Set<string>()
  for (const rule of [...RED_FLAGS, ...RULES]) {
    for (const speciality of rule.routing.specialities) found.add(speciality)
  }
  return [...found].sort()
}
