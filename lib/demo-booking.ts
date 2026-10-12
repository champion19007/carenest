import 'server-only'
import {cashfreeConfigured} from './cashfree'

export function hostedDemoBookingEnabled(){
 return process.env.CARENEST_DEMO_BOOKING==='1'&&cashfreeConfigured()
}
