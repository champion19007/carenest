/**
 * Seeds Postgres — areas, the proximity graph, doctors and a demo clinic login.
 *
 *   npm run seed
 *
 * Runs against Neon when DATABASE_URL is set, otherwise the local PGlite
 * instance under .data/pg. Idempotent: re-running upserts rather than
 * duplicating.
 *
 * The adjacency graph is built here, offline, from locality centroids — a
 * k-nearest-neighbour pass over 14 points. The request path only ever reads
 * the resulting table; it never sees a coordinate.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

/* ── connection ─────────────────────────────────────────────────────── */

const url = process.env.DATABASE_URL
let query, close

if (url) {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)
  query = (text, params = []) => sql.query(text, params)
  close = async () => {}
  console.log('Target: Neon')
} else {
  const { PGlite } = await import('@electric-sql/pglite')
  const { mkdirSync } = await import('node:fs')
  const dir = path.join(process.cwd(), '.data', 'pg')
  mkdirSync(dir, { recursive: true })
  const pg = new PGlite(dir)
  query = async (text, params = []) => (await pg.query(text, params)).rows
  close = () => pg.close()
  console.log('Target: PGlite (.data/pg)')
}

/* ── schema ─────────────────────────────────────────────────────────── */

// Pull the schema straight out of the TypeScript module so it can never drift
// from what the app applies at runtime.
const schemaSrc = readFileSync(path.join(process.cwd(), 'lib', 'db', 'schema.ts'), 'utf8')
const SCHEMA = schemaSrc.slice(schemaSrc.indexOf('`') + 1, schemaSrc.lastIndexOf('`'))

// Strip `--` comments before splitting: a semicolon inside a comment would
// otherwise cut a statement in half.
const statements = SCHEMA
  .replace(/^\s*--.*$/gm, '')
  .split(';')
  .map((line) => line.trim())
  .filter(Boolean)

for (const stmt of statements) {
  await query(stmt)
}
console.log('Schema applied')

/* ── areas ──────────────────────────────────────────────────────────── */

// Centroids are used once, here, to compute adjacency. They are never read at
// request time and never rendered.
const areas = [
  ['410210', 'Kharghar',        'Navi Mumbai', 19.0330, 73.0297],
  ['400703', 'Vashi',           'Navi Mumbai', 19.0770, 72.9986],
  ['400614', 'Belapur',         'Navi Mumbai', 19.0237, 73.0400],
  ['400706', 'Nerul',           'Navi Mumbai', 19.0330, 73.0180],
  ['410206', 'Kamothe',         'Navi Mumbai', 19.0220, 73.0980],
  ['410209', 'Panvel',          'Navi Mumbai', 18.9894, 73.1175],
  ['400708', 'Airoli',          'Navi Mumbai', 19.1590, 72.9960],
  ['401107', 'Mira Road East',  'Mumbai',      19.2810, 72.8710],
  ['401105', 'Bhayandar East',  'Mumbai',      19.3010, 72.8510],
  ['401101', 'Bhayandar West',  'Mumbai',      19.3020, 72.8420],
  ['400068', 'Dahisar East',    'Mumbai',      19.2500, 72.8590],
  ['400066', 'Borivali East',   'Mumbai',      19.2300, 72.8600],
  ['400092', 'Borivali West',   'Mumbai',      19.2290, 72.8560],
  ['400067', 'Kandivali West',  'Mumbai',      19.2050, 72.8300],
]

for (const [pin, name, city, lat, lng] of areas) {
  await query(
    `INSERT INTO localities (pin_code, name, city, lat, lng) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (pin_code) DO UPDATE
       SET name = excluded.name, city = excluded.city, lat = excluded.lat, lng = excluded.lng`,
    [pin, name, city, lat, lng],
  )
}

const localityRows = await query('SELECT locality_id, pin_code, name, lat, lng FROM localities')
const byPin = new Map(localityRows.map((r) => [r.pin_code, r]))
console.log(`Areas: ${localityRows.length}`)

/* ── offline adjacency build (the "map" cost, paid once) ────────────── */

const R = 6371 // km
const toRad = (d) => (d * Math.PI) / 180

function haversine(a, b) {
  const dLat = toRad(Number(b.lat) - Number(a.lat))
  const dLng = toRad(Number(b.lng) - Number(a.lng))
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(Number(a.lat))) * Math.cos(toRad(Number(b.lat))) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const K = 4          // neighbours per ring
const RING1_KM = 6   // within this, ring 1; beyond, ring 2
const MAX_KM = 15    // never suggest anything further than this

await query('DELETE FROM locality_adjacency')

