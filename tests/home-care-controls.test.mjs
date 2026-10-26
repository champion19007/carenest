import test from 'node:test'
import assert from 'node:assert/strict'
import {renderToStaticMarkup} from 'react-dom/server'
import {loadServices} from './service-loader.mjs'

test('a saved review keeps the next admin step available, while terminal requests cannot be changed',()=>{
 const result={notice:'Review saved. The patient can see your response.'}
 const stub=async()=>({})
 const Controls=loadServices(null,{'react':{useActionState:()=>[result,stub,false]},'@/app/actions/home-care':{submitHomeCare:stub,cancelHomeCare:stub,reviewHomeCare:stub}})('components/home-care-request-form.tsx').HomeCareControls
 const reviewing=renderToStaticMarkup(Controls({id:'fixture',revision:1,status:'REVIEWING',admin:true}))
 assert.match(reviewing,/Save review/);assert.match(reviewing,/Record response/);assert.match(reviewing,/Close request/);assert.match(reviewing,/Review saved/)
 const contacted=renderToStaticMarkup(Controls({id:'fixture',revision:2,status:'CONTACTED',admin:true}))
 assert.match(contacted,/Save review/);assert.doesNotMatch(contacted,/Record response/)
 for(const status of ['CLOSED','CANCELLED'])assert.doesNotMatch(renderToStaticMarkup(Controls({id:'fixture',revision:3,status,admin:true})),/Save review|Cancel request/)
 assert.doesNotMatch(renderToStaticMarkup(Controls({id:'fixture',revision:1,status:'CANCELLED'})),/Cancel request/)
})
