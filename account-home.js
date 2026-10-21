import { ready, scheduleSocialSync } from './account-service.js?v=4';
const link=document.getElementById('accountLink');
ready().then(user=>{link.textContent=user?'My account':'Sign in';if(user?.emailVerified)scheduleSocialSync();}).catch(()=>{});
