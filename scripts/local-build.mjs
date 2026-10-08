import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {assertLocalStopped} from './local-lock.mjs'
const require=createRequire(import.meta.url)
await assertLocalStopped()
// A saved DATABASE_URL must never make the local build contact a remote database.
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'build',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,NODE_ENV:'production',CARENEST_LOCAL_MODE:'1'}})
child.once('error',()=>{console.error('Local build could not start');process.exitCode=1})
child.once('exit',code=>{process.exitCode=code??1})
