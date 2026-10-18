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
  function distance(samples,mean) {
    samples=valid(samples);
    const {figure:chart,svg}=figure('distance',132,'Relative distance errors: short to the left, long to the right, target at zero',
      'Dots: guesses · White: target · Red diamond: mean bias. Repeated dots are stacked.');
    const maximum=Math.max(1,...samples.map(sample=>Math.abs(sample.error)),Number.isFinite(mean)?Math.abs(mean):0);
    const magnitude=10**Math.floor(Math.log10(maximum));
    const extent=([1,2,5,10].find(step=>step*magnitude>=maximum)||10)*magnitude;
    const x=value=>160+value/extent*136;
    line(svg,24,70,296,70,'chart-axis');
    for(const tick of [-extent,extent])line(svg,x(tick),65,x(tick),75,'chart-axis');
    line(svg,160,45,160,86,'chart-target');label(svg,160,23,'Target · 0%');
    label(svg,24,122,`${signed(-extent)}%`,'start');label(svg,296,122,`${signed(extent)}%`,'end');
    const stacks=new Map();
    for(const sample of samples) {
      const position=x(sample.error),bucket=Math.round(position/9),level=stacks.get(bucket)||0;
      stacks.set(bucket,level+1);
      const offset=level?Math.min(25,Math.ceil(level/2)*10)*(level%2?1:-1):0;
      const point=node('circle',{cx:position,cy:70+offset,r:4.5,class:'chart-guess-dot'});
      describe(point,sample,'%');svg.appendChild(point);
    }
    if(Number.isFinite(mean)) {
      const center=x(mean);
      line(svg,center,71,center,93,'chart-mean-stem');
      const mark=node('path',{d:`M${center} 91l6 7-6 7-6-7z`,class:'chart-mean-dot'});
      mark.appendChild(node('title',{},`Mean distance bias: ${signed(mean)}%`));svg.appendChild(mark);
    }
    if(!samples.length)label(svg,160,103,'No valid Pro distance guesses.');
    return chart;
  }
  function angle(samples,mean) {
    samples=valid(samples);
    const {figure:chart,svg}=figure('angle',252,'Angular errors relative to the target: negative left, positive right',
      samples.length&&mean===null?'Each ray is a guess. No clear mean direction.':'Rays: guesses · White: target · Red: circular mean.');
    const cx=160,cy=128,radius=86;
    const end=degrees=>[cx+Math.sin(degrees*Math.PI/180)*radius,cy-Math.cos(degrees*Math.PI/180)*radius];
    svg.appendChild(node('circle',{cx,cy,r:radius,class:'chart-guide'}));
    line(svg,cx-radius,cy,cx+radius,cy,'chart-axis');
    line(svg,cx,cy,cx,cy-radius,'chart-target');
    label(svg,cx,24,'Target · 0°');label(svg,24,132,'−90°','start');label(svg,296,132,'+90°','end');label(svg,cx,237,'±180°');
    for(const sample of samples) {
      const [x,y]=end(sample.error);
      describe(line(svg,cx,cy,x,y,'chart-guess-ray'),sample,'°');
    }
    if(Number.isFinite(mean)) {
      const [x,y]=end(mean);
      const ray=line(svg,cx,cy,x,y,'chart-mean-ray');
      ray.appendChild(node('title',{},`Circular mean angle: ${signed(mean)}°`));
      svg.appendChild(node('circle',{cx:x,cy:y,r:3.5,class:'chart-mean-dot'}));
    }
    svg.appendChild(node('circle',{cx,cy,r:3,class:'chart-origin'}));
    if(!samples.length)label(svg,cx,166,'No valid angle guesses.');
    return chart;
  }
  root.BussoleSummaryCharts={distance,angle};
})(window);
