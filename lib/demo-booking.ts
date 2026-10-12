import 'server-only'
import {cashfreeConfigured} from './cashfree'

export function hostedDemoBookingEnabled(){
 return process.env.CARENEST_DEMO_BOOKING==='1'&&cashfreeConfigured()
}
export function hostedDemoVideoHostId(){
 const id=process.env.CARENEST_DEMO_VIDEO_HOST_ID
 return hostedDemoBookingEnabled()&&process.env.CARENEST_DEMO_VIDEO==='1'&&id&&/^[A-Za-z0-9_-]{1,128}$/.test(id)?id:null
}
