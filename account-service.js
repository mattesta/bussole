import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendEmailVerification, sendPasswordResetEmail, reload, EmailAuthProvider,
  reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail, deleteUser,
  GoogleAuthProvider, signInWithPopup, linkWithPopup, reauthenticateWithPopup, linkWithCredential
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getDatabase, ref, get, set, update, runTransaction, onValue, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const app=initializeApp(firebaseConfig);
export const auth=getAuth(app);
export const db=getDatabase(app);
export { ref, get, update, runTransaction, set, onValue, serverTimestamp };
export const defaultProfile={username:'',useInRooms:false,communityConsent:false,consentVersion:1,leaderboardOptIn:false,socialEnabled:false};
const account=user=>Boolean(user&&!user.isAnonymous&&user.email);
const verified=user=>account(user)&&user.emailVerified;
const current=()=>{if(!account(auth.currentUser))throw new Error('Sign in to your account first.');return auth.currentUser;};
const path=uid=>`accountData/${uid}`;
export async function ready(){await auth.authStateReady();return account(auth.currentUser)?auth.currentUser:null;}
export async function register(email,password){
  const result=await createUserWithEmailAndPassword(auth,email.trim(),password);
  // Never link or import the anonymous guest identity or its games.
  let verificationSent=true;
  try{await sendEmailVerification(result.user);}catch{verificationSent=false;}
  return {user:result.user,verificationSent};
}
export const login=(email,password)=>signInWithEmailAndPassword(auth,email.trim(),password);
export const hasGoogle=()=>Boolean(auth.currentUser?.providerData.some(p=>p.providerId==='google.com'));
export const hasPassword=()=>Boolean(auth.currentUser?.providerData.some(p=>p.providerId==='password'));
function googleProvider(){const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});return provider;}
export async function google(){
 // Open synchronously from the user's tap, including Safari. Never link guest data.
 try{return account(auth.currentUser)?await linkWithPopup(auth.currentUser,googleProvider()):await signInWithPopup(auth,googleProvider());}
 catch(error){if(error.code==='auth/account-exists-with-different-credential')throw Error('This email already has an account. Sign in with its password, then choose Connect Google to keep your statistics.');throw error;}
}
let syncTask;
export function scheduleSocialSync(){
 if(!syncTask)syncTask=import('./social-service.js?v=1').then(s=>s.syncOwn()).catch(()=>null).finally(()=>{syncTask=null;});
 return syncTask;
}
export const logout=()=>signOut(auth);
export const resetPassword=email=>sendPasswordResetEmail(auth,email.trim());
export const resendVerification=()=>sendEmailVerification(current());
export async function refreshVerification(){const user=current();await reload(user);await user.getIdToken(true);return user.emailVerified;}
async function loadProfile(){
  const user=current(),profileRef=ref(db,`${path(user.uid)}/profile`);
  let profile=(await get(profileRef)).val();
  if(!profile){
    const result=await runTransaction(profileRef,value=>value||{...defaultProfile,generation:crypto.randomUUID()});
    profile=result.snapshot.val();
  }
  return profile;
}
export async function loadData(){
  const user=current();const data=(await get(ref(db,path(user.uid)))).val()||{};
  if(!data.profile)data.profile=await loadProfile();
  return data;
}
export async function saveProfile(profile){
  const user=current();
  const username=String(profile.username||'').trim();
  if(username&&!/^[a-zA-Z0-9_]{3,20}$/.test(username))throw new Error('Use 3–20 letters, numbers or underscores.');
  if(profile.leaderboardOptIn&&!username)throw Error('Choose a username before joining the global leaderboard.');
  if(profile.communityConsent&&!verified(user))throw new Error('Verify your email before contributing.');
  const existingProfile=await loadProfile();
  const fields={username,useInRooms:Boolean(username&&profile.useInRooms),communityConsent:Boolean(profile.communityConsent),consentVersion:1,leaderboardOptIn:Boolean(profile.leaderboardOptIn)};
  const changes=Object.fromEntries(Object.entries(fields).map(([key,value])=>[`${path(user.uid)}/profile/${key}`,value]));
  if(!fields.leaderboardOptIn){changes[`journeyLeaderboard/${user.uid}`]=null;if(!existingProfile.socialEnabled){changes[`publicProfiles/${user.uid}`]=null;changes[`friendShares/${user.uid}`]=null;}}
  await update(ref(db),changes);
  await scheduleSocialSync();
}
export async function roomName(){
  await ready();if(!account(auth.currentUser))return null;
  try{const profile=await loadProfile();return profile?.useInRooms&&/^[a-zA-Z0-9_]{3,20}$/.test(profile.username)?profile.username:null;}
  catch{return null;} // Account setup/network failures must never block guest gameplay.
}
export async function beginRound(){
  await ready();const user=auth.currentUser;
  if(!verified(user))return null;
  try{const profile=await loadProfile();return {uid:user.uid,id:crypto.randomUUID(),generation:profile.generation};}
  catch{return null;}
}
export async function saveSample(context,sample,key){
  if(!context||!sample)return false;
  const user=auth.currentUser;
  if(!verified(user)||user.uid!==context.uid)return false;
  // A stable opaque key makes multiplayer reloads/retries idempotent without storing room details.
  const id=key?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${user.uid}:${key}`))),b=>b.toString(16).padStart(2,'0')).join(''):context.id;
  const clean=window.BussoleAccountStatistics.clean(sample);
  if(!clean)return false;
  await set(ref(db,`${path(user.uid)}/samples/${id}`),{...clean,generation:context.generation});
  scheduleSocialSync();
  return true;
}
export async function saveSoloBest(context,settings,score){
  if(!context||!verified(auth.currentUser)||auth.currentUser.uid!==context.uid)return {saved:false};
  const config=window.BussoleSoloGame.settings(settings);
  if(!Number.isInteger(score)||score<0||score>5000)throw new Error('Invalid game score.');
  const value={...config,score,rounds:5,day:Math.floor(Date.now()/86400000),generation:context.generation};
  const result=await runTransaction(ref(db,`${path(context.uid)}/soloBests/${window.BussoleSoloGame.key(config)}`),previous=>{
    if(previous?.generation===context.generation&&previous.score>=score)return;
    return value;
  });
  scheduleSocialSync();
  return {saved:true,isNew:result.committed,best:result.snapshot.val()?.score??score};
}
function dailyRemovals(attempts={}){
  return Object.fromEntries(Object.entries(attempts||{}).filter(([,attempt])=>attempt.entryKey).map(([day,attempt])=>[`dailyScores/${day}/${attempt.entryKey}`,null]));
}
export async function deleteStatistics(){
  const user=current();
  await loadProfile();
  const data=await loadData(), changes=dailyRemovals(data.dailyAttempts);
  Object.assign(changes,{[`${path(user.uid)}/samples`]:null,[`${path(user.uid)}/soloBests`]:null,[`${path(user.uid)}/dailyAttempts`]:null,[`${path(user.uid)}/profile/communityConsent`]:false,[`${path(user.uid)}/profile/leaderboardOptIn`]:false,[`${path(user.uid)}/profile/consentVersion`]:1,[`${path(user.uid)}/profile/generation`]:crypto.randomUUID(),[`friendShares/${user.uid}`]:null,[`journeyLeaderboard/${user.uid}`]:null});
  if(!data.profile?.socialEnabled)changes[`publicProfiles/${user.uid}`]=null;
  await update(ref(db),changes);
}
async function reauthenticate(password){
  const user=current();if(password)await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,password));else if(hasGoogle())await reauthenticateWithPopup(user,googleProvider());else throw Error('Enter your current password first.');return user;
}
export async function changePassword(password,next){const user=await reauthenticate(password);if(hasPassword())await updatePassword(user,next);else await linkWithCredential(user,EmailAuthProvider.credential(user.email,next));}
export async function changeEmail(password,email){await verifyBeforeUpdateEmail(await reauthenticate(password),email.trim());}
export async function deleteAccount(password){
  const user=await reauthenticate(password);
  // Remove database data while cleanup is still authorized, before deleting Authentication.
  const data=await loadData();
  const links=(await get(ref(db,`connections/${user.uid}`))).val()||{},changes={...dailyRemovals(data.dailyAttempts),[path(user.uid)]:null,[`friendShares/${user.uid}`]:null,[`journeyLeaderboard/${user.uid}`]:null,[`publicProfiles/${user.uid}`]:null};
  for(const other of Object.keys(links)){changes[`connections/${other}/${user.uid}`]=null;changes[`connections/${user.uid}/${other}`]=null;}
  await update(ref(db),changes);
  await deleteUser(user);
}
export async function community(mode='all'){
  const user=current();if(!verified(user))return null;
  return (await get(ref(db,`communityStatistics/${mode}`))).val();
}
export function friendlyError(error){
  const messages={
    'auth/popup-blocked':'Allow the sign-in popup, or open Bussole directly in Safari or Chrome.',
    'auth/popup-closed-by-user':'Google sign-in was cancelled. You can retry or use email and password.',
    'auth/unauthorized-domain':'This site needs to be added to Firebase Authentication’s authorized domains.',
    'auth/credential-already-in-use':'That Google account belongs to another Bussole account. Sign in to it separately; accounts are not merged automatically.',
    'auth/user-mismatch':'Choose the Google account connected to this Bussole account.',
    'auth/operation-not-allowed':'Accounts are being prepared. You can still play as a guest.',
    'auth/invalid-credential':'The email or password is incorrect.',
    'auth/wrong-password':'The email or password is incorrect.',
    'auth/user-not-found':'The email or password is incorrect.',
    'auth/email-already-in-use':'An account already uses this email. Sign in or reset your password.',
    'auth/invalid-email':'Enter a valid email address.',
    'auth/weak-password':'Choose a stronger password (at least 8 characters).',
    'auth/too-many-requests':'Too many attempts. Please wait and try again.',
    'auth/requires-recent-login':'Sign in again before changing these details.',
    'auth/network-request-failed':'Check your connection and try again.',
    'PERMISSION_DENIED':'Account storage is not available yet. You can still play as a guest.',
    'database/permission-denied':'Account storage is not available yet. You can still play as a guest.'
  };
  return messages[error?.code]||error?.message||'Something went wrong. Please retry.';
}
