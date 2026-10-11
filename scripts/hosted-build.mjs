import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
// Route enumeration must not depend on a sleeping database being reachable.
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'build',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,CARENEST_BUILD_PHASE:'1'}})
child.once('error',()=>{console.error('Hosted build could not start');process.exitCode=1})
child.once('exit',code=>process.exitCode=code??1)
