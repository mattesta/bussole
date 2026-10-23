(function(root) {
  const colours=['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#00a6a6','#f781bf','#6b4c2a'];
  const errors=['#ff8587','#86c5f4','#92dc8f','#d29ddd','#ffc06a','#70dada','#ffc0df','#b99a78'];
  function rounds(meta,target,settings,players) {
    const start=meta.matchStartRound||0;
    const records=Object.values(meta.roundHistory||{}).filter(record=>record.matchStartRound===start && record.round>start && record.round<=meta.round);
    if(!records.some(record=>record.round===meta.round))records.push({round:meta.round,target,mode:settings.mode,players,matchStartRound:start});
    return records.sort((a,b)=>a.round-b.round);
  }
  async function load({uid,meta,target,settings,players,readOwnGuess}) {
    const records=rounds(meta,target,settings,players);
    const history=await Promise.all(records.map(async record=>{
      const player=record.players?.[uid]||players[uid];
      const submission=await readOwnGuess(record.round);
      const entries=player?[{uid,name:player.name,color:colours[player.colorIndex]||colours[0],errorColor:errors[player.colorIndex]||errors[0],submission:submission||null}]:[];
      return {round:record.round-startRound(meta)+1,target:record.target,mode:record.mode||'medium',entries};
    }));
    return {version:1,uid,publicRoom:true,rounds:history,partial:history.length!==meta.round-(meta.matchStartRound||0)};
  }
  const startRound=meta=>(meta.matchStartRound||0)+1;
  function save(report,roomCode) {
    const data={...report,roomCode,savedAt:Date.now()};
    try {sessionStorage.setItem('bussoleMatchReport',JSON.stringify(data));return true;}catch{return false;}
  }
  root.BussoleMatchReport={load,rounds,save};
})(window);
