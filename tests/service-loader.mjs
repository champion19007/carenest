import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
const requireNative = createRequire(import.meta.url)

/** Executes real application services; only framework/database boundaries are injected. */
export function loadServices(db, overrides = {}) {
  const cache = new Map()
  function load(file) {
    const filename = path.resolve(file)
    if (cache.has(filename)) return cache.get(filename).exports
    const mod = { exports: {} }
    cache.set(filename, mod)
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    function localRequire(name) {
      if (Object.hasOwn(overrides, name)) return overrides[name]
      if (name === 'server-only') return {}
      if (name === '@/lib/db/client' || (name.endsWith('/client') && filename.includes(`${path.sep}lib${path.sep}db${path.sep}`))) {
        return { getDb: () => db, ensureSchema: async () => {} }
      }
      if (name.startsWith('@/') || name.startsWith('.')) {
        const target = name.startsWith('@/') ? path.join(process.cwd(), name.slice(2)) : path.resolve(path.dirname(filename), name)
        if(path.resolve(target).replaceAll('\\','/')===path.resolve('lib/db/client').replaceAll('\\','/'))return {getDb:()=>db,ensureSchema:async()=>{}}
        if (fs.existsSync(target + '.ts')) return load(target + '.ts')
        if (fs.existsSync(target + '.tsx')) return load(target + '.tsx')
      }
      return requireNative(name)
    }
    const fn = vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${source}\n})`, { filename })
    fn(localRequire, mod, mod.exports, filename, path.dirname(filename))
    return mod.exports
  }
  return file => load(path.resolve(process.cwd(), file))
}
