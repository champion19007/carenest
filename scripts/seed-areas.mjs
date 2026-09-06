/**
 * Seeds the area registry and the geographic proximity graph.
 *
 * Neighbours are authored by hand, not computed. That is the point: a lookup
 * is a single indexed read, and an area that turns out to be useless as a
 * suggestion can simply be unlinked.
 *
 *   node scripts/seed-areas.mjs
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(process.cwd(), '.data')
mkdirSync(DATA_DIR, { recursive: true })
const db = new DatabaseSync(path.join(DATA_DIR, 'carenest.sqlite'))
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS localities (
    pin_code TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS locality_neighbours (
    pin_code TEXT NOT NULL REFERENCES localities(pin_code) ON DELETE CASCADE,
    neighbour_pin TEXT NOT NULL REFERENCES localities(pin_code) ON DELETE CASCADE,
    PRIMARY KEY (pin_code, neighbour_pin));
`)

const cols = new Set(db.prepare('PRAGMA table_info(doctors)').all().map((c) => c.name))
if (!cols.has('pin_code')) db.exec("ALTER TABLE doctors ADD COLUMN pin_code TEXT NOT NULL DEFAULT ''")

/* -------------------------------------------------------------- areas */

const areas = [
  // Navi Mumbai
  ['410210', 'Kharghar', 'Navi Mumbai'],
  ['400703', 'Vashi', 'Navi Mumbai'],
  ['400614', 'Belapur', 'Navi Mumbai'],
  ['400706', 'Nerul', 'Navi Mumbai'],
  ['410206', 'Kamothe', 'Navi Mumbai'],
  ['410209', 'Panvel', 'Navi Mumbai'],
  ['400708', 'Airoli', 'Navi Mumbai'],
  // Mumbai western suburbs
  ['401107', 'Mira Road East', 'Mumbai'],
  ['401105', 'Bhayandar East', 'Mumbai'],
  ['401101', 'Bhayandar West', 'Mumbai'],
  ['400068', 'Dahisar East', 'Mumbai'],
  ['400066', 'Borivali East', 'Mumbai'],
  ['400092', 'Borivali West', 'Mumbai'],
  ['400067', 'Kandivali West', 'Mumbai'],
]

const upsertArea = db.prepare(
  `INSERT INTO localities (pin_code, name, city) VALUES (?, ?, ?)
   ON CONFLICT(pin_code) DO UPDATE SET name = excluded.name, city = excluded.city`,
)
for (const [pin, name, city] of areas) upsertArea.run(pin, name, city)

/* ---------------------------------------------- proximity graph (edges) */

// Authored adjacency. Written once per pair; both directions are inserted.
const borders = [
  // Navi Mumbai
  ['410210', '410206'], // Kharghar  ↔ Kamothe
  ['410210', '400614'], // Kharghar  ↔ Belapur
  ['410206', '410209'], // Kamothe   ↔ Panvel
  ['400703', '400614'], // Vashi     ↔ Belapur
  ['400703', '400706'], // Vashi     ↔ Nerul
  ['400614', '400706'], // Belapur   ↔ Nerul
  ['400703', '400708'], // Vashi     ↔ Airoli
  // Mumbai western suburbs
  ['401107', '401105'], // Mira Road East ↔ Bhayandar East
  ['401107', '400068'], // Mira Road East ↔ Dahisar East
  ['401101', '401105'], // Bhayandar West ↔ Bhayandar East
  ['401101', '401107'], // Bhayandar West ↔ Mira Road East
  ['401105', '400068'], // Bhayandar East ↔ Dahisar East
  ['400068', '400066'], // Dahisar East   ↔ Borivali East
  ['400066', '400092'], // Borivali East  ↔ Borivali West
  ['400092', '400067'], // Borivali West  ↔ Kandivali West
]

const link = db.prepare(
  'INSERT OR IGNORE INTO locality_neighbours (pin_code, neighbour_pin) VALUES (?, ?)',
)
for (const [a, b] of borders) {
  link.run(a, b)
  link.run(b, a)
}

/* ------------------------------------------------ attach doctors to PINs */

