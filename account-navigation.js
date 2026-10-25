const details=document.getElementById('accountDetails');
const groups=[['statistics','Statistics','Charts and personal records',['personalStatistics','soloPersonalBests']],['daily','Daily journey','World progress and today’s shots',['dailyJourney']],['shots','Top Pro shots','Your best shots on one globe',['proBestShots']],['friends','Explorers','Friends, requests and rankings',['socialPanel']],['preferences','Preferences','Profile and Daily notifications',['profileForm','dailyReminderPanel']],['settings','Data & security','Backups, login and account management',[]]];
const hubNav=document.createElement('nav');hubNav.id='accountHub';hubNav.className='account-hub';hubNav.setAttribute('aria-label','Account sections');
const returnLink=document.createElement('a');returnLink.id='accountBack';returnLink.className='app-link';returnLink.href='#';returnLink.textContent='← My account';
const settingsNodes=[...details.children].filter(node=>['signedInEmail','connectGoogle','googleSecurityNote'].includes(node.id)||node.tagName==='SECTION'&&!node.id);
for(const [key,title,description,ids] of groups){
 const link=document.createElement('a');link.className='app-link';link.href='#'+key;
 const name=document.createElement('strong');name.textContent=title;const hint=document.createElement('span');hint.textContent=description;link.append(name,hint);hubNav.append(link);
 const pane=document.createElement('div');pane.dataset.accountPage=key;pane.hidden=true;
 const heading=document.createElement('h2');heading.className='account-page-title';heading.tabIndex=-1;heading.textContent=title;pane.append(heading);
 for(const id of ids)pane.append(document.getElementById(id));
 if(key==='settings')pane.append(...settingsNodes);
 details.append(pane);
}
details.prepend(returnLink,hubNav);
// Keep one account session while giving each area a bookmarkable subpage.
const pages=[...document.querySelectorAll('[data-account-page]')];
const hub=document.getElementById('accountHub'),back=document.getElementById('accountBack');
function navigateAccount(focus=false){
 const key=location.hash.slice(1),page=pages.find(node=>node.dataset.accountPage===key);
 for(const node of pages)node.hidden=node!==page;
 hub.hidden=!!page;back.hidden=!page;
 document.title=page?`Bussole — ${page.querySelector('h2').textContent}`:'Bussole — My account';
 if(focus){window.scrollTo(0,0);(page?.querySelector('.account-page-title')||document.querySelector('h1')).focus({preventScroll:true});}
}
document.querySelector('h1').tabIndex=-1;
if(!location.hash&&new URLSearchParams(location.search).has('friend'))history.replaceState(null,'','#friends');
window.addEventListener('hashchange',()=>navigateAccount(true));
navigateAccount();
