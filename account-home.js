import { ready } from './account-service.js?v=1';
const link=document.getElementById('accountLink');
ready().then(user=>{link.textContent=user?'My account':'Sign in';}).catch(()=>{});
