// Button groups retain the existing form values and change events.
(function(root) {
  const groups=new Map();
  function sync(id) {
    const group=groups.get(id),input=document.getElementById(id);
    if(!group||!input)return;
    for(const button of group.querySelectorAll('[data-choice-value]')) {
      const selected=button.dataset.choiceValue===input.value;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    }
  }
  for(const group of document.querySelectorAll('[data-choice-input]')) {
    const id=group.dataset.choiceInput,input=document.getElementById(id);groups.set(id,group);
    for(const button of group.querySelectorAll('[data-choice-value]'))button.addEventListener('click',()=>{
      if(button.disabled||input.value===button.dataset.choiceValue)return;
      input.value=button.dataset.choiceValue;sync(id);
      input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    input.addEventListener('change',()=>sync(id));sync(id);
  }
  root.BussoleChoices={sync};
})(window);
