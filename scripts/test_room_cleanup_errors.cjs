const assert=require('node:assert/strict');
const {run,parseSecret,failureMessage}=require('../room-maintenance/cleanup.cjs');
(async()=>{
 const sensitive='test-private-password-that-must-never-be-logged';
 for(const raw of [sensitive,'```json\n{}\n```','{"password":"'+sensitive+'}'])assert.throws(()=>parseSecret(raw),{cleanupCode:'SECRET_JSON_INVALID'});
 for(const raw of ['null','[]','{}','{"email":"x","password":12}'])assert.throws(()=>parseSecret(raw),{cleanupCode:'SECRET_FIELDS_INVALID'});
 assert.deepEqual(parseSecret(JSON.stringify({email:' bot@example.test ',password:sensitive})),{email:'bot@example.test',password:sensitive});
 let calls=0;await assert.rejects(run({secret:sensitive,request:()=>{calls++;throw Error(sensitive)}}),{cleanupCode:'SECRET_JSON_INVALID'});assert.equal(calls,0);
 const secret=JSON.stringify({email:'bot@example.test',password:sensitive});
 for(const [reason,code] of [['INVALID_LOGIN_CREDENTIALS','AUTH_CREDENTIALS_INVALID'],['USER_DISABLED','AUTH_USER_DISABLED'],['OPERATION_NOT_ALLOWED','AUTH_PROVIDER_DISABLED'],[sensitive,'AUTH_LOGIN_FAILED']]){
  await assert.rejects(run({secret,request:async()=>({ok:false,json:async()=>({error:{message:reason}})})}),error=>{assert.equal(error.cleanupCode,code);assert.ok(!failureMessage(error).includes(sensitive));return true});
 }
 let stage=0;
 await assert.rejects(run({secret,request:async()=>++stage===1?{ok:true,json:async()=>({idToken:sensitive})}:{ok:false,status:401}}),{cleanupCode:'EXPIRATION_INDEX_DENIED'});
 for(const error of [Error(sensitive),Object.assign(Error(sensitive),{cleanupCode:sensitive}),new SyntaxError(sensitive)])assert.ok(!failureMessage(error).includes(sensitive));
 console.log('Cleanup diagnostics: invalid configuration fails before network calls, stage-specific errors and unknown-error redaction passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
