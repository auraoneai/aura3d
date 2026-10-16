/* Input preferences. Physical input is isolated from gameplay while open. */
(() => {
  'use strict';
  const controls = window.TennisControls;
  const shell = document.querySelector('.game-shell');
  if (!controls || !shell) return;
  const clone = value => JSON.parse(JSON.stringify(value));
  const dialog = document.createElement('dialog');
  dialog.id = 'control-settings';
  dialog.className = 'control-settings';
  dialog.setAttribute('aria-labelledby', 'control-settings-title');
  dialog.setAttribute('aria-describedby', 'control-settings-description');
  dialog.innerHTML = `<header class="control-settings-header"><div><p class="control-settings-kicker">SETTINGS / CONTROLS</p><h2 id="control-settings-title">Controls</h2></div><button type="button" data-control-close aria-label="Close controls without applying changes">×</button></header>
    <p id="control-settings-description">Choose your mobile gameplay style or customize keyboard and controller buttons. Changes are saved on this browser.</p>
    <p id="control-settings-lock" class="control-settings-notice" hidden>Controls are locked during an online session. Leave the session to change them. The online match continues while this panel is open.</p>
    <div class="control-settings-tabs" role="group" aria-label="Input device"><button type="button" data-control-device="keyboard" aria-pressed="true">Keyboard</button><button type="button" data-control-device="controller" aria-pressed="false">Controller</button><button type="button" data-control-device="mobile" aria-pressed="false">Mobile</button></div>
    <p id="control-settings-device-help"></p><div id="control-settings-bindings" class="control-settings-bindings"></div>
    <div id="mobile-controls-settings" class="mobile-controls-settings" hidden><div class="mobile-controls-options" role="group" aria-label="Mobile gameplay style"><button type="button" data-mobile-style="classic" aria-pressed="true"><strong>Classic</strong><span>Move with the joystick and tap HIT to swing.</span></button><button type="button" data-mobile-style="swipe" aria-pressed="false"><strong>Swipe</strong><span>Your player moves automatically. Swipe toward the opponent to aim and hit.</span></button></div><p id="mobile-controls-availability" class="control-settings-note" role="status" aria-live="polite"></p></div>
    <p id="control-settings-reserved" class="control-settings-reserved"></p>
    <p id="control-settings-status" class="control-settings-status" role="status" aria-live="polite"></p>
    <footer class="control-settings-footer"><button type="button" id="control-settings-reset">Reset this device</button><div><button type="button" data-control-close>Cancel</button><button type="button" id="control-settings-apply" class="control-settings-apply">Apply changes</button></div></footer>`;
  shell.append(dialog);
  const $ = id => document.getElementById(id);
  let device = navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches ? 'mobile' : 'keyboard', drafts = null, capture = null, trigger = null, locked = false;
  let padIndex = null, padId = null, padButtons = [], padNeutral = false, padConnected = false, playStation = false;
  const swallowedKeys = new Set();
  const heldKeyboard = new Set();

  function status(message, error = false) {
    $('control-settings-status').textContent = message;
    $('control-settings-status').classList.toggle('is-error', error);
  }
  function inputLabel(input, target = device) {
    if (input == null) return 'Add alternate';
    return controls.labelInput(input, target, {playStation});
  }
  function focusBinding(action, slot) {
    dialog.querySelector(`[data-binding-action="${action}"][data-binding-slot="${slot}"]`)?.focus({preventScroll:true});
  }
  function currentDrafts() { return {keyboard:controls.getBindings('keyboard'), controller:controls.getBindings('controller'), mobile:mobileState().preferred}; }
  function mobileState() { return window.TennisLocal?.mobileControls?.() || {preferred:window.TennisSwipe?.getPreference() || 'classic',effective:'classic',pending:null,available:false,reason:'Swipe gameplay is unavailable in this game version.'}; }
  function renderMobile() {
    const mode=mobileState();
    dialog.querySelectorAll('[data-mobile-style]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.mobileStyle===drafts?.mobile));
      button.disabled=locked || !window.TennisSwipe || button.dataset.mobileStyle==='swipe'&&!mode.enabled;
    });
    const availability=!mode.enabled ? mode.reason : mode.pending
      ? `${mode.pending==='swipe'?'Swipe':'Classic'} starts at the next point. The current point keeps ${mode.effective==='swipe'?'Swipe':'Classic'} controls.`
      : mode.available ? shell.dataset.mode==='playing'
        ? `Currently using ${mode.effective==='swipe'?'Swipe':'Classic'}. Changes during a rally start at the next point.`
        : `${mode.preferred==='swipe'?'Swipe':'Classic'} is selected for your next Single Game or Practice session.`
      : `${mode.reason || 'Swipe is available in Single Game and Practice on a touch device.'} Your mobile preference is kept for supported matches.`;
    if($('mobile-controls-availability').textContent!==availability)$('mobile-controls-availability').textContent=availability;
  }
  function render() {
    locked = Boolean(window.TennisOnline?.active);
    $('control-settings-lock').hidden = !locked;
    dialog.querySelectorAll('[data-control-device]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.controlDevice === device)));
    $('mobile-controls-settings').hidden=device!=='mobile';
    $('control-settings-bindings').hidden=device==='mobile';
    $('control-settings-reserved').hidden=device==='mobile';
    if(device==='mobile'){
      $('control-settings-device-help').textContent=mobileState().enabled
        ? 'Swipe toward your target, then lift your finger to lock the shot. A longer upward swipe lands deeper; a faster swipe adds power. The flight arc shows your shot. Movement and contact timing are automatic.'
        : 'Move with the joystick and tap HIT to swing. Classic controls are active on mobile.';
      renderMobile();
      $('control-settings-reset').disabled=locked || !window.TennisSwipe;
      $('control-settings-apply').disabled=locked || !window.TennisSwipe;
      return;
    }
    $('control-settings-device-help').textContent = device === 'keyboard'
      ? 'Choose a primary key or an optional alternate, then press a key. Every action must keep its primary key. Escape cancels a capture.'
      : padConnected ? 'Choose an action, release all controller buttons and sticks, then press one button. Left stick and D-pad movement stay fixed. Escape cancels a capture.'
      : 'Connect a supported controller and press a controller button to enable changes. Left stick and D-pad movement stay fixed.';
    $('control-settings-reserved').textContent = device === 'keyboard'
      ? 'Fixed controls: P / Escape pause or open options, F fullscreen, R rematch after a match, and ~ / ` Busted Mode. Tab and Enter keep menu navigation. Browser shortcuts and key combinations cannot be assigned.'
      : 'Fixed controls: left stick / D-pad movement, Menu / Options pause, and system / share buttons. Remap face buttons, shoulders, triggers, or stick clicks. Use the mouse or keyboard to navigate settings.';
    const rows = $('control-settings-bindings');
    rows.replaceChildren();
    for (const action of controls.actions(device)) {
      const row = document.createElement('div'); row.className = 'control-settings-row';
      const copy = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = action.label;
      const detail = document.createElement('small'); detail.textContent = action.description;
      copy.append(name, detail); row.append(copy);
      const bindings = document.createElement('div'); bindings.className = 'control-settings-keys';
      const values = device === 'keyboard' ? drafts[device][action.id] : [drafts[device][action.id]];
      values.forEach((input, slot) => {
        const button = document.createElement('button'); button.type = 'button';
        button.dataset.bindingAction = action.id; button.dataset.bindingSlot = String(slot);
        button.disabled = locked || device === 'controller' && !padConnected;
        button.classList.toggle('is-capturing', capture?.action === action.id && capture.slot === slot);
        button.textContent = capture?.action === action.id && capture.slot === slot ? device === 'keyboard' ? 'Press a key…' : 'Press a button…' : input == null ? 'Add alternate' : `${inputLabel(input)} · Change`;
        button.setAttribute('aria-label', `${action.label}, ${device === 'keyboard' ? slot ? 'alternate' : 'primary' : 'button'}: ${inputLabel(input)}`);
        bindings.append(button);
        if (device === 'keyboard' && slot === 1 && input != null) {
          const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = '×';
          clear.dataset.clearBinding = action.id; clear.disabled = locked;
          clear.setAttribute('aria-label', `Remove alternate key for ${action.label}`); bindings.append(clear);
        }
      });
      row.append(bindings); rows.append(row);
    }
    $('control-settings-reset').disabled = locked || Boolean(capture);
    $('control-settings-apply').disabled = locked || Boolean(capture);
  }
  function cancelCapture(message = 'Capture cancelled. Your previous binding is unchanged.') {
    if (!capture) return;
    const previous = capture; capture = null; padNeutral = false;
    render(); status(message); focusBinding(previous.action, previous.slot);
  }
  function beginCapture(action, slot) {
    if (syncLock() || device === 'controller' && !padConnected) return;
    capture = {action, slot, keyboardReady:heldKeyboard.size === 0}; padNeutral = false;
    render(); focusBinding(action, slot);
    status(device === 'keyboard' ? capture.keyboardReady ? 'Press one key. Escape cancels.' : 'Release all held keys, then press one key. Escape cancels.' : 'Release all controller buttons and sticks, then press one button. Escape cancels.');
  }
  function assign(input) {
    if (syncLock() || !capture) return;
    const next = clone(drafts[device]);
    if (device === 'keyboard') next[capture.action][capture.slot] = input;
    else next[capture.action] = input;
    const result = controls.validateBindings(device, next);
    if (!result.valid) {
      // Validation owns acceptance; explain conflicts using the existing draft's
      // owner rather than whichever action happens to come first in its order.
      const owner = controls.actions(device).find(action => action.id !== capture.action && (device === 'keyboard' ? drafts[device][action.id].includes(input) : drafts[device][action.id] === input));
      status(owner ? `${inputLabel(input)} is already assigned to ${owner.label}. Choose another input.` : result.errors.map(error => error.message).join(' '), true);
      padNeutral = false;
      return;
    }
    const previous = capture;
    drafts[device] = next; capture = null; padNeutral = false;
    render(); status('Binding changed in your draft. Apply changes to use it.'); focusBinding(previous.action, previous.slot);
  }
  function open() {
    if (dialog.open) return;
    if (document.querySelector('dialog[open], .roster-overlay:not([hidden]), .appearance-overlay:not([hidden]), .tournament-draw-overlay:not([hidden]), #how-to-play:not([hidden])')) return;
    trigger = document.activeElement;
    if (window.TennisLocal?.openControlSettings?.() === false) return;
    drafts = currentDrafts();
    capture = null; padNeutral = false;
    render(); status(device === 'controller' && !padConnected ? 'Connect a standard controller and press a button to enable changes.' : ''); dialog.showModal();
    dialog.querySelector(`[data-control-device="${device}"]`).focus({preventScroll:true});
  }
  function close() {
    if (!dialog.open) return;
    capture = null; drafts = null; padNeutral = false;
    dialog.close(); window.TennisLocal?.clearInput?.();
    if (trigger?.isConnected && !trigger.closest('[hidden],[inert]')) trigger.focus({preventScroll:true});
  }
  function syncLock() {
    const next = Boolean(window.TennisOnline?.active);
    if (dialog.open && locked !== next) {
      capture = null; drafts = currentDrafts(); render();
      status(locked ? 'Your draft was discarded because an online session started.' : 'Controls can now be edited.');
    }
    return next;
  }
  function pollController(pad) {
    const connected = Boolean(pad?.connected && pad.mapping === 'standard');
    const nextIndex = connected ? pad.index : null;
    const nextId = connected ? pad.id : null;
    const buttons = connected ? pad.buttons.map(button => button.pressed || button.value > .5) : [];
    const nextPlayStation = connected && /054c|dualshock|dualsense|playstation|sony|wireless controller/i.test(pad.id) && !/xbox|xinput|045e/i.test(pad.id);
    const changed = padConnected !== connected || nextIndex !== padIndex || nextId !== padId || playStation !== nextPlayStation;
    padConnected = connected; playStation = nextPlayStation;
    if (nextIndex !== padIndex || nextId !== padId) {padIndex = nextIndex; padId = nextId; padNeutral = false; padButtons = buttons;}
    if (!dialog.open) {padButtons = buttons; return;}
    syncLock();
    if(device==='mobile')renderMobile();
    if (changed && device === 'controller') {
      if (!connected) capture = null;
      render();
      if (!capture) dialog.querySelector('[data-control-device="controller"]').focus({preventScroll:true});
      if (!connected) status('Controller disconnected. Connect a standard controller to change buttons.');
      else if (capture) status('Release all controller buttons and sticks before choosing a button.');
    }
    if (capture && device === 'controller' && !locked && connected) {
      const neutral = !buttons.some(Boolean) && !Array.from(pad.axes || []).some(value => Math.abs(value) > .18);
      if (!padNeutral) {if (neutral) {padNeutral = true; status('Press one controller button. Escape cancels.');}}
      else {
        const pressed = buttons.flatMap((down, index) => down && !padButtons[index] ? [index] : []);
        if (pressed.length > 1) {status('Press only one controller button at a time.', true); padNeutral = false;}
        else if (pressed.length === 1) assign(pressed[0]);
      }
    }
    padButtons = buttons;
  }
  function refreshLabels() {
    document.querySelectorAll('[data-control-label]').forEach(node => {
      const target = node.dataset.controlDevice || 'keyboard';
      node.textContent = controls.labelFor(node.dataset.controlLabel, target, {all:node.dataset.controlAll === 'true', playStation:node.dataset.controlFamily === 'playstation'});
    });
    const move = ['up','left','down','right'].map(action => controls.labelFor(action, 'keyboard', {all:true})).join(' · ');
    document.querySelectorAll('[data-control-movement]').forEach(node => {node.textContent = move;});
    document.querySelectorAll('[data-control-controller-help]').forEach(node => {
      const sony = node.dataset.controlControllerHelp === 'playstation';
      const label = action => controls.labelFor(action, 'controller', {playStation:sony});
      const title = document.createElement('strong'); title.textContent = sony ? 'PS4 controller: ' : 'Xbox controller: ';
      node.replaceChildren(title, document.createTextNode(`Left stick or D-pad: move and aim. ${label('hit')}: toss or hit; press twice quickly for power. Hold ${label('power')} and press ${label('hit')} for power. ${label('short')}: short shot. ${label('deep')}: deep shot. ${label('lob')}: prepare/cancel lob. ${sony ? 'Options' : 'Menu / Start'}: pause or online options.`));
    });
  }
  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-control-settings]')) open();
  });
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.hasAttribute('data-control-close')) {close(); return;}
    syncLock();
    if (button.dataset.controlDevice) {
      capture = null; device = button.dataset.controlDevice; render(); status(device === 'controller' && !padConnected ? 'Connect a standard controller and press a button to enable changes.' : ''); button.focus(); return;
    }
    if (syncLock()) return;
    if(button.dataset.mobileStyle && device==='mobile'){
      drafts.mobile=button.dataset.mobileStyle;render();status('Mobile style changed in your draft. Apply changes to use it.');button.focus();return;
    }
    if (button.dataset.bindingAction) {beginCapture(button.dataset.bindingAction, Number(button.dataset.bindingSlot)); return;}
    if (button.dataset.clearBinding && !locked) {
      drafts.keyboard[button.dataset.clearBinding][1] = null; render(); status('Alternate removed from your draft. Apply changes to use it.'); focusBinding(button.dataset.clearBinding, 1); return;
    }
    if (button.id === 'control-settings-reset' && !locked) {
      drafts[device] = device==='mobile'?'classic':controls.defaults(device); render(); status(device==='mobile'?'Classic controls are ready. Apply changes to use them.':'Default bindings are ready. Apply changes to use them.'); button.focus(); return;
    }
    if (button.id === 'control-settings-apply' && !locked) {
      if(device==='mobile'){
        const result=window.TennisLocal?.setMobileControlStyle?.(drafts.mobile) || window.TennisSwipe?.setPreference(drafts.mobile);
        if(!result?.ok){status('Mobile controls could not be applied. Please try again.',true);return;}
        drafts.mobile=mobileState().preferred;window.TennisLocal?.clearInput?.();render();
        status(result.saved?'Mobile preference saved on this browser.':'Mobile preference applied for this session. Browser storage is unavailable.',!result.saved);
        $('control-settings-apply').focus();return;
      }
      const result = controls.applyBindings(device, drafts[device]);
      if (!result.ok) {status(result.errors.map(error => error.message).join(' '), true); return;}
      drafts[device] = controls.getBindings(device); window.TennisLocal?.clearInput?.(); refreshLabels(); render();
      status(result.saved ? 'Controls applied and saved on this browser.' : 'Controls applied for this session, but could not be saved. Browser storage is unavailable; reloading will restore your previous saved controls.', !result.saved);
      $('control-settings-apply').focus();
    }
  });
  dialog.addEventListener('cancel', event => {event.preventDefault(); if (capture) cancelCapture(); else close();});
  // Physical state is tracked before the document capture handler consumes input.
  window.addEventListener('keydown', event => heldKeyboard.add(event.code || event.key), true);
  window.addEventListener('keyup', event => heldKeyboard.delete(event.code || event.key), true);
  document.addEventListener('keydown', event => {
    if (!dialog.open) return;
    swallowedKeys.add(event.code || event.key); event.stopImmediatePropagation();
    if (event.code === 'Escape') {event.preventDefault(); if (!event.repeat) {if (capture) cancelCapture(); else close();} return;}
    if (capture) {
      event.preventDefault();
      if (event.repeat || device !== 'keyboard') return;
      if (!capture.keyboardReady || heldKeyboard.size > 1) {capture.keyboardReady = false; status('Release all held keys, then press one key.', true); return;}
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.key === '`' || event.key === '~') {status('Browser shortcuts, key combinations, and Busted Mode keys cannot be assigned.', true); return;}
      assign(event.code); return;
    }
    if (event.code === 'Tab') {
      const buttons = [...dialog.querySelectorAll('button:not(:disabled)')].filter(button => !button.hidden);
      const first = buttons[0], last = buttons.at(-1), active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {event.preventDefault(); last.focus();}
      else if (!event.shiftKey && (active === last || !dialog.contains(active))) {event.preventDefault(); first.focus();}
    }
  }, true);
  document.addEventListener('keyup', event => {
    const key = event.code || event.key;
    if (dialog.open || swallowedKeys.has(key)) event.stopImmediatePropagation();
    swallowedKeys.delete(key);
    if (capture && device === 'keyboard' && !capture.keyboardReady && heldKeyboard.size === 0) {capture.keyboardReady = true; status('Press one key. Escape cancels.');}
  }, true);
  window.addEventListener('blur', () => {swallowedKeys.clear(); heldKeyboard.clear(); padNeutral = false; if (dialog.open && capture) cancelCapture('Capture cancelled because the game lost focus.');});
  controls.subscribe(refreshLabels);
  window.TennisControlSettings = {isOpen:() => dialog.open, pollController, open, close, refreshLabels};
  refreshLabels();
})();
