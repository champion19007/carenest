// Retired endpoint never processes payment data after the provider switch.
export async function POST(){return Response.json({error:'Razorpay integration retired. Configure the Cashfree sandbox webhook.'},{status:410,headers:{'Cache-Control':'no-store'}})}
