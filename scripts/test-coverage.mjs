import {spawn} from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
const directory=path.resolve('.data/coverage');fs.mkdirSync(directory,{recursive:true})
const args=['--import','tsx','--test','--test-concurrency=2','--experimental-test-coverage','--test-coverage-lines=70','--test-coverage-branches=70','--test-coverage-functions=70','--test-coverage-include=lib/**/*.ts','--test-coverage-include=app/actions/*.ts','--test-coverage-include=app/api/**/*.ts','--test-coverage-exclude=lib/db/*schema.ts','--test-coverage-exclude=lib/data.ts','tests/*.test.mjs']
const child=spawn(process.execPath,args,{stdio:'inherit',env:{...process.env,NODE_V8_COVERAGE:directory}});child.once('exit',code=>process.exitCode=code??1);child.once('error',()=>process.exitCode=1)
