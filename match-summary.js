(function() {
  const byId=id=>document.getElementById(id);
  const parameters=new URLSearchParams(location.search);
  const embedded=parameters.get('embedded')==='1';
  let report,map,lines,ready=false,view='personal',selectedRound=0,markers=[],popup;
  const geo=window.BussoleReportGeometry;
  function clear() {
    if(lines)for(const key of [...lines.lines.keys()])lines.removeLine(key);
    markers.forEach(marker=>marker.remove());markers=[];popup?.remove();
    byId('summaryStats').replaceChildren();
  }
  function marker(point,colour,label) {
    const element=document.createElement('button');
    element.type='button';element.className='globe-marker target summary-marker';element.style.background=colour;
    element.setAttribute('aria-label',label);
    const position=[point[1],point[0]];
    element.addEventListener('click',event=>{
      event.stopPropagation();
      popup?.remove();const text=document.createElement('div');text.textContent=label;
      popup=new maplibregl.Popup({offset:12}).setLngLat(position).setDOMContent(text).addTo(map);
    });
    markers.push(new maplibregl.Marker({element,anchor:'center'}).setLngLat(position).addTo(map));
  }
  function render() {
    if(!ready)return;
    clear();
    const personal=view==='personal'||report.publicRoom;
    const chosen=personal?report.rounds:[report.rounds[selectedRound]];
    byId('roundPicker').classList.toggle('hidden',personal);
    for(const button of byId('summaryRound').querySelectorAll('button')) {
      const selected=Number(button.dataset.roundIndex)===selectedRound;
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
    }
    byId('personalView').classList.toggle('selected',personal);
    byId('roomView').classList.toggle('selected',!personal);
    const bounds=[];let total=0,count=0;
    chosen.forEach(round=>{
      const target=[round.target.lat,round.target.lon];bounds.push(target);
      const entries=personal?round.entries.filter(entry=>entry.uid===report.uid):round.entries;
      const results=[];
      entries.forEach((entry,index)=>{
        const item=document.createElement('li');item.style.color=entry.color;
        if(!entry.submission) {item.textContent=`Round ${round.round} · ${entry.name} · ${round.target.label} · DNF`;byId('summaryStats').appendChild(item);return;}
        const measured=geo.measure(entry.submission,round.target,round.mode);
        total+=measured.points;count++;results.push({...entry,points:measured.points});
        lines.setLine(`route-${round.round}-${index}`,measured.route,entry.color,3.5,true);
        lines.setLine(`error-${round.round}-${index}`,measured.errorArc,entry.errorColor,3.5);
        bounds.push([entry.submission.lat,entry.submission.lon],measured.contact);
        bounds.push(measured.route[Math.floor(measured.route.length/4)],measured.route[Math.floor(measured.route.length/2)],measured.route.at(-1));
        const error=measured.errorMeters>=1000?`${(measured.errorMeters/1000).toFixed(1)} km`:`${Math.round(measured.errorMeters)} m`;
        const text=`Round ${round.round} · ${entry.name} · ${round.target.label} · ${measured.points} pts · ${error} error`;
        item.textContent=text;byId('summaryStats').appendChild(item);
      });
      const best=Math.max(0,...results.map(result=>result.points));
      const colours=[...new Set(results.filter(result=>result.points===best).map(result=>result.errorColor||'#ff8587'))];
      const colour=personal?entries[0]?.errorColor||'#ff8587':colours.length>1?`linear-gradient(90deg,${colours.join(',')})`:colours[0]||'#ff8587';
      marker(target,colour,`Round ${round.round} · ${round.target.label}`);
    });
    byId('summaryStatus').textContent=personal?`${count} guesses · ${total} points. Tap a target to see its name.`:`${chosen[0].target.label} · All explorers’ guesses for this round.`;
    if(report.partial)byId('summaryStatus').textContent+=' Some earlier rounds predate this feature.';
    const vectors=bounds.map(geo.toUnitVector),sum=vectors.reduce((a,b)=>a.map((v,i)=>v+b[i]),[0,0,0]);
    const centerVector=geo.normalizeVector(sum)||vectors[0];
    if(centerVector) {
      const center=geo.vectorToLatLng(centerVector);
      const radius=Math.max(.03,...vectors.map(vector=>geo.angleBetween(centerVector,vector)));
      map.easeTo({center:[center[1],center[0]],zoom:Math.max(0,Math.min(9,Math.log2(Math.PI/radius)-.9)),bearing:0,pitch:0,duration:650,padding:{top:Math.min(byId('summaryStatus').closest('section').getBoundingClientRect().height+20,window.innerHeight*.45),left:20,right:20,bottom:30},retainPadding:false});
    }
  }
  function initialize(data) {
    if(report||!data?.rounds?.length)return;
    report=data;
    if(report.publicRoom)report.rounds.forEach(round=>{round.entries=round.entries.filter(entry=>entry.uid===report.uid)});
    view=!report.publicRoom&&parameters.get('view')==='room'?'room':'personal';
    byId('roomView').classList.toggle('hidden',report.publicRoom);
    report.rounds.forEach((round,index)=>{
      const button=document.createElement('button');button.type='button';button.textContent=`Round ${round.round}`;
      button.dataset.roundIndex=String(index);button.setAttribute('aria-label',`Round ${round.round}: ${round.target.label}`);
      button.addEventListener('click',()=>{selectedRound=index;render()});byId('summaryRound').appendChild(button);
    });
    byId('summaryBack').href=`./?room=${encodeURIComponent(report.roomCode||'')}&resume=1`;
    map=new maplibregl.Map({container:'summaryMap',attributionControl:false,renderWorldCopies:false,center:[0,20],zoom:0,maxPitch:0,pitch:0,dragRotate:false,
      style:{version:8,sources:{satellite:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19}},layers:[{id:'space',type:'background',paint:{'background-color':'#020712'}},{id:'satellite',type:'raster',source:'satellite'}]}});
    map.on('load',()=>{map.setProjection({type:'globe'});lines=window.BussoleGlobeLines.createLayer('summary-lines');map.addLayer(lines);ready=true;render()});
  }
  byId('personalView').addEventListener('click',()=>{view='personal';render()});
  byId('roomView').addEventListener('click',()=>{if(!report.publicRoom){view='room';render()}});
  if(embedded) {
    window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='bussole-match-report')initialize(event.data.report)});
    for(const link of document.querySelectorAll('.summary-links a'))link.addEventListener('click',event=>{event.preventDefault();parent.postMessage({type:link.id==='summaryBack'?'bussole-summary-close':'bussole-summary-home'},location.origin)});
  } else {
    try{initialize(JSON.parse(sessionStorage.getItem('bussoleMatchReport')))}catch{}
    if(!report)byId('summaryStatus').textContent='No completed match is available on this device. Play a match first.';
  }
})();
