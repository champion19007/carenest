'use client'
import {useEffect,useRef} from 'react'
export function CampaignExposure({id}:{id:string}){const ref=useRef<HTMLSpanElement>(null);useEffect(()=>{if(!ref.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();void fetch('/api/public/campaign/'+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{})}},{threshold:.5});observer.observe(ref.current);return()=>observer.disconnect()},[id]);return <span ref={ref} className="block h-px" aria-hidden="true"/>}
