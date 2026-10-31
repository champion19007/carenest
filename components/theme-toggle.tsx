'use client'
import {useEffect,useState} from 'react'
type Theme='light'|'dark'|'system'
export function ThemeToggle({compact=false,onBanner=false}:{compact?:boolean;onBanner?:boolean}){
 const [theme,setTheme]=useState<Theme>('system')
 const [ready,setReady]=useState(false)
 useEffect(()=>{let saved:Theme='system';try{const value=localStorage.getItem('carenest-theme');if(value==='light'||value==='dark')saved=value}catch{}setTheme(saved);setReady(true)},[])
 useEffect(()=>{
  if(!ready)return
  const media=window.matchMedia('(prefers-color-scheme: dark)')
  function sync(){document.documentElement.classList.toggle('dark',theme==='dark'||(theme==='system'&&media.matches))}
  sync();media.addEventListener('change',sync)
  return()=>media.removeEventListener('change',sync)
 },[theme,ready])
 function change(next:Theme){setTheme(next);try{localStorage.setItem('carenest-theme',next)}catch{}}
 return <label className={`inline-flex min-h-11 items-center ${onBanner?'text-banner-foreground':'text-foreground'}`}><span className="sr-only">Colour theme</span><select aria-label="Colour theme" value={theme} onChange={e=>change(e.target.value as Theme)} className={`min-h-11 max-w-28 rounded-lg border px-2 text-sm ${onBanner?'border-banner-foreground bg-banner':'border-input bg-card'}`}><option value="system">{compact?'System':'System theme'}</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
}
