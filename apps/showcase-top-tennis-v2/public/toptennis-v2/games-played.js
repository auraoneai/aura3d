(() => {
  'use strict';
  const label = document.getElementById('games-played');
  const hoursLabel = document.getElementById('hours-played');
  const completedLabel = document.getElementById('matches-completed');
  let lastCompletedTotal = -1;
  let lastTotal = -1, lastTimeTotal = -1, session = null, lastFrame = null, wasActive = false;
  const cacheKey = 'tennis-public-stats-v1';
  function showTotals({total,completedTotal,playMilliseconds,estimatedPlayMilliseconds}) {
      if (label && Number.isSafeInteger(total) && total >= 0) {
        lastTotal = Math.max(lastTotal,total);
        label.textContent = lastTotal.toLocaleString('en-US') + ' games played worldwide';
      }
      if (completedLabel) {
        if (Number.isSafeInteger(completedTotal) && completedTotal >= 0) {
          lastCompletedTotal = Math.max(lastCompletedTotal,completedTotal);
          completedLabel.textContent = lastCompletedTotal.toLocaleString('en-US') + ' ' + (lastCompletedTotal === 1 ? 'match' : 'matches') + ' completed worldwide';
        } else if (lastCompletedTotal < 0) completedLabel.textContent = 'Completed matches: unavailable';
      }
      if (hoursLabel && Number.isSafeInteger(playMilliseconds) && playMilliseconds >= 0) {
        const estimate = Number.isSafeInteger(estimatedPlayMilliseconds) && estimatedPlayMilliseconds > 0 ? estimatedPlayMilliseconds : 0;
        lastTimeTotal = Math.max(lastTimeTotal,playMilliseconds + estimate);
        const hours = Math.floor(lastTimeTotal / 3600000);
        const minutes = Math.floor(lastTimeTotal / 60000) % 60;
        hoursLabel.textContent = hours.toLocaleString('en-US') + ' ' + (hours === 1 ? 'hour' : 'hours') + ' ' + minutes + ' ' + (minutes === 1 ? 'minute' : 'minutes') + ' played';
        hoursLabel.title = 'Total play time includes the starting total plus active time in single matches and tournament rounds. Pauses, menus, and hidden tabs add no time.';
      }
    for (const item of [label,completedLabel,hoursLabel]) item?.removeAttribute?.('data-loading');
  }
  try {
    const cached=JSON.parse(localStorage.getItem(cacheKey));
    if(cached && Date.now()-cached.savedAt<86400000 && ['total','completedTotal','playMilliseconds'].every(key=>Number.isSafeInteger(cached[key])&&cached[key]>=0)) showTotals(cached);
  } catch {}
  async function refresh() {
    // Reporting continues for analytics even when no public counters are shown.
    if (!label && !completedLabel && !hoursLabel) return;
    try {
      const response=await fetch('/api/games-played',{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Count unavailable');
      const data=await response.json();
      showTotals(data);
      try {localStorage.setItem(cacheKey,JSON.stringify({...data,savedAt:Date.now()}));} catch {}
    } catch {
      for(const item of [label,completedLabel,hoursLabel])item?.removeAttribute?.('data-loading');
      if(label&&lastTotal<0)label.textContent='Games played worldwide: unavailable';
      if(completedLabel&&lastCompletedTotal<0)completedLabel.textContent='Completed matches: unavailable';
      if(hoursLabel&&lastTimeTotal<0)hoursLabel.textContent='Hours played: unavailable';
    }
  }
  async function report(current, refreshAfter = false) {
    const milliseconds = Math.floor(current.milliseconds);
    current.lastReport = current.milliseconds;
    const body = JSON.stringify({id:current.id,mode:current.mode,playMilliseconds:milliseconds,completed:current.completed === true});
    // Cumulative reports stay safe when retried, duplicated, or received out of order.
    for (let attempt=0;attempt<2;attempt++) {
      try {
        const response = await fetch('/api/games-played',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true,signal:AbortSignal.timeout(5000)});
        if (response.ok) {
          current.saved = Math.max(current.saved,milliseconds);
          if (refreshAfter) await refresh();
          return;
        }
        if (response.status < 500) return;
      } catch {}
    }
  }
  function flush() {
    if (session && Math.floor(session.milliseconds) > session.saved) void report(session,true);
    lastFrame = null;
    wasActive = false;
  }
  window.TennisGamesPlayed = {
    start(mode) {
      this.stop();
      if (!['single','tournament'].includes(mode) || !crypto.randomUUID) return;
      session = {id:Date.now()+':'+crypto.randomUUID(),mode,milliseconds:0,saved:-1,lastReport:0};
      void report(session,true);
    },
    tick(now, active) {
      active = active && !document.hidden;
      if (session && active && wasActive && lastFrame !== null) {
        const elapsed = now - lastFrame;
        // Do not include a suspended browser or a sleeping device.
        if (elapsed > 0 && elapsed <= 1000) session.milliseconds += elapsed;
        if (session.milliseconds - session.lastReport >= 30000) void report(session);
      }
      if (!active && wasActive) flush();
      lastFrame = now;
      wasActive = active;
    },
    complete() {
      if (!session) return;
      const finished = session;
      session = null;
      lastFrame = null;
      wasActive = false;
      finished.completed = true;
      // Always send completion, even when the final time was already saved.
      void report(finished,true);
    },
    stop() { flush(); session = null; }
  };
  void refresh();
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden) flush();
    else void refresh();
  });
  window.addEventListener('pagehide',flush);
})();
