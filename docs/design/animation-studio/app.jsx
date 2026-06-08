/* App shell — state, playback, render queue, composition */
(function () {
  const { useState, useEffect, useRef } = React;
  const { Topbar, Outliner, Timeline, Stage, Console, Icon } = window;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function App() {
    const base = window.STUDIO;
    const [data, setData] = useState(() => clone(base));
    const [sel, setSel] = useState({ type: 'shot', id: 'shot-2' });
    const [hidden, setHidden] = useState(() => new Set());
    const [time, setTime] = useState(() => {
      const s = parseFloat(localStorage.getItem('aura.time')); return isNaN(s) ? 16 : s;
    });
    const [playing, setPlaying] = useState(false);
    const [viewMode, setViewMode] = useState('Render');
    const [transcript, setTranscript] = useState(() => base.seed.map((t, i) => ({ ...t, id: 'seed' + i, state: t.type === 'cmd' ? (t.state || 'ok') : undefined, hash: t.type === 'cmd' ? (1234 + i).toString(16) : undefined })));
    const [rendering, setRendering] = useState(false);
    const [renderPct, setRenderPct] = useState(0);
    const [toast, setToast] = useState(null);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const consoleApi = useRef({});
    const raf = useRef(0);

    const DUR = data.DUR;
    const currentShot = data.shots.find((s) => time >= s.start && time < s.start + s.dur) || data.shots[data.shots.length - 1];

    // persist time
    useEffect(() => { localStorage.setItem('aura.time', time.toFixed(2)); }, [time]);

    // playback loop
    useEffect(() => {
      if (!playing) return;
      let last = performance.now();
      const tick = (now) => {
        const dt = (now - last) / 1000; last = now;
        setTime((t) => { const nt = t + dt; if (nt >= DUR) { setPlaying(false); return DUR; } return nt; });
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf.current);
    }, [playing, DUR]);

    // keyboard: space toggles play, ⌘K toggles palette
    useEffect(() => {
      const h = (e) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setPaletteOpen((o) => !o); return; }
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (e.code === 'Space' && tag !== 'TEXTAREA' && tag !== 'INPUT') { e.preventDefault(); setPlaying((p) => !p); }
      };
      window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
    }, []);

    const showToast = (msg, kind) => { setToast({ msg, kind }); setTimeout(() => setToast(null), 2600); };

    const selectShot = (id) => { const s = data.shots.find((x) => x.id === id); if (s) { setTime(s.start + 0.2); setSel({ type: 'shot', id }); } };
    const onSelect = (type, id) => { if (type === 'shot') selectShot(id); else setSel({ type, id }); };
    const stepShot = (dir) => {
      const i = data.shots.indexOf(currentShot);
      const ni = Math.max(0, Math.min(data.shots.length - 1, i + dir));
      selectShot(data.shots[ni].id);
    };
    const toggleVis = (id) => setHidden((h) => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const applyMutation = (fn) => setData((d) => { const nd = fn(d); return nd || d; });

    const doRender = (scope) => {
      if (rendering) return;
      const isShot = scope === 'shot';
      setRendering(true); setRenderPct(0); setPlaying(false);
      const started = performance.now(); const total = isShot ? 2200 : 3600;
      const step = () => {
        const p = Math.min(100, ((performance.now() - started) / total) * 100);
        setRenderPct(p);
        if (p < 100) requestAnimationFrame(step);
        else {
          setRendering(false);
          setTranscript((tr) => [...tr, { type: 'render', id: 'r' + Date.now(), frame: currentShot.frame,
            label: 'low-fi preview · ' + (isShot ? window.fmtTime(currentShot.dur) : window.fmtTime(DUR)),
            shot: isShot ? currentShot.name : 'Full sequence', meta: 'just now' }]);
          showToast(isShot ? 'Shot render complete · ' + currentShot.name : 'Render complete · full sequence', 'ok');
        }
      };
      requestAnimationFrame(step);
    };

    return React.createElement('div', { className: 'app' },
      React.createElement(Topbar, { scene: data.sets[0] ? 'Two Robots Argue' : '', onRender: () => doRender('sequence'), rendering, viewMode, setViewMode }),
      React.createElement('div', { className: 'body' },
        React.createElement('div', { className: 'col split' },
          React.createElement(Outliner, {
            data, sel, onSelect, hidden, onToggle: toggleVis,
            onOpenPalette: () => setPaletteOpen(true),
            onAddCast: () => { showToast('Tip: type “cast add <name>” in the console', 'tip'); },
          }),
          React.createElement(window.Inspector, { data, sel }),
        ),
        React.createElement('div', { className: 'col center' },
          React.createElement(Stage, { data, shot: currentShot, time, playing, onPlay: () => setPlaying((p) => !p), onScrub: setTime, onStep: stepShot, viewMode, rendering, renderPct }),
          React.createElement(Timeline, { data, time, onScrub: setTime, selShot: currentShot.id, onSelShot: selectShot, playing, onPlay: () => setPlaying((p) => !p) }),
        ),
        React.createElement('div', { className: 'col' }, React.createElement(Console, {
          data, transcript, setTranscript, applyMutation, selShot: currentShot.id, onRender: doRender, api: consoleApi,
        })),
      ),
      React.createElement(window.Palette, {
        open: paletteOpen, setOpen: setPaletteOpen, data, api: consoleApi,
        onJumpShot: selectShot, onSelectEntity: onSelect, onRender: doRender, onView: setViewMode,
      }),
      toast && React.createElement('div', { className: 'toast-wrap' },
        React.createElement('div', { className: 'toast' },
          React.createElement('span', { className: 'i', style: { color: toast.kind === 'ok' ? 'var(--ok)' : 'var(--acc)' } },
            React.createElement(Icon, { name: toast.kind === 'ok' ? 'check' : 'sparkles', size: 16 })),
          toast.msg)),
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();
