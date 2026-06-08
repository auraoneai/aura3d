/* Director Console (hero) — transcript + command engine + autocomplete */
(function () {
  const { useState, useRef, useEffect } = React;
  const Icon = window.Icon;

  /* ---- command grammar (for autocomplete) ---- */
  const VERBS = [
    { verb: 'set', tail: '<name> --hdr <mood>', desc: 'Define / re-light the active set' },
    { verb: 'cast add', tail: '<name>', desc: 'Cast a character into the scene' },
    { verb: 'cast remove', tail: '<name>', desc: 'Remove a character' },
    { verb: 'shot add', tail: '--after <id>', desc: 'Block a new shot' },
    { verb: 'shot retime', tail: '--id <id> --duration <s>', desc: 'Change a shot\u2019s duration' },
    { verb: 'cam', tail: '<wide|medium|close|orbit>', desc: 'Set the active shot camera' },
    { verb: 'light add', tail: '--type rim', desc: 'Add a light to the set' },
    { verb: 'fx add', tail: '<name>', desc: 'Add an effect to the timeline' },
    { verb: 'render', tail: '[--shot <id>]', desc: 'Render a low-fi preview' },
  ];

  const PALETTE = ['#3dd6c4', '#ffd166', '#ef6f9e', '#7ee081', '#c79bff', '#ff9f6b'];
  let castSeq = 0;

  /* ---- naive parser ---- */
  function parse(raw) {
    const t = raw.trim();
    const flags = {};
    const fre = /--([a-z]+)\s+("[^"]*"|\S+)/g; let m;
    while ((m = fre.exec(t))) flags[m[1]] = m[2].replace(/^"|"$/g, '');
    const head = t.replace(/--[a-z]+\s+("[^"]*"|\S+)/g, '').trim();
    const toks = head.split(/\s+/).filter(Boolean);
    let verb = toks[0] || '';
    let rest = toks.slice(1);
    if (['cast', 'shot', 'light', 'fx'].includes(verb) && rest[0]) { verb += ' ' + rest[0]; rest = rest.slice(1); }
    return { verb, rest, flags, raw: t, isCommand: VERBS.some((v) => t.startsWith(v.verb.split(' ')[0])) };
  }

  /* ---- executor: returns {ok, diffs, mutate, render, think} ---- */
  function execute(p) {
    const a = p.rest, f = p.flags;
    switch (p.verb) {
      case 'cast add': {
        const name = (f.name || a[0] || 'Extra').replace(/^\w/, (c) => c.toUpperCase());
        const color = PALETTE[castSeq++ % PALETTE.length];
        const id = name.toLowerCase() + '-' + Date.now().toString(36).slice(-3);
        return {
          ok: true, dur: '1.2s',
          think: 'Casting **' + name + '** into the scene and rigging a default idle pose. They\u2019ll appear in the Cast list and become assignable to beats.',
          diffs: [{ op: '+', k: 'add', t: 'cast <b>' + name + '</b> rigged' }, { op: '~', k: 'mod', t: 'outliner · Cast updated' }],
          mutate: (d) => ({ ...d, cast: [...d.cast, { id, name, kind: 'Robot · extra', color, glyph: name[0].toUpperCase(), lines: 0 }] }),
        };
      }
      case 'shot retime': {
        const id = f.id || a[0];
        const dur = parseInt(f.duration || a[1], 10);
        const target = id || 'shot-2';
        if (!dur) return { ok: false, think: 'I need a duration. Try `shot retime --id shot-2 --duration 30`.', diffs: [{ op: '!', k: 'del', t: 'missing <b>--duration</b>' }] };
        return {
          ok: true, dur: '0.9s',
          think: 'Retiming **' + target + '** to **' + dur + 's** and rippling the downstream shots so the cut stays clean.',
          diffs: [{ op: '~', k: 'mod', t: 'shot <b>' + target + '</b> \u2192 <b>' + dur + 's</b>' }, { op: '~', k: 'mod', t: 'downstream shots rippled' }],
          mutate: (d) => {
            const shots = d.shots.map((s) => ({ ...s }));
            const i = shots.findIndex((s) => s.id === target); if (i < 0) return d;
            shots[i].dur = dur; let cur = shots[i].start;
            for (let j = i; j < shots.length; j++) { shots[j].start = cur; cur += shots[j].dur; }
            return { ...d, shots };
          },
        };
      }
      case 'set': {
        const name = (f.name || p.rest.join(' ') || 'Station').trim();
        const mood = f.hdr || 'dusk';
        return {
          ok: true, dur: '0.8s',
          think: 'Re-lighting the active set as **' + name + '** with a **' + mood + '** HDR. Backdrop and ambient bounce are recomputed.',
          diffs: [{ op: '~', k: 'mod', t: 'set \u2192 <b>' + name + '</b> · ' + mood }],
          mutate: (d) => ({ ...d, sets: d.sets.map((s, i) => i === 0 ? { ...s, name: name.replace(/^\w/, c=>c.toUpperCase()), meta: mood + ' HDR' } : s) }),
        };
      }
      case 'cam': {
        const t = a[0] || 'medium';
        const map = { wide: 'wide · 24mm', medium: 'medium · 35mm', close: 'close · 50mm', orbit: 'orbit · 50mm' };
        return {
          ok: true, dur: '0.6s',
          think: 'Switching the active shot to a **' + t + '** framing.',
          diffs: [{ op: '~', k: 'mod', t: 'active shot camera \u2192 <b>' + (map[t] || t) + '</b>' }],
          mutate: (d, sel) => ({ ...d, shots: d.shots.map((s) => s.id === sel ? { ...s, cam: map[t] || t } : s) }),
        };
      }
      case 'fx add': {
        const name = f.name || a.join(' ') || 'glow';
        return {
          ok: true, dur: '0.9s',
          think: 'Adding a **' + name + '** effect to the FX track on the current beat.',
          diffs: [{ op: '+', k: 'add', t: 'fx <b>' + name + '</b> on FX track' }],
          mutate: (d) => ({ ...d, fx: [...d.fx, { id: 'fx-' + Date.now().toString(36).slice(-3), start: 30, dur: 8, text: name, color: '#ff6f4d' }] }),
        };
      }
      case 'render':
        return { ok: true, render: true, scope: (p.flags.shot ? 'shot' : 'sequence'), dur: '—', think: p.flags.shot ? 'Rendering a low-fi preview of the **current shot**.' : 'Kicking off a low-fi preview render of the **full sequence**.', diffs: [{ op: '~', k: 'mod', t: 'render queued · ' + (p.flags.shot ? 'shot' : 'sequence') }] };
      case 'shot add':
        return {
          ok: true, dur: '1.1s', think: 'Blocking a new shot after the current one.',
          diffs: [{ op: '+', k: 'add', t: 'shot <b>New Shot</b> blocked' }],
          mutate: (d) => { const last = d.shots[d.shots.length - 1]; return { ...d, shots: [...d.shots, { id: 'shot-' + (d.shots.length + 1), name: 'New Shot', start: last.start + last.dur, dur: 10, frame: d.FRAME.wide, cam: 'medium · 35mm', who: ['miko'], color: '#8b6bd6' }], DUR: d.DUR + 10 }; },
        };
      default:
        // natural-language director prompt → expand to a plausible commit
        return {
          ok: true, dur: '1.6s', expand: true,
          think: 'Interpreting your direction and expanding it into Scene-Tool calls against the working document.',
          diffs: [{ op: '~', k: 'mod', t: 'beats re-drafted for tone' }, { op: '~', k: 'mod', t: 'pacing nudged tighter' }],
        };
    }
  }

  function CmdCard({ turn }) {
    const tokens = (turn.verb + ' ' + (turn.args || '')).trim();
    return React.createElement('div', { className: 'cmd' },
      React.createElement('div', { className: 'cmd-top' },
        React.createElement('span', { className: 'pr' }, 'aura'),
        React.createElement('span', { style: { color: 'var(--tx-faint)' } }, '›'),
        React.createElement('span', { className: 'verb' }, turn.verb),
        React.createElement('span', { className: 'args', dangerouslySetInnerHTML: { __html: hi(turn.args || '') } }),
        turn.state === 'run'
          ? React.createElement('span', { className: 'cmd-st st-run' }, React.createElement('span', { className: 'spin' }), 'validating')
          : turn.state === 'bad'
            ? React.createElement('span', { className: 'cmd-st st-bad' }, React.createElement(Icon, { name: 'x', size: 11 }), 'rejected')
            : React.createElement('span', { className: 'cmd-st st-ok' }, React.createElement(Icon, { name: 'check', size: 11 }), 'committed'),
      ),
      turn.state !== 'run' && turn.diffs && React.createElement('div', { className: 'cmd-body' },
        turn.diffs.map((d, i) => React.createElement('div', { className: 'diff', key: i },
          React.createElement('span', { className: 'op ' + d.k }, d.op),
          React.createElement('span', { className: 'txt', dangerouslySetInnerHTML: { __html: d.t } })))),
      turn.state === 'ok' && React.createElement('div', { className: 'cmd-foot' },
        React.createElement(Icon, { name: 'history', size: 13 }), 'ran in ' + turn.dur,
        React.createElement('span', { className: 'commit' }, React.createElement(Icon, { name: 'check', size: 12 }), 'doc @ ' + turn.hash),
      ),
    );
  }

  function hi(s) {
    return s.replace(/("[^"]*")/g, '\u0001$1\u0002')
            .replace(/(--[a-z]+)/g, '<span class="flag">$1</span>')
            .replace(/\u0001([^\u0002]*)\u0002/g, '<span class="str">$1</span>');
  }

  function Console({ data, transcript, setTranscript, applyMutation, selShot, onRender, api }) {
    const [mode, setMode] = useState('Prompt');
    const [val, setVal] = useState('');
    const [focus, setFocus] = useState(false);
    const [acIdx, setAcIdx] = useState(0);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
      const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight;
    }, [transcript]);

    const suggestions = (() => {
      const q = val.trim().toLowerCase();
      if (!q) return VERBS.slice(0, 6);
      return VERBS.filter((v) => v.verb.startsWith(q.split(' ')[0]) || v.verb.includes(q));
    })();

    const push = (t) => setTranscript((p) => [...p, t]);
    const update = (id, patch) => setTranscript((p) => p.map((t) => t.id === id ? { ...t, ...patch } : t));

    const run = (text) => {
      const raw = text.trim(); if (!raw) return;
      push({ type: 'you', id: 'u' + Date.now(), text: raw });
      setVal('');
      const p = parse(raw);
      const res = execute(p);
      setTimeout(() => push({ type: 'dir', id: 'd' + Date.now(), think: res.think }), 360);
      const cmdId = 'c' + Date.now();
      const verb = res.expand ? pickVerb(raw) : p.verb;
      const args = res.expand ? '--scope sequence --tone snappy' : argStr(p);
      setTimeout(() => push({ type: 'cmd', id: cmdId, verb, args, state: 'run' }), 760);
      setTimeout(() => {
        if (res.render) { update(cmdId, { state: 'ok', diffs: res.diffs, dur: res.dur, hash: hash() }); onRender(res.scope || 'sequence'); return; }
        if (!res.ok) { update(cmdId, { state: 'bad', diffs: res.diffs }); return; }
        update(cmdId, { state: 'ok', diffs: res.diffs, dur: res.dur, hash: hash() });
        if (res.mutate) applyMutation((d) => res.mutate(d, selShot));
      }, 1750);
    };

    useEffect(() => { if (api) api.current.run = run; });

    const onKey = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(val); setAcIdx(0); return; }
      if (focus && suggestions.length) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setAcIdx((i) => Math.min(suggestions.length - 1, i + 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setAcIdx((i) => Math.max(0, i - 1)); }
        if (e.key === 'Tab') { e.preventDefault(); const s = suggestions[acIdx]; setVal(s.verb + ' '); inputRef.current && inputRef.current.focus(); }
      }
    };

    const showAc = focus && mode === 'Command' && suggestions.length > 0;

    return React.createElement('section', { className: 'panel col console' },
      React.createElement('div', { className: 'cns-h' },
        React.createElement('div', { className: 'cns-orb' }, React.createElement(Icon, { name: 'sparkles', size: 15, style: { color: '#fff' } })),
        React.createElement('div', { className: 'meta' },
          React.createElement('div', { className: 'nm' }, 'Director Console'),
          React.createElement('div', { className: 'sub' }, React.createElement('span', { className: 'd' }), 'aura-agent · scene-tool v8 · live')),
        React.createElement('button', { className: 'hicon', title: 'Command reference' }, React.createElement(Icon, { name: 'history', size: 16 })),
        React.createElement('button', { className: 'hicon', title: 'Settings' }, React.createElement(Icon, { name: 'settings', size: 16 })),
      ),
      React.createElement('div', { className: 'cns-scroll', ref: scrollRef },
        transcript.map((t) => React.createElement(Turn, { key: t.id, turn: t, data })),
      ),
      React.createElement('div', { className: 'composer' },
        React.createElement('div', { className: 'chips' },
          ['cast add Pip', 'shot retime --id shot-2 --duration 30', 'cam orbit', 'fx add rim light'].map((c) =>
            React.createElement('button', { key: c, className: 'chip', onClick: () => { setVal(c); setMode('Command'); inputRef.current && inputRef.current.focus(); } },
              React.createElement('span', { className: 'pr' }, '›'), c.length > 22 ? c.slice(0, 22) + '…' : c))),
        React.createElement('div', { className: 'cbox' + (focus ? ' focus' : '') },
          showAc && React.createElement('div', { className: 'ac' },
            React.createElement('div', { className: 'ac-h' }, 'Scene-Tool commands'),
            suggestions.map((s, i) => React.createElement('div', {
              key: s.verb, className: 'ac-item' + (i === acIdx ? ' on' : ''), onMouseEnter: () => setAcIdx(i),
              onMouseDown: (e) => { e.preventDefault(); setVal(s.verb + ' '); inputRef.current && inputRef.current.focus(); },
            },
              React.createElement('span', { className: 'verb' }, s.verb, ' ', React.createElement('span', { className: 'fl' }, s.tail)),
              React.createElement('span', { className: 'desc' }, s.desc),
              i === acIdx && React.createElement('kbd', null, 'tab'))),
          ),
          React.createElement('div', { className: 'cmode' },
            React.createElement('div', { className: 'seg' },
              ['Prompt', 'Command'].map((m) => React.createElement('button', { key: m, className: mode === m ? 'on' : '', onClick: () => setMode(m) },
                React.createElement(Icon, { name: m === 'Prompt' ? 'wand' : 'bolt', size: 12 }), m))),
            React.createElement('span', { className: 'hint' }, mode === 'Prompt' ? 'plain English' : 'on working doc'),
          ),
          React.createElement('textarea', {
            ref: inputRef, className: 'cinput' + (mode === 'Command' ? ' mono' : ''), rows: 1, value: val,
            placeholder: mode === 'Prompt' ? 'Direct the scene — e.g. “make Luma\u2019s reply angrier and cut to a close-up”' : 'set space · cast add robot --name Pip · shot retime …',
            onChange: (e) => { setVal(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px'; },
            onFocus: () => setFocus(true), onBlur: () => setTimeout(() => setFocus(false), 120), onKeyDown: onKey,
          }),
          React.createElement('div', { className: 'cbar' },
            React.createElement('button', { className: 'tool', title: 'Attach reference' }, React.createElement(Icon, { name: 'image', size: 15 })),
            React.createElement('button', { className: 'tool', title: 'Voice' }, React.createElement(Icon, { name: 'mic', size: 15 })),
            React.createElement('button', { className: 'tool', title: 'Insert object' }, React.createElement(Icon, { name: 'cube', size: 15 })),
            React.createElement('div', { className: 'sp' }),
            React.createElement('button', { className: 'btn btn-warm', style: { height: 30 }, onClick: () => run('render --shot ' + selShot), title: 'Render current shot' }, React.createElement(Icon, { name: 'play2', size: 14 }), 'Render shot'),
            React.createElement('button', { className: 'send', disabled: !val.trim(), onClick: () => run(val) }, React.createElement(Icon, { name: 'send', size: 16 })),
          ),
        ),
      ),
    );
  }

  function Turn({ turn, data }) {
    if (turn.type === 'you') return React.createElement('div', { className: 'turn you' }, React.createElement('div', { className: 'bub' }, turn.text));
    if (turn.type === 'dir') return React.createElement('div', { className: 'turn dir' },
      React.createElement('div', { className: 'lbl' }, React.createElement('span', { className: 'mk' }, React.createElement(Icon, { name: 'sparkles', size: 10, style: { color: '#fff' } })), 'Aura'),
      React.createElement('div', { className: 'think', dangerouslySetInnerHTML: { __html: bold(turn.think) } }));
    if (turn.type === 'cmd') return React.createElement('div', { className: 'turn dir' }, React.createElement(CmdCard, { turn }));
    if (turn.type === 'render') return React.createElement('div', { className: 'turn dir' },
      React.createElement('div', { className: 'rcard' },
        React.createElement('div', { className: 'thumb', style: { backgroundImage: 'url(' + turn.frame + ')' } },
          React.createElement('div', { className: 'badge' }, turn.label),
          React.createElement('div', { className: 'play' }, React.createElement('div', { className: 'pb' }, React.createElement(Icon, { name: 'play', size: 16 })))),
        React.createElement('div', { className: 'rmeta' }, React.createElement(Icon, { name: 'film', size: 13 }), React.createElement('b', null, turn.shot), '· ' + turn.meta,
          React.createElement('span', { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
            React.createElement(Icon, { name: 'download', size: 14, style: { color: 'var(--tx-faint)' } }),
            React.createElement(Icon, { name: 'share', size: 14, style: { color: 'var(--tx-faint)' } }))),
      ));
    return null;
  }

  function bold(s) { return (s || '').replace(/\*\*([^*]+)\*\*/g, '<span class="hl">$1</span>'); }
  function hash() { return (Math.random().toString(16).slice(2, 8)); }
  function argStr(p) { let s = p.rest.join(' '); for (const k in p.flags) s += ' --' + k + ' ' + (/\s/.test(p.flags[k]) ? '"' + p.flags[k] + '"' : p.flags[k]); return s.trim(); }
  function pickVerb(raw) {
    const r = raw.toLowerCase();
    if (r.includes('close') || r.includes('cut')) return 'cam';
    if (r.includes('angr') || r.includes('line') || r.includes('say')) return 'beat retext';
    if (r.includes('light') || r.includes('mood')) return 'light add';
    return 'sequence revise';
  }

  window.Console = Console;
})();
