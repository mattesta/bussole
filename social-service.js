import {auth,db,ready,loadData,ref,get,update,onValue,usernameOwner} from './account-service.js?v=9';
import {today} from './daily-service.js?v=7';
const model=window.BussoleSocialModel;
const verified=()=>Boolean(auth.currentUser?.emailVerified&&auth.currentUser?.email);
function me(){if(!verified())throw Error('Sign in and verify your email first.');return auth.currentUser.uid;}
export async function syncOwn(){
 await ready();if(!verified()||!model)return null;
 const uid=me(),[data,day]=await Promise.all([loadData(),today()]);if(me()!==uid)throw Error('Your account changed. Please retry.');
 if(!data.profile.socialEnabled&&!data.profile.leaderboardOptIn)return {uid,day,inactive:true};
 const share=model.snapshot(data,day),name=data.profile.username||'Explorer';
 await update(ref(db),{[`publicProfiles/${uid}`]:{name},[`friendShares/${uid}`]:share,[`journeyLeaderboard/${uid}`]:data.profile.leaderboardOptIn?{...share.journey,name,generation:share.generation}:null});
 return {uid,name,day};
}
export async function connections(){const uid=me();return (await get(ref(db,`connections/${uid}`))).val()||{};}
export async function publicProfile(uid){return (await get(ref(db,`publicProfiles/${uid}`))).val();}
function pair(uid,other,value){return {[`connections/${uid}/${other}`]:value,[`connections/${other}/${uid}`]:value};}
export async function enableProfile(){const uid=me();await update(ref(db,`accountData/${uid}/profile`),{socialEnabled:true});return syncOwn();}
export async function request(other){
 const uid=me();if(!/^[a-zA-Z0-9_-]{1,128}$/.test(other)||uid===other)throw Error('Use another player’s friend link.');
 await enableProfile();if(!(await publicProfile(other)))throw Error('This player’s profile is unavailable. Ask them to copy their friend link from My account first.');
 await update(ref(db),pair(uid,other,{state:'pending',requestedBy:uid}));
}
export async function accept(other){
 const uid=me(),entry=(await connections())[other];if(!entry||entry.state!=='pending'||entry.requestedBy===uid)throw Error('This request is no longer waiting for your acceptance.');
 await enableProfile();await update(ref(db),pair(uid,other,{state:'accepted',requestedBy:entry.requestedBy}));
}
export async function remove(other){const uid=me();await update(ref(db),pair(uid,other,null));}
export async function friend(uid){return {profile:await publicProfile(uid),share:(await get(ref(db,`friendShares/${uid}`))).val()};}
export async function leaderboard(scope){
 const uid=me(),day=await today();
 if(scope==='global')return {rows:model.ranked((await get(ref(db,'journeyLeaderboard'))).val(),day),day};
 const links=await connections(),ids=[uid,...Object.entries(links).filter(([,r])=>r.state==='accepted').map(([id])=>id)],entries={};
 await Promise.all(ids.map(async id=>{try{const value=await friend(id);if(value.share?.journey)entries[id]={...value.share.journey,name:value.profile?.name||'Explorer'};}catch{ /* Removed friendships revoke access immediately. */ }}));
 return {rows:model.ranked(entries,day),day};
}
export async function resolveFriend(value){
 const text=String(value||'').trim();
 if(/[?&]friend=/.test(text))return parseInvite(text);
 if(!/^[a-zA-Z0-9_]{3,20}$/.test(text))throw Error('Enter a username or paste a friend link.');
 const uid=await usernameOwner(text);if(!uid)throw Error('Username not found. Ask your friend to save their username in My account first.');return uid;
}
export function parseInvite(value){try{const url=new URL(value,location.href);return url.searchParams.get('friend')||String(value).trim();}catch{return String(value).trim();}}
export function watchConnections(callback,error){return onValue(ref(db,`connections/${me()}`),s=>callback(s.val()||{}),error);}
