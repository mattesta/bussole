(function(root) {
  const controls = document.querySelector('.game-controls');
  let largestHeight = window.innerHeight;
  function metrics() {
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    const top = viewport?.offsetTop || 0;
    largestHeight = Math.max(largestHeight, height);
    const inset = Math.max(0, window.innerHeight - top - height);
    const editing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    return {height,top,inset,keyboard:editing && (largestHeight-height>100 || inset>100),controls:controls?.getBoundingClientRect().height || 72};
  }
  function positionTimer(element) {
    const m=metrics();
    element.style.top = `${Math.max(m.top+8,m.top+m.height-(m.keyboard?12:m.controls+26)-(element.offsetHeight||43))}px`;
  }
  function update() {
    const m=metrics(), style=document.documentElement.style;
    style.setProperty('--keyboard-inset',`${m.inset}px`);
    style.setProperty('--search-gap',`${m.keyboard?12:m.controls+24}px`);
    style.setProperty('--visible-height',`${m.height}px`);
    const timer=document.getElementById('globeCountdown');
    if(document.body.classList.contains('globe-multiplayer') && timer) positionTimer(timer);
  }
  window.addEventListener('resize',update);
  window.visualViewport?.addEventListener('resize',update);
  window.visualViewport?.addEventListener('scroll',update);
  document.addEventListener('focusin',update);
  document.addEventListener('focusout',()=>requestAnimationFrame(update));
  if(controls && typeof ResizeObserver!=='undefined')new ResizeObserver(update).observe(controls);
  root.BussoleMobileLayout={metrics,positionTimer,update};
  update();
})(window);
