export type CalendarView='day'|'week'|'month'|'agenda'
export type WorkspaceAppointment={id:string;source:'online'|'clinic'|'walk-in'|'reminder'|'block';title:string;startsAt:string;endsAt:string;state:string;startedAt?:string|null;checkedInAt?:string|null;encounterId?:string|null;personId?:string;revision:number;walkInId?:string|null;walkInRevision?:number;feePaise?:string;invoiceId?:string;details?:string}
export const istDate=(value:Date|string=new Date())=>new Date(new Date(value).getTime()+330*60000).toISOString().slice(0,10)
export const dayOffset=(day:string,n:number)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)
export const dayStart=(day:string)=>new Date(Date.parse(day+'T00:00:00Z')-330*60000).toISOString()
export const istMinutes=(value:string)=>{const time=new Date(Date.parse(value)+330*60000);return time.getUTCHours()*60+time.getUTCMinutes()}
export function calendarWindow(rawDay:string|undefined,rawView:string|undefined,now=new Date()){
 const day=rawDay&&/^\d{4}-\d{2}-\d{2}$/.test(rawDay)&&Number(rawDay.slice(0,4))>=1900&&Number(rawDay.slice(0,4))<=2200&&!Number.isNaN(Date.parse(rawDay))&&new Date(rawDay).toISOString().slice(0,10)===rawDay?rawDay:istDate(now)
 const view:CalendarView=['day','week','month','agenda'].includes(rawView??'')?rawView as CalendarView:'week'
 const weekday=(new Date(day+'T00:00:00Z').getUTCDay()+6)%7
 const firstMonth=day.slice(0,7)+'-01',monthWeekday=(new Date(firstMonth+'T00:00:00Z').getUTCDay()+6)%7
 const first=view==='month'?dayOffset(firstMonth,-monthWeekday):view==='week'?dayOffset(day,-weekday):day
 const days=view==='month'?42:view==='week'?7:view==='agenda'?14:1,last=dayOffset(first,days)
 return {day,view,first,last,start:dayStart(first),end:dayStart(last),days:Array.from({length:days},(_,i)=>dayOffset(first,i))}
}
export function queueState(item:Pick<WorkspaceAppointment,'state'|'startedAt'|'checkedInAt'>){if(['attended','ATTENDED'].includes(item.state))return 'seen';if(['no_show','NO_SHOW','cancelled','CANCELLED','declined','expired'].includes(item.state))return 'closed';if(item.startedAt||item.state==='IN_PROGRESS')return 'consulting';if(item.checkedInAt||item.state==='WAITING'||item.state==='ARRIVED')return 'waiting';return 'due'}

export function shiftCalendarDay(day:string,view:string,direction:1|-1){if(view!=='month')return dayOffset(day,direction*(view==='week'?7:view==='agenda'?14:1));const date=new Date(day+'T00:00:00Z'),target=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+direction,1)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(date.getUTCDate(),last));return target.toISOString().slice(0,10)}
