/* In-page customization, with drafts scoped to the mode/account that opened it. */
(() => {
  'use strict';
  const appearance = window.TennisAppearance;
  const host = document.getElementById('appearance-entry');
  if (!appearance || !host) return;
  const storageKey = 'baseline.appearance.v1';
  let selected = appearance.defaults('player'), offlineSelection = null;
  try { selected = appearance.normalize(JSON.parse(localStorage.getItem(storageKey))); } catch {}
  let active = null, generation = 0, context = {};
  host.innerHTML = `<button type="button" id="customize-player"><span class="appearance-entry-copy"><small>Your player</small><strong>Customize</strong></span><span class="appearance-entry-colors" aria-hidden="true">${appearance.parts.map(part=>`<i data-look-part="${part}"></i>`).join('')}</span><span class="appearance-entry-action" aria-hidden="true">→</span></button><p id="appearance-tab-status" role="status" hidden></p>`;
  const status = host.querySelector('#appearance-tab-status');
  function updateEntry() {
    const colors = appearance.resolve(selected);
    for (const chip of host.querySelectorAll('[data-look-part]')) chip.style.backgroundColor = colors[chip.dataset.lookPart];
  }
  function apply(value) {
    selected = appearance.normalize(value);
    updateEntry();
    document.dispatchEvent(new CustomEvent('tennisappearancechange', {detail:{...selected}}));
  }
  function mode() {return document.getElementById('menu')?.dataset.selectedMode || 'single';}
  function builder() {return mode()==='online' ? window.TennisMultiplayerBuild : window.TennisOfflineBuild;}
  function nameInput() {return document.getElementById(mode()==='online' ? 'online-name' : 'player-name');}
  function open() {
    if (active && !active.tab.closed && active.generation===generation && active.mode===mode()) {active.tab.focus();return;}
    const token = window.TennisRandomId.randomUUID();
    const input = nameInput();
    const session = {token, generation, mode:mode(), custom:window.TennisPlayerSelect?.isCustom(), trigger:document.activeElement, context:{...context}, busy:false,
      draft:{appearance:{...selected},name:input?.value||'',nameReadOnly:!!input?.readOnly,ratings:builder()?.ratings(),requireFullBuild:!!context.onSave}};
    window.TennisLocal?.clearInput?.();
    if(active)closeEditor(active);
    const dialog=document.createElement('dialog');dialog.className='player-editor-dialog';dialog.setAttribute('aria-label','Customize your player');
    const frame=document.createElement('iframe');frame.title='Player customization';frame.dataset.editorToken=token;
    dialog.append(frame);document.body.append(dialog);
    session.dialog=dialog;session.tab=frame.contentWindow;active=session;status.hidden=true;
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(!session.busy)closeEditor(session);});
    dialog.showModal();frame.focus();
    // Load the existing studio as a document inside the game, without navigating a tab.
    fetch('/player-customization.html',{cache:'no-cache'}).then(response=>{
      if(!response.ok)throw new Error('Could not load customization. Please try again.');
      return response.text();
    }).then(html=>{
      if(active===session)frame.srcdoc=html.replace('Save & return','Save player');
    }).catch(error=>{
      if(active!==session)return;
      closeEditor(session);status.textContent=error.message||'Could not load customization. Please try again.';status.hidden=false;
    });
  }
  function closeEditor(session){
    session.dialog.close();session.dialog.remove();
    if(active===session){active=null;session.trigger?.focus?.({preventScroll:true});}
  }
  window.addEventListener('message', async event => {
    const session=active, message=event.data;
    if (!session || event.origin!==location.origin || event.source!==session.tab || message?.token!==session.token) return;
    const reply = (type,detail={}) => session.tab.postMessage({type,token:session.token,...detail},location.origin);
    if (message.type==='player-editor:ready') {reply('player-editor:init',{draft:session.draft});return;}
    if (message.type==='player-editor:cancel') {if(!session.busy)closeEditor(session);return;}
    if (message.type!=='player-editor:save'||session.busy)return;
    if (session.generation!==generation || session.mode!==mode() || session.custom!==window.TennisPlayerSelect?.isCustom() || window.TennisOnline?.active || window.TennisMenu?.debug().screen!=='setup') {
      reply('player-editor:error',{message:'Setup changed. Close the editor and reopen customization.'});return;
    }
    const look=appearance.validate(message.draft?.appearance), ratings=window.TennisRoster.validateCustom(message.draft?.ratings);
    const name=session.draft.nameReadOnly?session.draft.name:String(message.draft?.name||'').trim().replace(/\s+/g,' ').slice(0,20);
    if (!look || !ratings || !name) {reply('player-editor:error',{message:'Choose a name and valid player options.'});return;}
    session.busy=true;
    try {
      if (session.context.onSave) await session.context.onSave({appearance:look,ratings,name},{isCurrent:()=>active===session&&session.generation===generation&&!session.tab.closed});
      else {
        apply(look);builder()?.apply(ratings);
        const input=nameInput();if(input&&!input.readOnly){input.value=name;input.dispatchEvent(new Event('input',{bubbles:true}));}
        if (!offlineSelection) try {
          localStorage.setItem(storageKey,JSON.stringify(selected));
          localStorage.setItem(session.mode==='online'?'baseline.multiplayer-build.v1':'baseline.offline-build.v1',JSON.stringify(ratings));
          localStorage.setItem(session.mode==='online'?'baseline.nickname':'baseline.playerName',name);
        } catch {}
      }
      reply('player-editor:saved');if(active===session)closeEditor(session);
    } catch (error) {reply('player-editor:error',{message:error.message||'Could not save. Try again.'});}
    finally {session.busy=false;}
  });
  host.querySelector('#customize-player').addEventListener('click',open);
  window.TennisAppearanceSelect = {
    selection:()=>({...selected}),open,isOpen:()=>!!active&&!active.tab.closed,
    apply,configure(value={}){context=value;generation++;},
    beginAccount(value){if(!offlineSelection)offlineSelection={...selected};generation++;apply(value);},
    endAccount(){if(offlineSelection){const value=offlineSelection;offlineSelection=null;generation++;apply(value);}}
  };
  host.hidden=false;updateEntry();
})();
