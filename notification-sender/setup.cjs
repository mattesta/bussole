// Run locally; never upload the secret file to chat or commit it to the repository.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),webpush=require('web-push');
const directory=path.resolve(process.argv[2]||'.');fs.mkdirSync(directory,{recursive:true});
const keys=webpush.generateVAPIDKeys(),secret={email:'daily-reminder-sender@bussole.invalid',password:crypto.randomBytes(32).toString('base64url'),vapidPrivateKey:keys.privateKey};
fs.writeFileSync(path.join(directory,'bussole-reminders-secret.json'),JSON.stringify(secret,null,2)+'\n',{mode:0o600,flag:'wx'});
fs.writeFileSync(path.join(directory,'daily-reminder-config.json'),JSON.stringify({enabled:false,senderUid:'PASTE_FIREBASE_SENDER_UID',publicVapidKey:keys.publicKey},null,2)+'\n',{flag:'wx'});
console.log('Created bussole-reminders-secret.json (private) and daily-reminder-config.json (public). Follow DAILY_REMINDERS_SETUP.md; no credentials were printed.');
