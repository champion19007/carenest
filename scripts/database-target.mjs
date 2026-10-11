import {createHash} from 'node:crypto'

export function databaseTarget(args,env){
 if(!args.includes('--postgres'))return {local:true,url:undefined}
 let url;try{url=new URL(env.DATABASE_URL)}catch{throw new Error('Explicit PostgreSQL operation requires a valid DATABASE_URL')}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||url.pathname==='/')throw new Error('Invalid PostgreSQL destination')
 if(!env.CARENEST_EXPECTED_DB_HOST||url.hostname!==env.CARENEST_EXPECTED_DB_HOST)throw new Error('Verify the dedicated CareNest database and set CARENEST_EXPECTED_DB_HOST before writing')
 return {local:false,url:env.DATABASE_URL}
}

/** Read-only inspection must precede the first DDL against any remote database. */
export async function inspectCareNestDatabase(db,migrations,{seed=false}={}){
 const inventory=await db.query("SELECT schemaname,tablename FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_%' ORDER BY schemaname,tablename")
 // Neon may provision its optional authentication schema before app installation.
 // Preserve those provider-owned tables; they cannot establish CareNest identity.
 const tables=inventory.filter(table=>table.schemaname!=='neon_auth')
 if(!tables.length){if(seed)throw new Error('Apply CareNest migrations before remote seeding');return {empty:true,tables:[]}}
 if(!tables.some(t=>t.schemaname==='public'&&t.tablename==='schema_migrations'))throw new Error('Destination contains existing application tables; refusing CareNest writes')
 const applied=await db.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')
 if(!applied.length)throw new Error('Cannot identify this populated database as CareNest')
 for(const row of applied){const migration=migrations.find(m=>m.version===row.version);if(!migration||createHash('sha256').update(migration.sql).digest('hex')!==row.checksum)throw new Error('Destination is not a recognised CareNest migration history')}
 if(seed&&!applied.some(row=>row.version===migrations.at(-1).version))throw new Error('CareNest migrations are pending; refusing seed')
 return {empty:false,tables:tables.map(t=>t.schemaname+'.'+t.tablename)}
}
