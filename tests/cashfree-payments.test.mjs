import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {freshDb,addUser} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'

test('Cashfree sandbox money flow verifies provider evidence and preserves accounting',async t=>{
 const before={...process.env},originalFetch=globalThis.fetch
 Object.assign(process.env,{CARENEST_LOCAL_MODE:'1',AUTH_SECRET:'cashfree-fixture-auth-secret-'.repeat(3),ENABLE_PAYMENTS:'1',CASHFREE_ENV:'sandbox',CASHFREE_CLIENT_ID:'TEST_fixture',CASHFREE_CLIENT_SECRET:'private-fixture-secret',APP_ORIGIN:'http://localhost:3000'})
 const db=await freshDb(),load=loadServices(db),billing=load('lib/domain/billing.ts'),demo=load('lib/domain/demo-payments.ts'),hooks=load('lib/domain/cashfree-webhooks.ts'),provider=load('lib/cashfree.ts')
 const orders=new Map(),refunds=new Map();let creates=0,timeoutAfterCreate=false,badAmount=false,badCurrency=false,paymentState='PENDING',paymentSerial=1000,refundState='PENDING',authFail=false,webhookDuringRefund=false
 globalThis.fetch=async(url,options={})=>{
  const href=String(url);assert.ok(href.startsWith('https://sandbox.cashfree.com/pg/'));assert.equal(options.headers['x-client-secret'],'private-fixture-secret');assert.equal(options.cache,'no-store')
  if(authFail)return Response.json({},{status:401})
  const parts=href.replace('https://sandbox.cashfree.com/pg/','').split('/')
  if(parts.length===1&&parts[0]==='orders'&&options.method==='POST'){
   creates++;const body=JSON.parse(options.body);assert.match(options.headers['x-idempotency-key'],/^[a-f0-9-]{36}$/);assert.equal(body.customer_details.customer_phone,'9999999999');assert.equal(body.customer_details.customer_email,undefined)
   assert.ok(body.order_id.length<=45);const row={...body,order_status:'ACTIVE',payment_session_id:'sandbox_session_'+body.order_id,paymentId:String(++paymentSerial)};orders.set(row.order_id,row)
   if(timeoutAfterCreate){timeoutAfterCreate=false;throw new Error('Lost response after provider accepted order')}
   return Response.json(row)
  }
  const order=orders.get(parts[1]);if(!order)return Response.json({},{status:404})
  if(parts.length===2)return Response.json({...order,order_status:paymentState==='SUCCESS'?'PAID':'ACTIVE'})
  if(parts[2]==='payments')return Response.json([{order_id:order.order_id,cf_payment_id:order.paymentId,payment_amount:badAmount?0.01:order.order_amount,payment_currency:badCurrency?'USD':'INR',payment_status:paymentState}])
  if(parts[2]==='refunds'){
   if(options.method==='POST'){const body=JSON.parse(options.body);assert.match(options.headers['x-idempotency-key'],/^[a-f0-9-]{36}$/);const r={...body,order_id:order.order_id,cf_payment_id:order.paymentId,refund_currency:'INR',refund_status:refundState};refunds.set(body.refund_id,r);if(webhookDuringRefund){refundState='SUCCESS';await hooks.acceptCashfreeWebhook(...sign({type:'REFUND_STATUS_WEBHOOK',data:{refund:{refund_id:body.refund_id}}}));return Response.json({...r,refund_status:'PENDING'})}return Response.json(r)}
   const r=refunds.get(parts[3]);return r?Response.json({...r,refund_status:refundState}):Response.json({},{status:404})
  }
  throw new Error('Unexpected provider request')
 }
 const sign=body=>{const raw=Buffer.from(JSON.stringify(body)),timestamp='1791500000000';return [raw,timestamp,createHmac('sha256',process.env.CASHFREE_CLIENT_SECRET).update(timestamp).update(raw).digest('base64')]}
 let invoiceId,payment,refundId
 try{
  await addUser(db,'owner','9000000001');await addUser(db,'other','9000000002');await addUser(db,'desk','9000000003')
  await db.query("INSERT INTO clinic.clinics(id,name) VALUES('lab','Cashfree fixture lab')")
  await db.query("INSERT INTO clinic.memberships(clinic_id,user_id,role) VALUES('lab','desk','lab')")
  await db.query("INSERT INTO clinic.lab_packages(id,clinic_id,name,fee_paise,status,verified_at) VALUES('package','lab','Fixture package',35017,'ACTIVE',now())")
  const lab=await load('lib/domain/labs.ts').requestLabOrder('owner','package',null,'cashfree-lab-request-fixture',true)
  invoiceId=(await db.one('SELECT id FROM clinic.invoices WHERE lab_order_id=$1',[lab])).id
  await t.test('owned invoice price is converted to rupees exactly, credentials remain server-only, and order keys are reused',async()=>{
   await assert.rejects(billing.createPaymentOrder('other',invoiceId,'foreign-order-attempt-fixture'),e=>e.code==='NOT_FOUND');assert.equal(creates,0)
   payment=await billing.createPaymentOrder('owner',invoiceId,'cashfree-invoice-request-fixture');assert.equal(payment.amountPaise,'35017');assert.equal(payment.mode,'sandbox');assert.ok(payment.paymentSessionId);assert.equal(payment.keyId,undefined);assert.equal(orders.get(payment.externalOrderId).order_amount,350.17)
   assert.equal((await billing.createPaymentOrder('owner',invoiceId,'cashfree-invoice-request-fixture')).externalOrderId,payment.externalOrderId);assert.equal(creates,1)
   process.env.CASHFREE_ENV='production';assert.equal(provider.cashfreeConfigured(),false);await assert.rejects(billing.createPaymentOrder('owner',invoiceId,'production-rejected-request'),e=>e.code==='NOT_CONFIGURED');process.env.CASHFREE_ENV='sandbox'
  })
  await t.test('pending and failed payments cannot pay an invoice; forged, foreign and mismatched evidence is rejected',async()=>{
   await assert.rejects(billing.verifyCheckout('other',payment.externalOrderId),e=>e.code==='NOT_FOUND')
   for(const state of ['PENDING','FAILED','USER_DROPPED']){paymentState=state;assert.equal((await billing.verifyCheckout('owner',payment.externalOrderId)).state,'AWAITING_CAPTURE');assert.equal((await db.one('SELECT state FROM clinic.invoices WHERE id=$1',[invoiceId])).state,'UNPAID')}
   paymentState='SUCCESS';badAmount=true;await assert.rejects(billing.verifyCheckout('owner',payment.externalOrderId),e=>e.code==='AMOUNT');badAmount=false;badCurrency=true;await assert.rejects(billing.verifyCheckout('owner',payment.externalOrderId),e=>e.code==='AMOUNT');badCurrency=false
   const event={type:'PAYMENT_SUCCESS_WEBHOOK',data:{order:{order_id:payment.externalOrderId,order_amount:350.17,order_currency:'INR'},payment:{cf_payment_id:orders.get(payment.externalOrderId).paymentId,payment_status:'SUCCESS',payment_amount:350.17,payment_currency:'INR'}}};const proof=sign(event)
   await assert.rejects(hooks.acceptCashfreeWebhook(proof[0],proof[1],'A'.repeat(43)+'='),e=>e.code==='SIGNATURE')
   await assert.rejects(hooks.acceptCashfreeWebhook(Buffer.from(JSON.stringify({...event,event_time:'changed'})),proof[1],proof[2]),e=>e.code==='SIGNATURE')
  })
  await t.test('checkout plus repeated webhook produces one balanced capture and failed events cannot reverse it',async()=>{
   assert.equal((await billing.verifyCheckout('owner',payment.externalOrderId)).state,'CAPTURED')
   const row=orders.get(payment.externalOrderId),proof=sign({type:'PAYMENT_SUCCESS_WEBHOOK',data:{order:{order_id:row.order_id,order_amount:row.order_amount,order_currency:'INR'},payment:{cf_payment_id:row.paymentId,payment_status:'SUCCESS',payment_amount:row.order_amount,payment_currency:'INR'}}})
   await hooks.acceptCashfreeWebhook(...proof);await hooks.acceptCashfreeWebhook(...proof)
   await hooks.acceptCashfreeWebhook(...sign({type:'PAYMENT_FAILED_WEBHOOK',data:{order:{order_id:row.order_id}}}))
   assert.equal((await db.one('SELECT state FROM clinic.invoices WHERE id=$1',[invoiceId])).state,'PAID');assert.equal(Number((await db.one('SELECT count(*) n FROM ledger_entries')).n),2);assert.equal(String((await db.one('SELECT sum(balance_paise) n FROM ledger_accounts')).n),'0')
   assert.equal(Number((await db.one("SELECT count(*) n FROM financial_effects WHERE effect_key LIKE 'gateway:%'")).n),1)
  })
  await t.test('unknown create outcome recovers the same provider order without charging or creating again',async()=>{
   timeoutAfterCreate=true;const beforeCalls=creates;await assert.rejects(demo.createDemoPayment('owner','ambiguous-sandbox-demo-fixture'),e=>e.code==='PAYMENT_UNKNOWN')
   assert.equal((await db.one("SELECT state FROM demo_payment_orders WHERE idempotency_key='ambiguous-sandbox-demo-fixture'")).state,'UNKNOWN')
   const recovered=await demo.createDemoPayment('owner','ambiguous-sandbox-demo-fixture');assert.ok(recovered.paymentSessionId);assert.equal(creates,beforeCalls+1)
   authFail=true;await assert.rejects(demo.verifyDemoPayment('owner',recovered.externalOrderId),e=>e.code==='PAYMENT_PROVIDER'&&e.status===401);authFail=false
   await demo.verifyDemoPayment('owner',recovered.externalOrderId);assert.equal(Number((await db.one('SELECT count(*) n FROM ledger_entries')).n),2)
  })
  await t.test('legacy requests are retained and cannot be verified as Cashfree',async()=>{
   await db.query("INSERT INTO demo_payment_orders(id,user_id,idempotency_key,amount_paise,external_id,state) VALUES('legacy','owner','legacy-demo-request-fixture',10000,'old_order','CAPTURED')")
   await assert.rejects(demo.createDemoPayment('owner','legacy-demo-request-fixture'),e=>e.code==='LEGACY_PAYMENT');await assert.rejects(demo.verifyDemoPayment('owner','old_order'),e=>e.code==='NOT_FOUND');assert.equal((await db.one("SELECT gateway FROM demo_payment_orders WHERE id='legacy'")).gateway,'razorpay')
  })
  await t.test('Cashfree refund is amount-checked, pending until provider success and idempotent',async()=>{
   refundId=await billing.requestRefund('owner',payment.paymentId,'35017','Requested complete test refund')
   await assert.rejects(billing.requestRefund('owner',payment.paymentId,'1','Cannot exceed refundable balance'),e=>e.code==='AMOUNT')
   await db.query("INSERT INTO admins(id,username,password_hash,salt,totp_secret) VALUES('admin','fixture-admin','fixture','fixture','fixture')")
   await billing.processRefund('admin',refundId);assert.equal((await db.one('SELECT state FROM refunds WHERE id=$1',[refundId])).state,'APPROVED');assert.equal(Number((await db.one('SELECT count(*) n FROM ledger_entries')).n),2)
   const refund=refunds.get(refundId);assert.equal(refund.refund_amount,350.17);refundState='SUCCESS'
   refund.refund_amount=1;await assert.rejects(hooks.acceptCashfreeWebhook(...sign({type:'REFUND_STATUS_WEBHOOK',data:{refund:{refund_id:refundId}}})),e=>e.code==='AMOUNT');refund.refund_amount=350.17
   const proof=sign({type:'REFUND_STATUS_WEBHOOK',data:{refund:{refund_id:refundId}}});await hooks.acceptCashfreeWebhook(...proof);await hooks.acceptCashfreeWebhook(...proof)
   assert.equal((await db.one('SELECT state FROM clinic.invoices WHERE id=$1',[invoiceId])).state,'REFUNDED');assert.equal(Number((await db.one('SELECT count(*) n FROM ledger_entries')).n),4);assert.equal(String((await db.one('SELECT sum(balance_paise) n FROM ledger_accounts')).n),'0')
  })
  await t.test('refund webhook arriving before the create response cannot downgrade a processed refund',async()=>{
   const another=await load('lib/domain/labs.ts').requestLabOrder('owner','package',null,'second-cashfree-lab-fixture',true),inv=(await db.one('SELECT id FROM clinic.invoices WHERE lab_order_id=$1',[another])).id
   const order=await billing.createPaymentOrder('owner',inv,'second-cashfree-payment-fixture');await billing.verifyCheckout('owner',order.externalOrderId)
   const refund=await billing.requestRefund('owner',order.paymentId,'100','Partial refund race fixture');webhookDuringRefund=true;refundState='PENDING';await billing.processRefund('admin',refund);webhookDuringRefund=false
   assert.equal((await db.one('SELECT state FROM refunds WHERE id=$1',[refund])).state,'PROCESSED');assert.equal((await db.one('SELECT state FROM clinic.invoices WHERE id=$1',[inv])).state,'PAID');assert.equal(Number((await db.one('SELECT count(*) n FROM ledger_entries')).n),8);assert.equal(String((await db.one('SELECT sum(balance_paise) n FROM ledger_accounts')).n),'0')
  })
 }finally{globalThis.fetch=originalFetch;await db.close();for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before)}
})
