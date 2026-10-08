import {readFile,unlink,writeFile,mkdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import path from 'node:path'
export const localMarker=path.resolve('.data/local-process.json')
export async function assertLocalStopped(){
 let marker
 try{marker=JSON.parse(await readFile(localMarker,'utf8'))}catch(error){if(error.code==='ENOENT')return;throw new Error('Cannot read the local process marker safely')}
 if(String(marker.pid)===process.env.CARENEST_LOCAL_OWNER)return
 if(!Number.isInteger(marker.pid)||marker.pid<=0)throw new Error('Invalid local process marker; inspect it before opening the database')
 try{process.kill(marker.pid,0)}catch(error){if(error.code==='ESRCH'){await unlink(localMarker);return}throw new Error('Cannot verify whether the app is stopped')}
 throw new Error('Stop the local app before opening its embedded database')
}
export async function claimLocalMaintenance(){
 await assertLocalStopped()
 try{const owner=JSON.parse(await readFile(localMarker,'utf8'));if(String(owner.pid)===process.env.CARENEST_LOCAL_OWNER)return async()=>{}}catch(error){if(error.code!=='ENOENT')throw error}
 await mkdir(path.dirname(localMarker),{recursive:true});const nonce=randomUUID()
 await writeFile(localMarker,JSON.stringify({pid:process.pid,mode:'maintenance',nonce}),{flag:'wx',mode:0o600})
 return async()=>{const current=JSON.parse(await readFile(localMarker,'utf8'));if(current.pid!==process.pid||current.nonce!==nonce)throw new Error('Local maintenance ownership changed');await unlink(localMarker)}
}
