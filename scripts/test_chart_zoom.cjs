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
  const touches=async(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:i+1}))});
  async function pinch(id){await page.locator('#'+id).scrollIntoViewIfNeeded();await touches('touchStart',[await point(id,120,90),await point(id,200,90)]);await touches('touchMove',[await point(id,40,90),await point(id,280,90)]);await touches('touchEnd');}
  await pinch('angle');assert.ok(Number(await page.locator('#angle svg').getAttribute('data-zoom'))>2.9);
  assert.equal(await page.locator('#angle .chart-guess-ray').count(),4);assert.match(await page.locator('#angle svg').textContent(),/Angular window/);assert.match(await page.locator('#angle svg').textContent(),/25°/);
  assert.equal(await page.locator('#angle circle.chart-guide').count(),0);await page.screenshot({path:'/tmp/bussole-zoom-angle.png'});
  // Inspection remains attached to the transformed strokes, not their old positions.
  await send('touchStart',await point('angle',205,216-Math.cos(Math.PI/6)*90));assert.match(await page.locator('#angle .chart-inspection-label').textContent(),/Tokyo/);await send('touchEnd');
  await page.locator('#angle').getByRole('button',{name:'Reset chart zoom'}).click();assert.equal(await page.locator('#angle .chart-guess-ray').count(),7);
  await pinch('distance');assert.ok(Number(await page.locator('#distance svg').getAttribute('data-zoom'))>2.9);assert.equal(await page.locator('#distance .chart-guess-tick').count(),2);assert.match(await page.locator('#distance svg').textContent(),/20%/);await page.screenshot({path:'/tmp/bussole-zoom-distance.png'});
  const beforeLabels=await page.locator('#distance svg').textContent();
  await touches('touchStart',[await point('distance',100,70),await point('distance',220,70)]);await touches('touchMove',[await point('distance',40,70),await point('distance',160,70)]);await touches('touchEnd');assert.notEqual(await page.locator('#distance svg').textContent(),beforeLabels);
  await page.locator('#distance').getByRole('button',{name:'Reset chart zoom'}).click();assert.equal(await page.locator('#distance .chart-guess-tick').count(),5);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);console.log('Native chart zoom passed: two-finger pinch and pan, detailed original-unit ticks, upper angular window, inspection after transformation, reset and mobile overflow.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
