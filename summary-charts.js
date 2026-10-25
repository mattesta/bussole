(function(root) {
  const NS='http://www.w3.org/2000/svg';
  function node(tag,attributes={},text) {
    const element=document.createElementNS(NS,tag);
    for(const [key,value] of Object.entries(attributes))element.setAttribute(key,String(value));
    if(text!==undefined)element.textContent=text;
    return element;
  }
  function label(svg,x,y,text,anchor='middle') {
    svg.appendChild(node('text',{x,y,'text-anchor':anchor,class:'chart-label'},text));
  }
  function line(svg,x1,y1,x2,y2,kind) {
    const element=node('line',{x1,y1,x2,y2,class:kind});svg.appendChild(element);return element;
  }
  function figure(kind,height,title,caption) {
    const figure=document.createElement('figure');figure.className=`summary-chart ${kind}-chart`;
    const svg=node('svg',{viewBox:`0 0 320 ${height}`,role:'img','aria-label':title});
    svg.appendChild(node('title',{},title));
    const text=document.createElement('figcaption');text.textContent=caption;
    figure.append(svg,text);return {figure,svg};
  }
  const valid=samples=>(samples||[]).filter(sample=>Number.isFinite(sample.error));
  const number=value=>new Intl.NumberFormat('en',{maximumFractionDigits:1,notation:Math.abs(value)>=10000?'compact':'standard'}).format(value);
  const signed=value=>{const rounded=Math.round(value*10)/10||0;return `${rounded>0?'+':''}${number(rounded)}`;};
  function describe(element,sample,unit) {
    element.appendChild(node('title',{},`${sample.round===undefined?'Guess':`Round ${sample.round}`}${sample.target?` · ${sample.target}`:''}: ${signed(sample.error)}${unit}`));
  }
  // Select only within five CSS pixels of an original guess stroke. The
  // extended highlight never expands the hit area or selects empty space.
  function inspect(svg, samples, segments, extended, unit) {
    const highlight=node('g',{class:'chart-inspection-highlight','pointer-events':'none'});
    const annotation=node('g',{class:'chart-inspection-label','pointer-events':'none',visibility:'hidden'});
    svg.appendChild(highlight);
    const listeners=[];
    function listen(type,handler,options){svg.addEventListener(type,handler,options);listeners.push([type,handler,options]);}
    let selected=-1,holding=false,touchOwned=false,pointerId=null;
    const originalLabel=svg.getAttribute('aria-label');
    function clear() {
      selected=-1;highlight.replaceChildren();annotation.replaceChildren();
      annotation.setAttribute('visibility','hidden');svg.setAttribute('aria-label',originalLabel);
    }
    function position(clientX,clientY) {
      const rect=svg.getBoundingClientRect(),scale=rect.width/320;
      if(!scale)return null;
      return {x:(clientX-rect.left)/scale,y:(clientY-rect.top)/scale,scale};
    }
    function hit(point) {
      if(!point)return -1;
      let nearest=-1,distance=5/point.scale;
      segments.forEach(([x1,y1,x2,y2],index)=>{
        const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy;
        const t=length?Math.max(0,Math.min(1,((point.x-x1)*dx+(point.y-y1)*dy)/length)):0;
        const gap=Math.hypot(point.x-x1-t*dx,point.y-y1-t*dy);
        if(gap<distance){nearest=index;distance=gap;}
      });
      return nearest;
    }
    function select(index) {
      if(index===selected)return;
      clear();if(index<0)return;selected=index;
      const sample=samples[index],segment=extended(index);
      line(highlight,...segment,'chart-selected-stroke');
      const title=sample.target||'Guess';
      const [, ,endX,endY]=segment;
      const availableWidth=Math.max(endX-16,304-endX),textWidth=availableWidth-20;
      const meter=node('text',{class:'chart-inspection-text'});annotation.appendChild(meter);
      const measure=text=>{meter.textContent=text;return meter.getComputedTextLength?.()||text.length*6.5;};
      const words=title.split(/\s+/),rows=[];let row='';
      for(let word of words){
        while(measure(word)>textWidth){if(row){rows.push(row);row='';}let length=word.length;while(length>1&&measure(word.slice(0,length))>textWidth)length--;rows.push(word.slice(0,length));word=word.slice(length);}
        if(row&&measure(row+' '+word)>textWidth){rows.push(row);row=word;}else row+=(row?' ':'')+word;
      }
      if(row)rows.push(row);
      const visible=rows.slice(0,3);if(rows.length>3){while(measure(visible[2]+'…')>textWidth)visible[2]=visible[2].slice(0,-1);visible[2]+='…';}
      visible.push(`${signed(sample.error)}${unit}`);
      const width=Math.min(availableWidth,Math.max(...visible.map(measure))+20),height=visible.length*16+14;
      const x=Math.max(8,Math.min(312-width,endX+(endX>=160?-width-8:8)));
      const svgHeight=Number(svg.getAttribute('viewBox').split(' ')[3]);
      const y=Math.max(6,Math.min(svgHeight-height-6,endY<svgHeight/2?endY-height-8:endY+8));
      annotation.replaceChildren();
      annotation.appendChild(node('rect',{x,y,width,height,rx:8,class:'chart-inspection-box'}));
      visible.forEach((text,index)=>annotation.appendChild(node('text',{x:x+10,y:y+19+index*16,class:'chart-inspection-text'},text)));
      annotation.setAttribute('visibility','visible');
      svg.setAttribute('aria-label',`${originalLabel}. ${title}: ${signed(sample.error)}${unit}`);
    }
    function stop(){holding=false;touchOwned=false;pointerId=null;clear();}
    // Prevent scrolling only when an inspection actually starts on a stroke.
    // Empty chart areas retain native page scrolling; captured gestures may
    // cross empty areas without highlighting them, then find another stroke.
    listen('touchstart',event=>{
      if(event.touches.length!==1){stop();return;}
      holding=true;const touch=event.touches[0];
      const index=hit(position(touch.clientX,touch.clientY));
      touchOwned=index>=0;if(touchOwned)event.preventDefault();select(index);
    },{passive:false});
    listen('touchmove',event=>{
      if(!holding||event.touches.length!==1||event.cancelable===false){stop();return;}
      const touch=event.touches[0],index=hit(position(touch.clientX,touch.clientY));
      if(touchOwned||index>=0){event.preventDefault();touchOwned=true;}
      select(index);
    },{passive:false});
    listen('touchend',stop);listen('touchcancel',stop);
    listen('pointerdown',event=>{
      if(event.pointerType==='touch'||event.button!==0)return;
      holding=true;pointerId=event.pointerId;
      svg.setPointerCapture?.(pointerId);select(hit(position(event.clientX,event.clientY)));
    });
    listen('pointermove',event=>{
      if(event.pointerType==='touch'||!holding||event.pointerId!==pointerId)return;
      select(hit(position(event.clientX,event.clientY)));
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(type,event=>{if(event.pointerType!=='touch')stop();});
    listen('contextmenu',event=>{if(holding)event.preventDefault();});
    const finish=()=>svg.appendChild(annotation);finish.destroy=()=>{stop();for(const args of listeners)svg.removeEventListener?.(...args);};return finish;
  }
  function tickStep(range){
    const raw=range/5,power=10**Math.floor(Math.log10(raw));
    return ([1,2,2.5,5,10].find(value=>value*power>=raw)||10)*power;
  }
  function ticks(min,max){
    const step=tickStep(max-min),values=[];
    for(let value=Math.ceil(min/step)*step;value<=max+step*1e-8;value+=step)values.push(Math.abs(value)<step*1e-8?0:value);
    return values;
  }
  function interactive(kind,samples,mean){
    samples=valid(samples);
    const isAngle=kind==='angle',height=isAngle?252:202;
    const title=isAngle?'Angular errors relative to the target: negative left, positive right':'Relative distance errors: short to the left, long to the right, target at zero';
    const {figure:chart,svg}=figure(kind,height,title,
      `${isAngle?'Rays':'Ticks'}: guesses · White: target · Red: mean. Hold a stroke to inspect. Pinch to zoom; move two fingers to explore.`);
    const maximum=Math.max(1,...samples.map(sample=>Math.abs(sample.error)),Number.isFinite(mean)?Math.abs(mean):0);
    const magnitude=10**Math.floor(Math.log10(maximum));
    const extent=isAngle?180:([1,2,5,10].find(step=>step*magnitude>=maximum)||10)*magnitude;
    const maxZoom=isAngle?36:128;
    let zoom=1,center=0,inspection=null,pinch=null;
    const controls=document.createElement('div');controls.className='chart-zoom-controls';
    function button(text,description,handler){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',description);b.onclick=handler;controls.append(b);return b;}
    const less=button('−','Zoom out chart',()=>change(zoom/2,center));
    button('Reset zoom','Reset chart zoom',()=>change(1,0));
    const more=button('+','Zoom in chart',()=>change(zoom*2,center));
    chart.insertBefore(controls,chart.lastChild);
    function change(value,nextCenter){zoom=Math.max(1,Math.min(maxZoom,value));const half=extent/zoom;center=Math.max(-extent+half,Math.min(extent-half,nextCenter));draw();}
    function draw(){
      inspection?.destroy();svg.replaceChildren(node('title',{},title));
      svg.dataset.zoom=String(zoom);less.disabled=zoom===1;more.disabled=zoom===maxZoom;
      const half=extent/zoom,min=center-half,max=center+half,visible=samples.filter(sample=>sample.error>=min&&sample.error<=max);
      let segments;
      if(!isAngle){
        const x=value=>160+(value-center)/half*136;
        line(svg,24,140,296,140,'chart-axis');
        for(const value of ticks(min,max)){const at=x(value);line(svg,at,135,at,145,'chart-axis');label(svg,at,188,`${signed(value)}%`);}
        if(min<=0&&max>=0){line(svg,x(0),115,x(0),156,'chart-target');label(svg,x(0),23,'Target · 0%');}
        else label(svg,160,23,'Relative distance error');
        segments=visible.map(sample=>[x(sample.error),118,x(sample.error),146]);
        visible.forEach((sample,i)=>describe(line(svg,...segments[i],'chart-guess-tick'),sample,'%'));
        inspection=inspect(svg,visible,segments,i=>[x(visible[i].error),146,x(visible[i].error),90],'%');
        if(Number.isFinite(mean)&&mean>=min&&mean<=max){const at=x(mean);line(svg,at,141,at,163,'chart-mean-stem');const mark=node('path',{d:`M${at} 161l6 7-6 7-6-7z`,class:'chart-mean-dot'});mark.append(node('title',{},`Mean distance bias: ${signed(mean)}%`));svg.append(mark);}
      }else{
        const full=zoom===1,cx=160,cy=full?128:216,radius=full?86:130;
        // At overview the true circle is retained. Zoom opens an angular window
        // into the upper fan; labels always state the original error in degrees.
        const radians=degrees=>(full?degrees:(degrees-center)/half*90)*Math.PI/180;
        const end=(degrees,length=radius)=>[cx+Math.sin(radians(degrees))*length,cy-Math.cos(radians(degrees))*length];
        if(full){
          svg.appendChild(node('circle',{cx,cy,r:radius,class:'chart-guide'}));line(svg,cx-radius,cy,cx+radius,cy,'chart-axis');
          label(svg,cx,24,'Target · 0°');label(svg,24,132,'−90°','start');label(svg,296,132,'+90°','end');label(svg,cx,237,'±180°');
        }else{
          svg.append(node('path',{d:`M${cx-radius} ${cy} A${radius} ${radius} 0 0 1 ${cx+radius} ${cy}`,class:'chart-guide'}));
          label(svg,cx,22,`Angular window · ${signed(min)}° to ${signed(max)}°`);
          for(const value of ticks(min,max)){
            const [x1,y1]=end(value,radius-4),[x2,y2]=end(value,radius+4),[x,y]=end(value,radius+18);
            line(svg,x1,y1,x2,y2,'chart-axis');label(svg,x,y+4,`${signed(value)}°`);
          }
        }
        if(min<=0&&max>=0)line(svg,cx,cy,...end(0),'chart-target');
        segments=visible.map(sample=>[cx,cy,...end(sample.error)]);
        visible.forEach((sample,i)=>describe(line(svg,...segments[i],'chart-guess-ray'),sample,'°'));
        inspection=inspect(svg,visible,segments,i=>[cx,cy,...end(visible[i].error,full?108:151)],'°');
        if(Number.isFinite(mean)&&mean>=min&&mean<=max){const [x,y]=end(mean);const ray=line(svg,cx,cy,x,y,'chart-mean-ray');ray.append(node('title',{},`Circular mean angle: ${signed(mean)}°`));svg.append(node('circle',{cx:x,cy:y,r:3.5,class:'chart-mean-dot'}));}
        svg.append(node('circle',{cx,cy,r:3,class:'chart-origin'}));
      }
      inspection();
      if(!samples.length)label(svg,160,isAngle?166:173,isAngle?'No valid angle guesses.':'No valid Pro distance guesses.');
    }
    const midpoint=touches=>(touches[0].clientX+touches[1].clientX)/2;
    const gap=touches=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
    // Capture pinch before one-finger inspection. Two-finger events stay on the
    // same SVG while its contents redraw, preserving the gesture on iOS.
    svg.addEventListener('touchstart',event=>{
      if(event.touches.length!==2)return;
      event.preventDefault();event.stopImmediatePropagation();inspection?.destroy();
      pinch={gap:Math.max(1,gap(event.touches)),mid:midpoint(event.touches),zoom,center};
    },{passive:false,capture:true});
    svg.addEventListener('touchmove',event=>{
      if(!pinch)return;event.preventDefault();event.stopImmediatePropagation();if(event.touches.length!==2)return;
      const value=Math.max(1,Math.min(maxZoom,pinch.zoom*gap(event.touches)/pinch.gap));
      const width=svg.getBoundingClientRect().width||320,half=extent/value;
      const anchor=(pinch.mid-svg.getBoundingClientRect().left)/width*320;
      const offset=(anchor-160)/136;
      const nextCenter=isAngle?pinch.center-(midpoint(event.touches)-pinch.mid)/width*2*extent/pinch.zoom:pinch.center+offset*(extent/pinch.zoom-half)-(midpoint(event.touches)-pinch.mid)/width*320/136*half;
      change(value,nextCenter);
    },{passive:false,capture:true});
    for(const type of ['touchend','touchcancel'])svg.addEventListener(type,event=>{
      if(!pinch)return;event.stopImmediatePropagation();if(event.touches.length===0){pinch=null;draw();}
    },{capture:true});
    draw();return chart;
  }
  const distance=(samples,mean)=>interactive('distance',samples,mean);
  const angle=(samples,mean)=>interactive('angle',samples,mean);
  root.BussoleSummaryCharts={distance,angle};
})(window);
