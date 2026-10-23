const {initializeApp}=require('firebase-admin/app');
const {getDatabase}=require('firebase-admin/database');
const functionsV1=require('firebase-functions/v1');
initializeApp();
// Community error aggregation is intentionally disabled. Detailed errors stay on devices.
// Also remove personal data if an account is deleted through the Firebase console.
exports.removeDeletedAccountData=functionsV1.region('europe-west1').auth.user().onDelete(user=>getDatabase().ref(`accountData/${user.uid}`).remove());
