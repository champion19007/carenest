let capture:((error:unknown)=>void)|undefined
export function setClientErrorReporter(reporter:(error:unknown)=>void){capture=reporter}
export function reportClientError(error:unknown){try{capture?.(error)}catch{}}
