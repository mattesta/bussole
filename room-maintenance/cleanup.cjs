// Free scheduled cleanup uses a password identity with deletion-only room access.
const DB='https://bussole-game-default-rtdb.europe-west1.firebasedatabase.app';
const KEY='AIzaSyDF8QBnk0qhEQoNMLfomt9WivloW--66cQ';
const DIAGNOSTICS={
  SECRET_JSON_INVALID:'The GitHub secret must be a JSON object with double-quoted email and password fields.',
  SECRET_FIELDS_INVALID:'The GitHub secret needs non-empty email and password strings.',
  AUTH_CREDENTIALS_INVALID:'Firebase rejected the service email/password. Check the dedicated user and the GitHub secret.',
  AUTH_USER_DISABLED:'The Firebase service user is disabled.',
  AUTH_PROVIDER_DISABLED:'Enable the existing email/password sign-in provider in Firebase Authentication.',
  AUTH_LOGIN_FAILED:'Firebase sign-in failed. Check Authentication settings and the service user.',
  AUTH_TOKEN_MISSING:'Firebase did not return a usable sign-in token.',
  EXPIRATION_INDEX_DENIED:'Firebase denied index access. Check the published rules and roomMaintenanceConfig/uid against the service user UID.',
  EXPIRATION_INDEX_UNAVAILABLE:'The expiration-index query failed. Check the database rules and expiresAt index.',
  ROOM_DELETE_DENIED:'Firebase rejected room deletion. Check rules and stale expiration entries; live rooms remain protected.',
  INDEX_DELETE_FAILED:'Room deletion completed but index/listing cleanup failed. Check the published rules.',
  NETWORK_OR_UNEXPECTED_ERROR:'The request failed unexpectedly. Check service availability; no raw error or credentials were logged.'
};
function fail(code){return Object.assign(new Error(code),{cleanupCode:code});}
function parseSecret(secret){
  let value;try{value=JSON.parse(secret);}catch{throw fail('SECRET_JSON_INVALID');}
  if(!value||Array.isArray(value)||typeof value.email!=='string'||!value.email.trim()||typeof value.password!=='string'||!value.password)throw fail('SECRET_FIELDS_INVALID');
  return {email:value.email.trim(),password:value.password};
}
function failureMessage(error){
  const code=Object.hasOwn(DIAGNOSTICS,error?.cleanupCode)?error.cleanupCode:'NETWORK_OR_UNEXPECTED_ERROR';
  return `Room cleanup failed [${code}]. ${DIAGNOSTICS[code]} No credentials or player data were logged.`;
}
async function run({request=fetch,secret=process.env.BUSSOLE_ROOM_CLEANUP_SECRET,now=Date.now()}={}) {
  if(!secret){console.log('Room cleanup is not configured.');return {removed:0};}
  const credentials=parseSecret(secret);
  const login=await request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:credentials.email,password:credentials.password,returnSecureToken:true}),signal:AbortSignal.timeout(20000)
  });
  if(!login.ok){
    const body=await login.json().catch(()=>null),reason=body?.error?.message;
    if(['INVALID_LOGIN_CREDENTIALS','EMAIL_NOT_FOUND','INVALID_PASSWORD','INVALID_EMAIL','MISSING_PASSWORD'].includes(reason))throw fail('AUTH_CREDENTIALS_INVALID');
    if(reason==='USER_DISABLED')throw fail('AUTH_USER_DISABLED');
    if(reason==='OPERATION_NOT_ALLOWED'||reason==='PASSWORD_LOGIN_DISABLED')throw fail('AUTH_PROVIDER_DISABLED');
    throw fail('AUTH_LOGIN_FAILED');
  }
  const auth=await login.json();if(!auth.idToken)throw fail('AUTH_TOKEN_MISSING');
  const api=(path,options={})=>request(`${DB}/${path}.json?auth=${encodeURIComponent(auth.idToken)}`,{...options,signal:AbortSignal.timeout(20000)});
  const listing=await request(`${DB}/roomExpirations.json?auth=${encodeURIComponent(auth.idToken)}&orderBy=%22expiresAt%22&endAt=${now}&limitToFirst=100`,{signal:AbortSignal.timeout(20000)});
  if(!listing.ok)throw fail([401,403].includes(listing.status)?'EXPIRATION_INDEX_DENIED':'EXPIRATION_INDEX_UNAVAILABLE');
  const expired=await listing.json()||{};let removed=0;
  for(const [code,record] of Object.entries(expired)) {
    if(!/^[A-Z]{6}$/.test(code)||!Number.isFinite(record.expiresAt)||record.expiresAt>now)continue;
    // Rules recheck expiry on the server. A stale index cannot delete a new room.
    const result=await api(`rooms/${code}`,{method:'DELETE'});
    if(!result.ok)throw fail('ROOM_DELETE_DENIED');
    const index=await api(`roomExpirations/${code}`,{method:'DELETE'});
    const directory=await api(`publicRooms/${code}`,{method:'DELETE'});
    if(!index.ok||!directory.ok)throw fail('INDEX_DELETE_FAILED');
    removed++;
  }
  console.log(`Expired rooms removed: ${removed}.`);
  return {removed};
}
if(require.main===module)run().catch(error=>{console.error(failureMessage(error));process.exitCode=1;});
module.exports={run,parseSecret,failureMessage};
