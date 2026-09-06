/**
 * Seeds the SQL store so the app has real rows to query.
 * Safe to re-run — doctors are upserted, the demo account is reused.
 *
 *   npm run seed
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(process.cwd(), '.data')
mkdirSync(DATA_DIR, { recursive: true })
const db = new DatabaseSync(path.join(DATA_DIR, 'carenest.sqlite'))
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
    email TEXT, dob TEXT, gender TEXT, city TEXT,
    role TEXT NOT NULL DEFAULT 'patient', created_at TEXT NOT NULL, last_login_at TEXT);
  CREATE TABLE IF NOT EXISTS doctors (
    id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL, speciality TEXT NOT NULL, qualification TEXT NOT NULL DEFAULT '',
    experience INTEGER NOT NULL DEFAULT 0, clinic TEXT NOT NULL DEFAULT '',
    locality TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
    fee INTEGER NOT NULL DEFAULT 0, reg_number TEXT, council TEXT,
    verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS otps (
    phone TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    salt TEXT NOT NULL, created_at TEXT NOT NULL, last_login_at TEXT);
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS rate_limits (
    bucket TEXT NOT NULL, key TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
    window_start TEXT NOT NULL, PRIMARY KEY (bucket, key));
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id TEXT NOT NULL, kind TEXT NOT NULL, slot TEXT NOT NULL,
    fee INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL);
`)

// Columns added after the first release.
const cols = new Set(db.prepare('PRAGMA table_info(doctors)').all().map((c) => c.name))
const additions = [
  ['rating', 'REAL NOT NULL DEFAULT 0'],
  ['reviews_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['video', 'INTEGER NOT NULL DEFAULT 0'],
  ['cashless', 'INTEGER NOT NULL DEFAULT 0'],
  ['home_visit', 'INTEGER NOT NULL DEFAULT 0'],
  ['gender', "TEXT NOT NULL DEFAULT 'Female'"],
  ['languages', "TEXT NOT NULL DEFAULT ''"],
  ['next_slot', "TEXT NOT NULL DEFAULT ''"],
  ['kind', "TEXT NOT NULL DEFAULT 'human'"],
  ['slug', "TEXT NOT NULL DEFAULT ''"],
  ['about', "TEXT NOT NULL DEFAULT ''"],
]
for (const [name, decl] of additions) {
  if (!cols.has(name)) db.exec(`ALTER TABLE doctors ADD COLUMN ${name} ${decl}`)
}

const doctors = [
  {
    slug: 'ananya-deshmukh', name: 'Dr. Ananya Deshmukh', speciality: 'General Physician',
    qualification: 'MBBS, MD (Internal Medicine)', experience: 12,
    clinic: 'Sunrise Multispeciality Clinic', locality: 'Kharghar', city: 'Navi Mumbai',
    fee: 600, reg: '2013/04/8821', council: 'Maharashtra Medical Council',
    rating: 4.8, reviews: 238, video: 1, cashless: 1, home: 1, gender: 'Female',
    languages: 'English,Hindi,Marathi', slot: 'Today, 6:30 PM', kind: 'human',
    about: 'Treats fever, infections, diabetes and blood pressure. Known for explaining test results in plain language rather than jargon.',
  },
  {
    slug: 'rohit-menon', name: 'Dr. Rohit Menon', speciality: 'Cardiologist',
    qualification: 'MBBS, MD, DM (Cardiology)', experience: 18,
    clinic: 'Heartcare Institute', locality: 'Vashi', city: 'Navi Mumbai',
    fee: 1200, reg: '2007/11/3310', council: 'Maharashtra Medical Council',
    rating: 4.9, reviews: 412, video: 1, cashless: 1, home: 0, gender: 'Male',
    languages: 'English,Hindi,Malayalam', slot: 'Tomorrow, 11:00 AM', kind: 'human',
    about: 'Interventional cardiologist. Sees patients for chest pain, palpitations, high cholesterol and post-angioplasty follow-up.',
  },
  {
    slug: 'fatima-sheikh', name: 'Dr. Fatima Sheikh', speciality: 'Gynaecologist',
    qualification: 'MBBS, DGO, DNB (Obs & Gynae)', experience: 9,
    clinic: 'Aarogya Women’s Clinic', locality: 'Panvel', city: 'Navi Mumbai',
    fee: 700, reg: '2016/02/7742', council: 'Maharashtra Medical Council',
    rating: 4.7, reviews: 156, video: 1, cashless: 0, home: 0, gender: 'Female',
    languages: 'English,Hindi,Urdu', slot: 'Today, 8:00 PM', kind: 'human',
    about: 'Pregnancy care, PCOS and menstrual problems. Keeps evening slots for working patients.',
  },
  {
    slug: 'karthik-iyer', name: 'Dr. Karthik Iyer', speciality: 'Dermatologist',
    qualification: 'MBBS, MD (Dermatology)', experience: 7,
    clinic: 'SkinWorks Clinic', locality: 'Kamothe', city: 'Navi Mumbai',
    fee: 800, reg: '2018/06/9903', council: 'Maharashtra Medical Council',
    rating: 4.6, reviews: 94, video: 0, cashless: 1, home: 0, gender: 'Male',
    languages: 'English,Tamil,Hindi', slot: 'Wed, 5:15 PM', kind: 'human',
    about: 'Acne, pigmentation, hair fall and fungal infections. Uses photographs to track progress between visits.',
  },
  {
    slug: 'meera-nair', name: 'Dr. Meera Nair', speciality: 'Paediatrician',
    qualification: 'MBBS, MD (Paediatrics)', experience: 14,
    clinic: 'Little Steps Child Care', locality: 'Belapur', city: 'Navi Mumbai',
    fee: 650, reg: '2011/09/5567', council: 'Maharashtra Medical Council',
    rating: 4.9, reviews: 321, video: 1, cashless: 1, home: 1, gender: 'Female',
    languages: 'English,Hindi,Malayalam', slot: 'Today, 4:45 PM', kind: 'human',
    about: 'Newborn care, vaccination schedules and childhood illness. Keeps a growth chart for every child.',
  },
  {
    slug: 'sandeep-rao', name: 'Dr. Sandeep Rao', speciality: 'Orthopaedic',
    qualification: 'MBBS, MS (Orthopaedics)', experience: 21,
    clinic: 'BoneJoint Care Centre', locality: 'Kharghar', city: 'Navi Mumbai',
    fee: 900, reg: '2004/03/1129', council: 'Maharashtra Medical Council',
    rating: 4.5, reviews: 187, video: 0, cashless: 0, home: 0, gender: 'Male',
    languages: 'English,Hindi,Kannada', slot: 'Thu, 10:30 AM', kind: 'human',
    about: 'Knee and shoulder problems, sports injuries and fracture care. Prefers physiotherapy before surgery where possible.',
  },
  {
    slug: 'priya-sharma', name: 'Dr. Priya Sharma', speciality: 'General Physician',
    qualification: 'MBBS, DNB (Family Medicine)', experience: 6,
    clinic: 'Wellness Point Clinic', locality: 'Vashi', city: 'Navi Mumbai',
    fee: 450, reg: '2019/07/4412', council: 'Maharashtra Medical Council',
    rating: 4.4, reviews: 63, video: 1, cashless: 0, home: 1, gender: 'Female',
    languages: 'English,Hindi', slot: 'Today, 7:15 PM', kind: 'human',
    about: 'Everyday illness, health checkups and prescription refills. Same-day slots most evenings.',
  },
  {
    slug: 'vikram-patil', name: 'Dr. Vikram Patil', speciality: 'Psychiatrist',
    qualification: 'MBBS, MD (Psychiatry)', experience: 15,
    clinic: 'Mindful Care Centre', locality: 'Belapur', city: 'Navi Mumbai',
    fee: 1500, reg: '2010/05/2298', council: 'Maharashtra Medical Council',
    rating: 4.8, reviews: 142, video: 1, cashless: 0, home: 0, gender: 'Male',
    languages: 'English,Hindi,Marathi', slot: 'Fri, 3:00 PM', kind: 'human',
    about: 'Anxiety, depression, sleep problems and ADHD assessment. Offers video consultations for follow-ups.',
  },
  {
    slug: 'anita-joshi', name: 'Dr. Anita Joshi', speciality: 'ENT Specialist',
    qualification: 'MBBS, MS (ENT)', experience: 11,
    clinic: 'ClearSound ENT', locality: 'Kharghar', city: 'Navi Mumbai',
    fee: 700, reg: '2014/01/6650', council: 'Maharashtra Medical Council',
    rating: 4.6, reviews: 108, video: 1, cashless: 1, home: 0, gender: 'Female',
    languages: 'English,Hindi,Marathi', slot: 'Tomorrow, 12:00 PM', kind: 'human',
    about: 'Ear infections, sinus problems, tonsils and hearing tests.',
  },
  {
    slug: 'neha-kulkarni', name: 'Dr. Neha Kulkarni', speciality: 'Small Animal Practice',
    qualification: 'B.V.Sc & A.H., M.V.Sc', experience: 11,
    clinic: 'PawCare Veterinary Clinic', locality: 'Kharghar', city: 'Navi Mumbai',
    fee: 700, reg: 'VET/2014/2201', council: 'Maharashtra Veterinary Council',
    rating: 4.9, reviews: 264, video: 1, cashless: 0, home: 1, gender: 'Female',
    languages: 'English,Hindi,Marathi', slot: 'Today, 5:30 PM', kind: 'vet',
    about: 'Dogs, cats and rabbits. Vaccination, deworming and general illness, with home visits across Navi Mumbai.',
  },
  {
    slug: 'imran-qureshi', name: 'Dr. Imran Qureshi', speciality: 'Veterinary Surgeon',
    qualification: 'B.V.Sc & A.H., M.V.Sc (Surgery)', experience: 16,
    clinic: 'Companion Animal Hospital', locality: 'Vashi', city: 'Navi Mumbai',
    fee: 1000, reg: 'VET/2009/1180', council: 'Maharashtra Veterinary Council',
    rating: 4.8, reviews: 189, video: 0, cashless: 0, home: 0, gender: 'Male',
    languages: 'English,Hindi,Urdu', slot: 'Tomorrow, 10:00 AM', kind: 'vet',
    about: 'Soft tissue and orthopaedic surgery for dogs and cats, including spay and neuter procedures.',
  },
  {
    slug: 'lakshmi-raman', name: 'Dr. Lakshmi Raman', speciality: 'Avian & Exotic Pets',
    qualification: 'B.V.Sc & A.H.', experience: 8,
    clinic: 'Feathers & Friends Clinic', locality: 'Belapur', city: 'Navi Mumbai',
    fee: 800, reg: 'VET/2017/3390', council: 'Maharashtra Veterinary Council',
    rating: 4.7, reviews: 76, video: 1, cashless: 0, home: 0, gender: 'Female',
    languages: 'English,Tamil,Hindi', slot: 'Today, 7:00 PM', kind: 'vet',
    about: 'Birds, rabbits and fish. One of the few exotic-pet vets in the region.',
  },
]

const insert = db.prepare(`INSERT INTO doctors
  (id,user_id,name,speciality,qualification,experience,clinic,locality,city,fee,reg_number,council,
   verified,rating,reviews_count,video,cashless,home_visit,gender,languages,next_slot,kind,slug,about,created_at)
  VALUES (?,NULL,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    rating=excluded.rating, reviews_count=excluded.reviews_count, video=excluded.video,
    cashless=excluded.cashless, home_visit=excluded.home_visit, gender=excluded.gender,
    languages=excluded.languages, next_slot=excluded.next_slot, kind=excluded.kind,
    slug=excluded.slug, about=excluded.about, verified=1`)

const now = new Date().toISOString()
for (const d of doctors) {
  insert.run(
    d.slug, d.name, d.speciality, d.qualification, d.experience, d.clinic, d.locality, d.city,
    d.fee, d.reg, d.council, d.rating, d.reviews, d.video, d.cashless, d.home, d.gender,
    d.languages, d.slot, d.kind, d.slug, d.about, now,
  )
}

console.log(`Doctors in table: ${db.prepare('SELECT COUNT(*) AS n FROM doctors').get().n}`)

// A demo clinic account, so /practice can be opened without editing rows by hand.
const demoPhone = '9000000001'
const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(demoPhone)
if (existing) {
  db.prepare("UPDATE users SET role = 'doctor' WHERE id = ?").run(existing.id)
  console.log(`Demo clinic login present: +91 ${demoPhone} (role: doctor)`)
} else {
  db.prepare('INSERT INTO users (id,phone,name,role,created_at) VALUES (?,?,?,?,?)')
    .run('usr_demo_doctor', demoPhone, 'Dr. Ananya Deshmukh', 'doctor', now)
  console.log(`Demo clinic login created: +91 ${demoPhone} (role: doctor)`)
}

db.close()
