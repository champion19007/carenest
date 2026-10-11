import test from 'node:test'
import assert from 'node:assert/strict'
import {siteOrigin} from '../lib/site-origin.ts'
test('hosted public links use the production domain, with safe overrides and local development fallback',()=>{
 assert.equal(siteOrigin({VERCEL_PROJECT_PRODUCTION_URL:'carenest.example.test',VERCEL_URL:'preview.example.test'}),'https://carenest.example.test')
 assert.equal(siteOrigin({APP_ORIGIN:'https://custom.example.test',VERCEL_PROJECT_PRODUCTION_URL:'carenest.example.test'}),'https://custom.example.test')
 assert.equal(siteOrigin({}),'http://localhost:3000')
 for(const origin of ['https://user:secret@example.test','https://example.test/private','https://example.test?token=private','http://example.test'])assert.throws(()=>siteOrigin({APP_ORIGIN:origin}))
})
