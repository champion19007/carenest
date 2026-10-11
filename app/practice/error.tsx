'use client'
import Link from 'next/link'
import {useEffect} from 'react'
import {reportClientError} from '@/lib/client-reporting'
export default function PracticeError({error,reset}:{error:Error;reset:()=>void}){useEffect(()=>reportClientError(error),[error]);return <div className="workspace-empty" role="alert"><h1>Your practice could not be opened</h1><p>Check that your professional verification and clinic access are active. If they are, retry or contact support.</p><div className="flex flex-wrap gap-3"><button className="care-button" onClick={reset}>Try again</button><Link className="care-button-secondary" href="/join">Verification status</Link><Link className="care-button-secondary" href="/help">Get help</Link></div></div>}
