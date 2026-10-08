export async function GET(){return Response.json({error:'Zoom embedding has been retired. Open your consultation to use LiveKit.'},{status:410,headers:{'Cache-Control':'private, no-store'}})}
export async function POST(){return GET()}
