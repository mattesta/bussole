// Free scheduled cleanup uses a password identity with deletion-only room access.
const DB='https://bussole-game-default-rtdb.europe-west1.firebasedatabase.app';
const KEY='AIzaSyDF8QBnk0qhEQoNMLfomt9WivloW--66cQ';
async function run({request=fetch,secret=process.env.BUSSOLE_ROOM_CLEANUP_SECRET,now=Date.now()}={}) {
  if(!secret){console.log('Room cleanup is not configured.');return {removed:0};}
  const credentials=JSON.parse(secret);
  const login=await request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:credentials.email,password:credentials.password,returnSecureToken:true}),signal:AbortSignal.timeout(20000)
  });
  if(!login.ok)throw Error('Cleanup sign-in failed.');
  const auth=await login.json();if(!auth.idToken)throw Error('Missing cleanup token.');
  const api=(path,options={})=>request(`${DB}/${path}.json?auth=${encodeURIComponent(auth.idToken)}`,{...options,signal:AbortSignal.timeout(20000)});
  const listing=await request(`${DB}/roomExpirations.json?auth=${encodeURIComponent(auth.idToken)}&orderBy=%22expiresAt%22&endAt=${now}&limitToFirst=100`,{signal:AbortSignal.timeout(20000)});
  if(!listing.ok)throw Error('Cleanup index is unavailable.');
  const expired=await listing.json()||{};let removed=0;
  for(const [code,record] of Object.entries(expired)) {
    if(!/^[A-Z]{6}$/.test(code)||!Number.isFinite(record.expiresAt)||record.expiresAt>now)continue;
    // Rules recheck expiry on the server. A stale index cannot delete a new room.
    const result=await api(`rooms/${code}`,{method:'DELETE'});
    if(!result.ok)throw Error('Expired room deletion was rejected.');
    const index=await api(`roomExpirations/${code}`,{method:'DELETE'});
    const directory=await api(`publicRooms/${code}`,{method:'DELETE'});
    if(!index.ok||!directory.ok)throw Error('Expired room index cleanup failed.');
    removed++;
  }
  console.log(`Expired rooms removed: ${removed}.`);
  return {removed};
}
if(require.main===module)run().catch(()=>{console.error('Room cleanup failed. Check setup and rules. No credentials or player data were logged.');process.exitCode=1;});
module.exports={run};
