import test from 'node:test'
import assert from 'node:assert/strict'
import { routeSymptoms, routableSpecialities } from '../lib/taxonomy.ts'

/**
 * Symptom routing.
 *
 * Being a table rather than a model is what makes these tests possible at all:
 * every case below is a fixed input with one right answer, and a regression
 * shows up as a failing assertion rather than as a slightly different summary.
 */

test('the example from the brief routes to nerve specialists', () => {
  const routing = routeSymptoms(
    'My lower back hurts and the pain shoots down my left thigh when I sit',
  )
  assert.ok(routing)
  assert.deepEqual(routing.specialities, ['Neurologist', 'Orthopaedic'])
})

test('plain back pain does not go to a neurologist', () => {
  /* The specific rule must win over the general one, or every backache is
     routed as a nerve problem. */
  const routing = routeSymptoms('my lower back has been hurting since I lifted a box')
  assert.deepEqual(routing.specialities, ['Orthopaedic', 'General Physician'])
})

test('a child is seen by a paediatrician whatever the symptom', () => {
  const routing = routeSymptoms('my child has a high fever and stomach pain')
  assert.deepEqual(routing.specialities, ['Paediatrician'])
})

test('chest pain is flagged rather than merely routed', () => {
  const routing = routeSymptoms('I have chest pain and it feels tight')
  assert.equal(routing.redFlag, true)
  assert.deepEqual(routing.specialities, ['Cardiologist'])
})

test('a red flag beats an ordinary match in the same sentence', () => {
  /* "cough" would route to a General Physician on its own. The urgent reading
     has to win, or the more common word decides. */
  const routing = routeSymptoms('bad cough and chest pain since morning')
  assert.equal(routing.redFlag, true)
})

test('an ordinary complaint is not flagged as urgent', () => {
  assert.notEqual(routeSymptoms('itchy rash on my arm').redFlag, true)
  assert.notEqual(routeSymptoms('toothache on the left side').redFlag, true)
})

test('punctuation and capitals do not change the answer', () => {
  const plain = routeSymptoms('chest pain')
  const messy = routeSymptoms('CHEST-PAIN!!!  ')
  assert.deepEqual(messy.specialities, plain.specialities)
  assert.equal(messy.redFlag, plain.redFlag)
})

test('a plain speciality search is left alone', () => {
  /* Someone typing "dentist andheri" wants search, not triage. Guessing here
     would hijack an ordinary query. */
  assert.equal(routeSymptoms('andheri'), null)
  assert.equal(routeSymptoms(''), null)
  assert.equal(routeSymptoms('a'), null)
})

test('common Indian phrasings are recognised', () => {
  assert.deepEqual(routeSymptoms('loose motion since yesterday').specialities, [
    'General Physician',
  ])
  assert.deepEqual(routeSymptoms('sugar and bp check').specialities, [
    'General Physician',
    'Cardiologist',
  ])
  assert.deepEqual(routeSymptoms('hair fall problem').specialities, ['Dermatologist'])
})

test('mental health routes to a psychiatrist rather than a physician', () => {
  assert.deepEqual(routeSymptoms('I cannot sleep and feel anxious').specialities, [
    'Psychiatrist',
  ])
})

test('every routable speciality is one the platform actually lists', () => {
  /* A rule pointing at a speciality no doctor has is a routing dead end: the
     patient is told who to see and then shown nothing. */
  const known = new Set([
    'General Physician',
    'Cardiologist',
    'Gynaecologist',
    'Dermatologist',
    'Paediatrician',
    'Orthopaedic',
    'ENT Specialist',
    'Psychiatrist',
    'Neurologist',
    'Dentist',
    'Ophthalmologist',
  ])
  for (const speciality of routableSpecialities()) {
    assert.ok(known.has(speciality), `${speciality} is routed to but not listed`)
  }
})

test('routing never returns an empty list', () => {
  const inputs = [
    'fever',
    'my child has a rash',
    'chest pain',
    'period pain',
    'blurred vision',
    'ear ache',
  ]
  for (const input of inputs) {
    const routing = routeSymptoms(input)
    assert.ok(routing && routing.specialities.length > 0, `${input} produced nothing`)
  }
})
