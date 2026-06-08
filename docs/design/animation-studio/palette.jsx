/* Command palette (⌘K) — jump to shots/cast, run Scene-Tool commands, switch views */
(function () {
  const { useState, useEffect, useRef, useMemo } = React;
  const Icon = window.Icon, fmt = window.fmtTime;

  function Palette({ open, setOpen, data, api, onJumpShot, onSelectEntity, onRender, onView }) {
    const [q, setQ] = useState('');
    const [idx, setIdx] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);

    const items = useMemo(() => {
      const out = [];
      out.push({ g: 'Actions', nm: 'Render full sequence', ds: 'Low-fi preview of all shots', ic: 'play2', kw: 'render export preview', run: () => onRender('sequence') });
      out.push({ g: 'Actions', nm: 'Render current shot', ds: 'Preview just the active shot', ic: 'film', kw: 'render shot preview', run: () => onRender('shot') });
      ['Render', 'Wireframe', 'Storyboard'].forEach((m) => out.push({ g: 'Actions', nm: 'View: ' + m, ds: 'Switch viewport mode', ic: m === 'Render' ? 'film' : m === 'Wireframe' ? 'cube' : 'grid', kw: 'view mode ' + m, run: () => onView(m) }));
      data.shots.forEach((s, i) => out.push({ g: 'Go to shot', nm: s.name, ds: s.cam, ic: 'film', tag: fmt(s.start), kw: 'shot ' + s.name + ' ' + s.cam, run: () => onJumpShot(s.id) }));
      data.cast.forEach((c) => out.push({ g: 'Cast', av: c.color, glyph: c.glyph, nm: c.name, ds: c.kind, kw: 'cast character ' + c.name, run: () => onSelectEntity('cast', c.id) }));
      [
        ['cast add Pip', 'Cast a new character'],
        ['shot retime --id shot-2 --duration 30', 'Retime a shot + ripple'],
        ['cam orbit', 'Set active shot camera'],
        ['fx add rim light', 'Add an effect to the timeline'],
        ['set station --hdr dawn', 'Re-light the active set'],
        ['shot add --after shot-2', 'Block a new shot'],
      ].forEach(([cmd, ds]) => out.push({ g: 'Run command', nm: cmd, ds, mono: true, ic: 'bolt', kw: 'command ' + cmd, run: () => api.current && api.current.run && api.current.run(cmd) }));
      return out;
    }, [data]);

    const filtered = useMemo(() => {
      const s = q.trim().toLowerCase();
      if (!s) return items;
      return items.filter((it) => (it.nm + ' ' + (it.ds || '') + ' ' + (it.kw || '')).toLowerCase().includes(s));
    }, [q, items]);

    useEffect(() => { setIdx(0); }, [q]);
    useEffect(() => {
      const el = listRef.current; if (!el) return;
      const on = el.querySelector('.cmdk-item.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    }, [idx]);

    if (!open) return null;

    const exec = (it) => { if (!it) return; setOpen(false); setTimeout(() => it.run(), 10); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); exec(filtered[idx]); }
    };

    // group while keeping flat index
    let flat = -1; let lastG = null; const rows = [];
    filtered.forEach((it) => {
      if (it.g !== lastG) { rows.push({ grp: it.g, key: 'g' + it.g }); lastG = it.g; }
      flat++; const myIdx = flat;
      rows.push({ it, myIdx, key: it.g + it.nm });
    });

    return React.createElement('div', { className: 'cmdk-ov', onMouseDown: () => setOpen(false) },
      React.createElement('div', { className: 'cmdk', onMouseDown: (e) => e.stopPropagation() },
        React.createElement('div', { className: 'cmdk-in' },
          React.createElement('span', { className: 'si' }, React.createElement(Icon, { name: 'search', size: 18 })),
          React.createElement('input', { ref: inputRef, value: q, placeholder: 'Search shots, cast, commands…', onChange: (e) => setQ(e.target.value), onKeyDown: onKey }),
          React.createElement('span', { className: 'esc' }, 'ESC'),
        ),
        React.createElement('div', { className: 'cmdk-list', ref: listRef },
          filtered.length === 0
            ? React.createElement('div', { className: 'cmdk-empty' }, 'No matches for “' + q + '”')
            : rows.map((r) => r.grp
              ? React.createElement('div', { className: 'cmdk-grp', key: r.key }, r.grp)
              : React.createElement('div', {
                key: r.key, className: 'cmdk-item' + (r.myIdx === idx ? ' on' : ''),
                onMouseEnter: () => setIdx(r.myIdx), onClick: () => exec(r.it),
              },
                r.it.av
                  ? React.createElement('div', { className: 'av', style: { background: r.it.av } }, r.it.glyph)
                  : React.createElement('div', { className: 'ic' }, React.createElement(Icon, { name: r.it.ic, size: 15 })),
                React.createElement('div', { className: 'tx' },
                  React.createElement('div', { className: 'nm' }, r.it.nm),
                  r.it.ds && React.createElement('div', { className: 'ds' + (r.it.mono ? ' mono' : '') }, r.it.ds)),
                r.it.tag
                  ? React.createElement('span', { className: 'tag' }, r.it.tag)
                  : React.createElement('span', { className: 'ent' }, React.createElement(Icon, { name: 'send', size: 14 })),
              )),
        ),
        React.createElement('div', { className: 'cmdk-foot' },
          React.createElement('span', null, React.createElement('span', { className: 'kk' }, '↑↓'), 'navigate'),
          React.createElement('span', null, React.createElement('span', { className: 'kk' }, '↵'), 'run'),
          React.createElement('span', null, React.createElement('span', { className: 'kk' }, '⌘K'), 'toggle'),
        ),
      ),
    );
  }

  window.Palette = Palette;
})();
