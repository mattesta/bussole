import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendEmailVerification, sendPasswordResetEmail, reload, EmailAuthProvider,
  reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail, deleteUser
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getDatabase, ref, get, set, update, runTransaction } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const app=initializeApp(firebaseConfig);
export const auth=getAuth(app);
const db=getDatabase(app);
export const defaultProfile={username:'',useInRooms:false,communityConsent:false,consentVersion:1};
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
  if(profile.communityConsent&&!verified(user))throw new Error('Verify your email before contributing.');
  await loadProfile();
  await update(ref(db,`${path(user.uid)}/profile`),{
    username,useInRooms:Boolean(username&&profile.useInRooms),communityConsent:Boolean(profile.communityConsent),consentVersion:1
  });
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
  return {saved:true,isNew:result.committed,best:result.snapshot.val()?.score??score};
}
export async function deleteStatistics(){
  const user=current();
  await loadProfile();
  await update(ref(db,path(user.uid)),{samples:null,soloBests:null,'profile/communityConsent':false,'profile/consentVersion':1,'profile/generation':crypto.randomUUID()});
}
async function reauthenticate(password){
  const user=current();await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,password));return user;
}
export async function changePassword(password,next){await updatePassword(await reauthenticate(password),next);}
export async function changeEmail(password,email){await verifyBeforeUpdateEmail(await reauthenticate(password),email.trim());}
export async function deleteAccount(password){
  const user=await reauthenticate(password);
  // Remove database data while cleanup is still authorized, before deleting Authentication.
  await set(ref(db,path(user.uid)),null);
  await deleteUser(user);
}
export async function community(mode='all'){
  const user=current();if(!verified(user))return null;
  return (await get(ref(db,`communityStatistics/${mode}`))).val();
}
export function friendlyError(error){
  const messages={
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