let edges = 0
for (const origin of localityRows) {
  const ranked = localityRows
    .filter((other) => other.locality_id !== origin.locality_id)
    .map((other) => ({ other, km: haversine(origin, other) }))
    .filter(({ km }) => km <= MAX_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, K * 2)

  for (const [index, { other, km }] of ranked.entries()) {
    const ring = km <= RING1_KM && index < K ? 1 : 2
    await query(
      `INSERT INTO locality_adjacency (locality_id, neighbor_locality_id, ring, distance_km)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (locality_id, neighbor_locality_id) DO UPDATE
         SET ring = excluded.ring, distance_km = excluded.distance_km`,
      [origin.locality_id, other.locality_id, ring, Math.round(km * 10) / 10],
    )
    edges += 1
  }
}
console.log(`Adjacency edges: ${edges} (computed offline, k=${K}, max ${MAX_KM} km)`)

/* ── doctors ────────────────────────────────────────────────────────── */

const doctors = [
  ['ananya-deshmukh','Dr. Ananya Deshmukh','General Physician','MBBS, MD (Internal Medicine)',12,'Sunrise Multispeciality Clinic','410210',600,'2013/04/8821','Maharashtra Medical Council',4.8,238,true,true,true,'Female','English,Hindi,Marathi','Today, 6:30 PM','human','Treats fever, infections, diabetes and blood pressure. Known for explaining test results in plain language rather than jargon.'],
  ['rohit-menon','Dr. Rohit Menon','Cardiologist','MBBS, MD, DM (Cardiology)',18,'Heartcare Institute','400703',1200,'2007/11/3310','Maharashtra Medical Council',4.9,412,true,true,false,'Male','English,Hindi,Malayalam','Tomorrow, 11:00 AM','human','Interventional cardiologist. Sees patients for chest pain, palpitations, high cholesterol and post-angioplasty follow-up.'],
  ['fatima-sheikh','Dr. Fatima Sheikh','Gynaecologist','MBBS, DGO, DNB (Obs & Gynae)',9,'Aarogya Women’s Clinic','410209',700,'2016/02/7742','Maharashtra Medical Council',4.7,156,true,false,false,'Female','English,Hindi,Urdu','Today, 8:00 PM','human','Pregnancy care, PCOS and menstrual problems. Keeps evening slots for working patients.'],
  ['karthik-iyer','Dr. Karthik Iyer','Dermatologist','MBBS, MD (Dermatology)',7,'SkinWorks Clinic','410206',800,'2018/06/9903','Maharashtra Medical Council',4.6,94,false,true,false,'Male','English,Tamil,Hindi','Wed, 5:15 PM','human','Acne, pigmentation, hair fall and fungal infections. Uses photographs to track progress between visits.'],
  ['meera-nair','Dr. Meera Nair','Paediatrician','MBBS, MD (Paediatrics)',14,'Little Steps Child Care','400614',650,'2011/09/5567','Maharashtra Medical Council',4.9,321,true,true,true,'Female','English,Hindi,Malayalam','Today, 4:45 PM','human','Newborn care, vaccination schedules and childhood illness. Keeps a growth chart for every child.'],
  ['sandeep-rao','Dr. Sandeep Rao','Orthopaedic','MBBS, MS (Orthopaedics)',21,'BoneJoint Care Centre','410210',900,'2004/03/1129','Maharashtra Medical Council',4.5,187,false,false,false,'Male','English,Hindi,Kannada','Thu, 10:30 AM','human','Knee and shoulder problems, sports injuries and fracture care. Prefers physiotherapy before surgery where possible.'],
  ['priya-sharma','Dr. Priya Sharma','General Physician','MBBS, DNB (Family Medicine)',6,'Wellness Point Clinic','400703',450,'2019/07/4412','Maharashtra Medical Council',4.4,63,true,false,true,'Female','English,Hindi','Today, 7:15 PM','human','Everyday illness, health checkups and prescription refills. Same-day slots most evenings.'],
  ['vikram-patil','Dr. Vikram Patil','Psychiatrist','MBBS, MD (Psychiatry)',15,'Mindful Care Centre','400614',1500,'2010/05/2298','Maharashtra Medical Council',4.8,142,true,false,false,'Male','English,Hindi,Marathi','Fri, 3:00 PM','human','Anxiety, depression, sleep problems and ADHD assessment. Offers video consultations for follow-ups.'],
  ['anita-joshi','Dr. Anita Joshi','ENT Specialist','MBBS, MS (ENT)',11,'ClearSound ENT','410210',700,'2014/01/6650','Maharashtra Medical Council',4.6,108,true,true,false,'Female','English,Hindi,Marathi','Tomorrow, 12:00 PM','human','Ear infections, sinus problems, tonsils and hearing tests.'],
  ['sameer-shaikh','Dr. Sameer Shaikh','General Physician','MBBS, DNB (Family Medicine)',10,'Mira Health Clinic','401107',500,'2015/08/3312','Maharashtra Medical Council',4.6,87,true,true,true,'Male','English,Hindi,Marathi','Today, 7:00 PM','human','Everyday illness, diabetes and blood pressure follow-ups. Evening clinic six days a week.'],
  ['ritu-agarwal','Dr. Ritu Agarwal','Paediatrician','MBBS, DCH',13,'Little Hearts Child Clinic','401107',600,'2012/03/9921','Maharashtra Medical Council',4.8,154,true,false,false,'Female','English,Hindi,Gujarati','Tomorrow, 10:30 AM','human','Vaccination, growth monitoring and childhood illness for newborns upward.'],
  ['gaurav-thakur','Dr. Gaurav Thakur','Dermatologist','MBBS, MD (Dermatology)',9,'ClearSkin Borivali','400092',750,'2016/11/4408','Maharashtra Medical Council',4.5,61,true,true,false,'Male','English,Hindi,Marathi','Wed, 6:00 PM','human','Acne, hair fall and skin allergies. Offers teleconsultation for report review.'],
  ['neha-kulkarni','Dr. Neha Kulkarni','Small Animal Practice','B.V.Sc & A.H., M.V.Sc',11,'PawCare Veterinary Clinic','410210',700,'VET/2014/2201','Maharashtra Veterinary Council',4.9,264,true,false,true,'Female','English,Hindi,Marathi','Today, 5:30 PM','vet','Dogs, cats and rabbits. Vaccination, deworming and general illness, with home visits across Navi Mumbai.'],
  ['imran-qureshi','Dr. Imran Qureshi','Veterinary Surgeon','B.V.Sc & A.H., M.V.Sc (Surgery)',16,'Companion Animal Hospital','400703',1000,'VET/2009/1180','Maharashtra Veterinary Council',4.8,189,false,false,false,'Male','English,Hindi,Urdu','Tomorrow, 10:00 AM','vet','Soft tissue and orthopaedic surgery for dogs and cats, including spay and neuter procedures.'],
  ['lakshmi-raman','Dr. Lakshmi Raman','Avian & Exotic Pets','B.V.Sc & A.H.',8,'Feathers & Friends Clinic','400614',800,'VET/2017/3390','Maharashtra Veterinary Council',4.7,76,true,false,false,'Female','English,Tamil,Hindi','Today, 7:00 PM','vet','Birds, rabbits and fish. One of the few exotic-pet vets in the region.'],
]

