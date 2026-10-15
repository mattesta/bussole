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
  function marker(point,colour,label,roundNumber) {
    const element=document.createElement('button');
    element.type='button';element.className='globe-marker target summary-marker';element.style.background=colour;
    element.textContent=String(roundNumber);
    element.setAttribute('aria-label',`Round ${roundNumber} · ${label}`);
    const position=[point[1],point[0]];
    element.addEventListener('click',event=>{
      event.stopPropagation();
      popup?.remove();const text=document.createElement('div');text.textContent=label;
      popup=new maplibregl.Popup({offset:12,closeButton:false,closeOnClick:true}).setLngLat(position).setDOMContent(text).addTo(map);
    });
    markers.push(new maplibregl.Marker({element,anchor:'center'}).setLngLat(position).addTo(map));
  }
  function render() {
    if(!ready)return;
    clear();
    const personal=view!=='room'||report.publicRoom;
    const chosen=personal?report.rounds:[report.rounds[selectedRound]];
    byId('roundPicker').classList.toggle('hidden',personal);
    for(const button of byId('summaryRound').querySelectorAll('button')) {
      const selected=Number(button.dataset.roundIndex)===selectedRound;
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
    }
    const statistics=view==='statistics';
    byId('statisticsPanel').classList.toggle('hidden',!statistics);
    byId('summaryStats').classList.toggle('hidden',statistics);
    byId('statisticsView').classList.toggle('selected',statistics);
    byId('personalView').classList.toggle('selected',personal&&!statistics);
    byId('roomView').classList.toggle('selected',!personal);
    for(const id of ['personalView','roomView','statisticsView'])byId(id).setAttribute('aria-pressed',String(byId(id).classList.contains('selected')));
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
      marker(target,colour,round.target.label,round.round);
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
  function renderStatistics(stats) {
    byId('statisticsCount').textContent=`${stats.completed} of ${stats.rounds} rounds completed · ${stats.missed} without a guess (excluded).`;
    const format=(value,unit,signed=false)=>value===null?'—':`${signed&&Math.round(value*10)>0?'+':''}${(Math.round(value*10)/10||0).toFixed(1)}${unit}`;
    const metrics=[
      ['Mean relative error',stats.relativeError,'%',false,stats.relativeCount,'Final error divided by target distance. Lower is better.'],
      ['Mean absolute angle error',stats.absoluteAngle,'°',false,stats.angleCount,'Direction error, regardless of side. Lower is better.'],
      ['Directional bias',stats.angleBias,'°',true,stats.angleCount,'Positive: right. Negative: left.'],
    ];
    if(stats.proRounds)metrics.push(
      ['Mean absolute distance error · Pro',stats.absoluteDistance,'%',false,stats.distanceCount,'Chosen distance versus target distance, regardless of short or long.'],
      ['Distance bias · Pro',stats.distanceBias,'%',true,stats.distanceCount,'Positive: too long. Negative: too short.']
    );
    byId('statisticsMetrics').replaceChildren();
    for(const [label,value,unit,signed,count,explanation] of metrics) {
      const term=document.createElement('dt');term.textContent=label;
      const detail=document.createElement('dd');
      const number=document.createElement('strong');number.textContent=format(value,unit,signed);
      const note=document.createElement('span');note.textContent=`${explanation} ${count} ${count===1?'guess':'guesses'}.`;
      detail.append(number,note);byId('statisticsMetrics').append(term,detail);
    }
  }
  function initialize(data) {
    if(report||!data?.rounds?.length)return;
    report=data;
    if(report.publicRoom)report.rounds.forEach(round=>{round.entries=round.entries.filter(entry=>entry.uid===report.uid)});
    renderStatistics(window.BussoleSummaryStatistics.calculate(report));
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
  byId('statisticsView').addEventListener('click',()=>{view='statistics';render()});
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
