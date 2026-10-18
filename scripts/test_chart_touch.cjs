const fs=require('fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=require('node:path').resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BUSSOLE_TEST_CHROMIUM||chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote'],env:{...process.env,FONTCONFIG_PATH:'/etc/fonts'}});
 try{
  const context=await browser.newContext({viewport:{width:Number(process.env.BUSSOLE_TEST_WIDTH)||390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${fs.readFileSync(root+'/style.css','utf8')}${fs.readFileSync(root+'/match-summary.css','utf8')}body{height:auto;padding:12px}.summary-chart{max-width:500px}#spacer{height:400px}</style><div id="spacer"></div><div id="angle"></div><div id="distance"></div><div style="height:800px"></div>`);
  await page.addScriptTag({content:fs.readFileSync(root+'/summary-charts.js','utf8')});
  await page.evaluate(()=>{
   angle.append(BussoleSummaryCharts.angle([-90,-20,0,20,24,90,180].map((error,i)=>({error,target:['West','Munich','North','Tokyo','Nairobi','East','South'][i]})),12));
   distance.append(BussoleSummaryCharts.distance([-50,-48,0,20,100].map((error,i)=>({error,target:['Paris','Rome','Zero','Lima','An extremely long target name with WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW to wrap'][i]})),4));
  });
  const cdp=await context.newCDPSession(page);
  const point=async(id,x,y)=>page.locator(`#${id} svg`).evaluate((el,{x,y})=>{const r=el.getBoundingClientRect(),s=r.width/320;return{x:r.left+x*s,y:r.top+y*s}},{x,y});
  const send=async(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{x:p.x,y:p.y,id:1}]:[]});
  const ray=degrees=>({x:160+Math.sin(degrees*Math.PI/180)*65,y:128-Math.cos(degrees*Math.PI/180)*65});
  const pos=async(degrees)=>{const p=ray(degrees);return point('angle',p.x,p.y)};
  await page.locator('#angle').scrollIntoViewIfNeeded();const startScroll=await page.evaluate(()=>scrollY);
  await send('touchStart',await pos(20));assert.match(await page.locator('#angle .chart-inspection-label').textContent(),/Tokyo/);
  await send('touchMove',await pos(24));assert.match(await page.locator('#angle .chart-inspection-label').textContent(),/Nairobi/);
  await send('touchMove',await pos(45));assert.equal(await page.locator('#angle .chart-selected-stroke').count(),0);
  await send('touchMove',await pos(20));assert.equal(await page.locator('#angle .chart-selected-stroke').count(),1);assert.equal(await page.evaluate(()=>scrollY),startScroll);
  await page.screenshot({path:'/tmp/bussole-touch-angle.png'});await send('touchEnd');assert.equal(await page.locator('#angle .chart-selected-stroke').count(),0);assert.equal(await page.locator('#angle .chart-inspection-label').getAttribute('visibility'),'hidden');
  await page.locator('#distance').scrollIntoViewIfNeeded();
  await send('touchStart',await point('distance',92,70));assert.match(await page.locator('#distance .chart-inspection-label').textContent(),/Paris/);
  await send('touchMove',await point('distance',94.72,70));assert.match(await page.locator('#distance .chart-inspection-label').textContent(),/Rome/);
  await send('touchMove',await point('distance',120,70));assert.equal(await page.locator('#distance .chart-selected-stroke').count(),0);
  await send('touchMove',await point('distance',296,70));await page.screenshot({path:'/tmp/bussole-touch-distance.png'});
  const bounds=await page.locator('#distance svg').evaluate(svg=>[...svg.querySelectorAll('.chart-inspection-text')].map(t=>{const b=t.getBBox();return[b.x,b.x+b.width,b.y,b.y+b.height]}));
  assert.ok(bounds.every(([left,right,top,bottom])=>left>=0&&right<=320&&top>=0&&bottom<=132));
  await send('touchCancel');assert.equal(await page.locator('#distance .chart-selected-stroke').count(),0);
  // Scroll starts normally in empty SVG space instead of snapping to a guess.
  await page.locator('#angle').scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);const empty=await point('angle',290,100);
  await send('touchStart',empty);assert.equal(await page.locator('#angle .chart-selected-stroke').count(),0);
  for(let delta=15;delta<=90;delta+=15){await send('touchMove',{x:empty.x,y:empty.y-delta});await page.waitForTimeout(24);}await send('touchEnd');await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>scrollY)>before);
  assert.deepEqual(errors,[]);console.log('Native touch passed: close rays/ticks switch individually, empty space deselects, release/cancel clears, captured inspection does not scroll, empty chart permits scrolling, and long target labels stay inside the chart.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