const doctorPins = {
  'ananya-deshmukh': '410210',
  'sandeep-rao': '410210',
  'anita-joshi': '410210',
  'neha-kulkarni': '410210',
  'rohit-menon': '400703',
  'priya-sharma': '400703',
  'imran-qureshi': '400703',
  'meera-nair': '400614',
  'vikram-patil': '400614',
  'lakshmi-raman': '400614',
  'karthik-iyer': '410206',
  'fatima-sheikh': '410209',
}

const setPin = db.prepare('UPDATE doctors SET pin_code = ? WHERE slug = ?')
for (const [slug, pin] of Object.entries(doctorPins)) setPin.run(pin, slug)

/* Two doctors in the western suburbs, so the fallback demo leads somewhere
   real: searching Bhayandar West (401101) finds nothing and suggests
   Mira Road East, which does have doctors. */
const westernDoctors = [
  {
    slug: 'sameer-shaikh', name: 'Dr. Sameer Shaikh', speciality: 'General Physician',
    qualification: 'MBBS, DNB (Family Medicine)', experience: 10,
    clinic: 'Mira Health Clinic', locality: 'Mira Road East', city: 'Mumbai',
    pin: '401107', fee: 500, reg: '2015/08/3312', council: 'Maharashtra Medical Council',
    rating: 4.6, reviews: 87, video: 1, cashless: 1, home: 1, gender: 'Male',
    languages: 'English,Hindi,Marathi', slot: 'Today, 7:00 PM',
    about: 'Everyday illness, diabetes and blood pressure follow-ups. Evening clinic six days a week.',
  },
  {
    slug: 'ritu-agarwal', name: 'Dr. Ritu Agarwal', speciality: 'Paediatrician',
    qualification: 'MBBS, DCH', experience: 13,
    clinic: 'Little Hearts Child Clinic', locality: 'Mira Road East', city: 'Mumbai',
    pin: '401107', fee: 600, reg: '2012/03/9921', council: 'Maharashtra Medical Council',
    rating: 4.8, reviews: 154, video: 1, cashless: 0, home: 0, gender: 'Female',
    languages: 'English,Hindi,Gujarati', slot: 'Tomorrow, 10:30 AM',
    about: 'Vaccination, growth monitoring and childhood illness for newborns upward.',
  },
  {
    slug: 'gaurav-thakur', name: 'Dr. Gaurav Thakur', speciality: 'Dermatologist',
    qualification: 'MBBS, MD (Dermatology)', experience: 9,
    clinic: 'ClearSkin Borivali', locality: 'Borivali West', city: 'Mumbai',
    pin: '400092', fee: 750, reg: '2016/11/4408', council: 'Maharashtra Medical Council',
    rating: 4.5, reviews: 61, video: 1, cashless: 1, home: 0, gender: 'Male',
    languages: 'English,Hindi,Marathi', slot: 'Wed, 6:00 PM',
    about: 'Acne, hair fall and skin allergies. Offers teleconsultation for report review.',
  },
]

const insertDoctor = db.prepare(`INSERT INTO doctors
  (id,user_id,name,speciality,qualification,experience,clinic,locality,city,fee,reg_number,council,
   verified,rating,reviews_count,video,cashless,home_visit,gender,languages,next_slot,kind,slug,about,pin_code,created_at)
  VALUES (?,NULL,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,'human',?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET pin_code=excluded.pin_code, verified=1`)

const now = new Date().toISOString()
for (const d of westernDoctors) {
  insertDoctor.run(
    d.slug, d.name, d.speciality, d.qualification, d.experience, d.clinic, d.locality, d.city,
    d.fee, d.reg, d.council, d.rating, d.reviews, d.video, d.cashless, d.home, d.gender,
    d.languages, d.slot, d.slug, d.about, d.pin, now,
  )
}

/* ------------------------------------------------------------- summary */

const coverage = db.prepare(`
  SELECT l.pin_code, l.name, l.city,
    (SELECT COUNT(*) FROM doctors d WHERE d.pin_code = l.pin_code AND d.verified = 1) AS n
  FROM localities l ORDER BY n DESC, l.name`).all()

console.log(`Areas: ${coverage.length}   Edges: ${db.prepare('SELECT COUNT(*) AS n FROM locality_neighbours').get().n}`)
console.log('\nCoverage:')
for (const row of coverage) {
  console.log(`  ${row.pin_code}  ${row.name.padEnd(16)} ${String(row.n).padStart(2)} doctors`)
}

db.close()