for (const d of doctors) {
  const [slug,name,spec,qual,exp,clinic,pin,fee,reg,council,rating,reviews,video,cashless,home,gender,langs,slot,kind,about] = d
  const area = byPin.get(pin)
  await query(
    `INSERT INTO doctors
      (id, slug, name, speciality, qualification, experience, clinic, locality_id, pin_code,
       locality, city, fee, registration_no, council, status, rating, reviews_count,
       video, cashless, home_visit, gender, languages, next_slot, kind, about)
     VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ACTIVE',$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     ON CONFLICT (id) DO UPDATE SET
       locality_id = excluded.locality_id, pin_code = excluded.pin_code,
       locality = excluded.locality, city = excluded.city, rating = excluded.rating,
       reviews_count = excluded.reviews_count, video = excluded.video,
       cashless = excluded.cashless, home_visit = excluded.home_visit,
       next_slot = excluded.next_slot, about = excluded.about, status = 'ACTIVE'`,
    [slug,name,spec,qual,exp,clinic,area.locality_id,pin,area.name,
     area.name.includes('Mumbai') ? 'Mumbai' : (pin.startsWith('41') || pin === '400703' || pin === '400614' || pin === '400706' || pin === '400708' ? 'Navi Mumbai' : 'Mumbai'),
     fee,reg,council,rating,reviews,video,cashless,home,gender,langs,slot,kind,about],
  )
}
console.log(`Doctors: ${(await query('SELECT COUNT(*) AS n FROM doctors'))[0].n}`)

/* ── demo clinic login ──────────────────────────────────────────────── */

const DEMO_PHONE = '9000000001'
await query(
  `INSERT INTO users (id, phone, name, role) VALUES ($1,$2,$3,'doctor')
   ON CONFLICT (phone) DO UPDATE SET role = 'doctor'`,
  ['usr_demo_doctor', DEMO_PHONE, 'Dr. Ananya Deshmukh'],
)

/* ── coverage report ────────────────────────────────────────────────── */

const coverage = await query(`
  SELECT l.pin_code, l.name,
    (SELECT COUNT(*) FROM doctors d WHERE d.locality_id = l.locality_id AND d.status='ACTIVE') AS n
  FROM localities l ORDER BY n DESC, l.name`)

console.log('\nCoverage:')
for (const row of coverage) {
  console.log(`  ${row.pin_code}  ${row.name.padEnd(16)} ${String(row.n).padStart(2)} doctors`)
}
console.log(`\nDemo clinic login: +91 ${DEMO_PHONE} (role: doctor)`)

await close()
