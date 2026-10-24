import {watchDailyFriends} from './social-service.js?v=7';
export function showDailyFriends(element,day,ownScore){
 element.replaceChildren();
 const title=document.createElement('h3');title.textContent='Daily · friends';
 const list=document.createElement('ol');list.style.listStyle='none';list.style.paddingLeft='0';element.append(title,list);
 return watchDailyFriends(day,ownScore,rows=>{
  list.replaceChildren();
  if(!rows.some(row=>!row.own)){const li=document.createElement('li');li.textContent='Add friends from My account to compare today’s results.';list.append(li);return;}
  let position=0,previous=null,rank=0;
  for(const row of rows){
   const li=document.createElement('li');
   if(row.score!==null){position++;if(row.score!==previous)rank=position;previous=row.score;li.textContent=`#${rank} · ${row.name} — ${row.score} / 5,000`;}
   else li.textContent=`${row.name} — No shared result for this day yet`;
   list.append(li);
  }
 },()=>{list.replaceChildren();const li=document.createElement('li');li.textContent='Friends’ results are temporarily unavailable.';list.append(li);});
}
