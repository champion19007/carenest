export function paise(value:string|number|bigint){const text=String(value);if(!/^\d{1,18}$/.test(text))throw new Error('Invalid integer paise amount');return BigInt(text)}
export function rupeesToPaise(value:string){if(!/^\d{1,12}(\.\d{1,2})?$/.test(value))throw new Error('Enter a rupee amount with at most two decimal places');const[whole,fraction='']=value.split('.');return (BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))).toString()}
export function decimalRupees(value:string|number|bigint){const amount=paise(value);return `${amount/100n}.${String(amount%100n).padStart(2,'0')}`}
export function formatPaise(value:string|number|bigint){const amount=paise(value);return `₹${(amount/100n).toLocaleString('en-IN')}.${String(amount%100n).padStart(2,'0')}`}
