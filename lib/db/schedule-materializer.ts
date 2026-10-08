import type {Db} from './adapters'
/** Rules are explicitly published by the clinic. Date anchoring uses the IST day. */
export async function materializeSlots(d:Db,doctorId:string,days=7,now=new Date()):Promise<void> {
  const ist=new Date(now.getTime()+330*60000)
  const rules=await d.query<{weekday:number;start_minute:number;end_minute:number;duration_minutes:number}>('SELECT weekday,start_minute,end_minute,duration_minutes FROM provider.schedule_rules WHERE doctor_id=$1 AND enabled=true',[doctorId])
  const exceptions=await d.query<{day:string;closed:boolean}>('SELECT day,closed FROM provider.schedule_exceptions WHERE doctor_id=$1',[doctorId])
  const closed=new Set(exceptions.filter(e=>e.closed).map(e=>String(e.day).slice(0,10)))
  const values:unknown[]=[],rows:string[]=[]
  for(let day=0;day<Math.min(14,Math.max(1,days));day++) {
    const localDate=new Date(Date.UTC(ist.getUTCFullYear(),ist.getUTCMonth(),ist.getUTCDate()+day)),key=localDate.toISOString().slice(0,10)
    if(closed.has(key))continue
    for(const rule of rules.filter(r=>r.weekday===localDate.getUTCDay())) {
      for(let minute=rule.start_minute;minute+rule.duration_minutes<=rule.end_minute;minute+=rule.duration_minutes) {
        const start=new Date(localDate.getTime()+(minute-330)*60000)
        if(start<=now)continue
        const end=new Date(start.getTime()+rule.duration_minutes*60000),base=values.length
        rows.push(`($${base+1},$${base+2},$${base+3},$${base+4})`)
        values.push(`slot_${doctorId}_${start.getTime()}`,doctorId,start.toISOString(),end.toISOString())
      }
    }
  }
  if(rows.length) await d.query(`INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES ${rows.join(',')}
    ON CONFLICT(doctor_id,slot_start) DO UPDATE SET status=CASE WHEN provider.appointment_slots.status='BLOCKED' THEN 'AVAILABLE' ELSE provider.appointment_slots.status END`,values)
}
