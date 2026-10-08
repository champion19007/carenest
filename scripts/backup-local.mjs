import fs from 'node:fs/promises'
import path from 'node:path'
import {assertLocalStopped,claimLocalMaintenance} from './local-lock.mjs'
async function main(){
await assertLocalStopped()
const release=await claimLocalMaintenance()
try{
const root=path.resolve('.data'),backups=path.join(root,'backups')
function contained(parent,target){const relative=path.relative(parent,target);if(relative.startsWith('..')||path.isAbsolute(relative)||!relative)throw new Error('Backup path must stay inside the designated directory');return target}
const restore=process.argv.find(arg=>arg.startsWith('--restore='))?.slice(10)
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),snapshot=contained(backups,path.join(backups,(restore?'pre-restore-':'snapshot-')+stamp))
await fs.mkdir(snapshot,{recursive:true})
for(const item of ['pg','files','secrets']){const source=contained(root,path.join(root,item));try{await fs.cp(source,contained(snapshot,path.join(snapshot,item)),{recursive:true,errorOnExist:true,force:false})}catch(error){if(error.code!=='ENOENT')throw error}}
await fs.writeFile(path.join(snapshot,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),format:1,includes:['pg','files','secrets'],encrypted:true},null,2))
if(restore){
 if(!/^[a-zA-Z0-9_.-]+$/.test(restore))throw new Error('Choose a backup directory name, not a path')
 const source=contained(backups,path.join(backups,restore)),manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'))
 if(manifest.format!==1)throw new Error('Unsupported backup format')
 for(const item of ['pg','secrets'])await fs.access(contained(source,path.join(source,item)))
 // Move checked targets aside, never delete the existing database or its encryption keys.
 for(const item of ['pg','files','secrets']){
  const target=contained(root,path.join(root,item)),saved=contained(snapshot,path.join(snapshot,'displaced-'+item))
  try{await fs.rename(target,saved)}catch(error){if(error.code!=='ENOENT')throw error}
  try{await fs.cp(contained(source,path.join(source,item)),target,{recursive:true,errorOnExist:true,force:false})}catch(error){if(error.code!=='ENOENT')throw error}
 }
 console.log('Local snapshot restored. Prior data and keys retained in '+snapshot)
}else console.log('Private local backup saved in '+snapshot+'. Keep the database and encryption keys together.')

}finally{await release()}
}
main().catch(()=>{console.error("Local backup/restore failed; existing data and keys were retained. Inspect the snapshot before retrying.");process.exitCode=1})
