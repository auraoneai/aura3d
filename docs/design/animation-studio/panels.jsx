/* Top bar, Scene Outliner, Timeline */
(function () {
  const { useState, useRef } = React;
  const Icon = window.Icon, Logo = window.Logo;

  /* ----------------------------------------------------- Top bar */
  function Topbar({ scene, onRender, rendering, viewMode, setViewMode }) {
    return React.createElement('header', { className: 'top' },
      React.createElement('div', { className: 'brand' },
        React.createElement(Logo, { size: 30 }),
        React.createElement('div', null,
          React.createElement('div', { className: 'wm' }, 'Aura3D ', React.createElement('b', null, 'Studio')),
        ),
      ),
      React.createElement('div', { className: 'crumb' },
        React.createElement('span', { className: 'proj' }, 'Animations'),
        React.createElement('span', { className: 'sep' }, '/'),
        React.createElement('span', { className: 'scene' }, scene,
          React.createElement('span', { className: 'chev' }, React.createElement(Icon, { name: 'chevD', size: 14 }))),
        React.createElement('div', { className: 'save' },
          React.createElement('span', { className: 'dot' }), 'All changes saved'),
      ),
      React.createElement('div', { className: 'grow' }),
      React.createElement('div', { className: 'seg' },
        ['Render', 'Wireframe', 'Storyboard'].map((m) =>
          React.createElement('button', { key: m, className: viewMode === m ? 'on' : '', onClick: () => setViewMode(m) },
            React.createElement(Icon, { name: m === 'Render' ? 'film' : m === 'Wireframe' ? 'cube' : 'grid', size: 14 }), m))
      ),
      React.createElement('div', { className: 'grow' }),
      React.createElement('button', { className: 'btn icon btn-ghost', title: 'History' }, React.createElement(Icon, { name: 'history', size: 17 })),
      React.createElement('div', { className: 'avs' },
        [['#ff8a5b', 'You'], ['#4fc2ff', 'AR'], ['#9a7bff', 'JK']].map(([c, t], i) =>
          React.createElement('div', { key: i, className: 'av', style: { background: c }, title: t }, t[0]))),
      React.createElement('button', { className: 'btn' }, React.createElement(Icon, { name: 'share', size: 15 }), 'Share'),
      React.createElement('button', { className: 'btn btn-warm', onClick: onRender, disabled: rendering },
        React.createElement(Icon, { name: rendering ? 'render' : 'play2', size: 15, style: rendering ? { animation: 'sp 2s linear infinite' } : null }),
        rendering ? 'Rendering…' : 'Render'),
    );
  }

  /* ----------------------------------------------------- Outliner */
  function Row({ item, sel, onSelect, hidden, onToggle, accent, glyph, icon, meta }) {
    return React.createElement('div', { className: 'ol-item' + (sel ? ' sel' : ''), onClick: onSelect },
      glyph
        ? React.createElement('div', { className: 'av', style: { background: accent } }, glyph)
        : React.createElement('div', { className: 'ic' }, React.createElement(Icon, { name: icon, size: 13 })),
      React.createElement('span', { className: 'nm' }, item.name),
      meta && React.createElement('span', { className: 'meta' }, meta),
      React.createElement('button', {
        className: 'vis' + (hidden ? ' off' : ''), title: hidden ? 'Show' : 'Hide',
        onClick: (e) => { e.stopPropagation(); onToggle(); }
      }, React.createElement(Icon, { name: hidden ? 'eyeOff' : 'eye', size: 14 })),
    );
  }

  function Group({ title, count, children, onAdd }) {
    const [open, setOpen] = useState(true);
    return React.createElement('div', { className: 'ol-group' },
      React.createElement('div', { className: 'ol-gh' + (open ? '' : ' closed'), onClick: () => setOpen(!open) },
        React.createElement('span', { className: 'tw' }, React.createElement(Icon, { name: 'chevD', size: 13 })),
        title,
        React.createElement('span', { className: 'cnt' }, count),
        onAdd && React.createElement('button', { className: 'add', onClick: (e) => { e.stopPropagation(); onAdd(); } }, React.createElement(Icon, { name: 'plus', size: 13 })),
      ),
      open && React.createElement('div', null, children),
    );
  }

  function Outliner({ data, sel, onSelect, hidden, onToggle, onAddCast, onOpenPalette }) {
    return React.createElement('section', { className: 'panel col' },
      React.createElement('div', { className: 'ol-search', onClick: onOpenPalette, style: { cursor: 'text' } },
        React.createElement(Icon, { name: 'search', size: 14 }),
        React.createElement('input', { placeholder: 'Search scene…', readOnly: true, style: { cursor: 'text' } }),
        React.createElement('kbd', null, '⌘K'),
      ),
      React.createElement('div', { className: 'ol-scroll' },
        React.createElement(Group, { title: 'Shots', count: data.shots.length },
          data.shots.map((s) => React.createElement('div', { key: s.id, className: 'ol-item' + (sel.type === 'shot' && sel.id === s.id ? ' sel' : ''), onClick: () => onSelect('shot', s.id) },
            React.createElement('div', { className: 'ic', style: { background: s.color + '33', color: s.color } }, React.createElement(Icon, { name: 'film', size: 13 })),
            React.createElement('span', { className: 'nm' }, s.name),
            React.createElement('span', { className: 'meta' }, s.dur + 's'),
          ))),
        React.createElement(Group, { title: 'Cast', count: data.cast.length, onAdd: onAddCast },
          data.cast.map((c) => React.createElement(Row, {
            key: c.id, item: c, glyph: c.glyph, accent: c.color, meta: c.lines ? c.lines + ' lines' : '—',
            sel: sel.type === 'cast' && sel.id === c.id, onSelect: () => onSelect('cast', c.id),
            hidden: hidden.has(c.id), onToggle: () => onToggle(c.id),
          }))),
        React.createElement(Group, { title: 'Sets', count: data.sets.length },
          data.sets.map((s) => React.createElement(Row, {
            key: s.id, item: s, icon: s.icon, meta: s.meta,
            sel: sel.type === 'set' && sel.id === s.id, onSelect: () => onSelect('set', s.id),
            hidden: hidden.has(s.id), onToggle: () => onToggle(s.id),
          }))),
        React.createElement(Group, { title: 'Props', count: data.props.length },
          data.props.map((p) => React.createElement(Row, {
            key: p.id, item: p, icon: p.icon, meta: p.meta,
            sel: sel.type === 'prop' && sel.id === p.id, onSelect: () => onSelect('prop', p.id),
            hidden: hidden.has(p.id), onToggle: () => onToggle(p.id),
          }))),
      ),
    );
  }

  /* ----------------------------------------------------- Timeline */
  function Clip({ row, DUR, sel, onClick, accent, label }) {
    const left = (row.start / DUR) * 100;
    const width = (row.dur / DUR) * 100;
    return React.createElement('div', {
      className: 'clip' + (sel ? ' sel' : ''), onClick,
      style: { left: left + '%', width: 'calc(' + width + '% - 3px)', background: 'linear-gradient(180deg,' + accent + 'd9,' + accent + 'a6)' },
    },
      React.createElement('span', { className: 'gh' }),
      React.createElement('span', { className: 'clab' }, label),
      React.createElement('span', { className: 'gh r' }),
    );
  }

  function Timeline({ data, time, onScrub, selShot, onSelShot, playing, onPlay }) {
    const DUR = data.DUR;
    const [zoom, setZoom] = useState(1);
    const ref = useRef(null);
    const ticks = [];
    for (let t = 0; t <= DUR; t += 10) ticks.push(t);

    const scrubAt = (clientX) => {
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - r.left + el.scrollLeft) / (r.width * zoom)));
      onScrub(pct * DUR);
    };
    const onDown = (e) => {
      scrubAt(e.clientX);
      const mv = (ev) => scrubAt(ev.clientX);
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    };

    const charColor = (who) => (data.cast.find((c) => c.id === who) || {}).color || '#6b6bff';

    const tracks = [
      { name: 'Shots', icon: 'film', dot: '#6b6bff', rows: data.shots.map((s) => ({ ...s, label: s.name, accent: s.color, kind: 'shot' })) },
      { name: 'Dialogue', icon: 'mic', dot: '#ff8a5b', rows: data.beats.map((b) => ({ ...b, label: (data.cast.find((c) => c.id === b.who) || {}).name + ' · ' + (b.text.length > 22 ? b.text.slice(0, 22) + '…' : b.text), accent: charColor(b.who) })) },
      { name: 'Camera', icon: 'camera', dot: '#2dd4a7', rows: data.camera.map((c) => ({ ...c, label: c.text, accent: c.color })) },
      { name: 'FX', icon: 'zap', dot: '#ff6f4d', rows: data.fx.map((f) => ({ ...f, label: f.text, accent: f.color })) },
    ];

    return React.createElement('section', { className: 'panel tl' },
      React.createElement('div', { className: 'tl-h' },
        React.createElement(Icon, { name: 'layers', size: 15, style: { color: 'var(--tx-dim)' } }),
        React.createElement('span', { className: 'ttl' }, 'Timeline'),
        React.createElement('span', { style: { fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx-hi)', marginLeft: 2 } }, fmt(time)),
        React.createElement('div', { className: 'tl-zoom' },
          React.createElement('button', { className: 'hicon', onClick: () => setZoom(Math.max(1, zoom - 0.5)), title: 'Zoom out' }, React.createElement(Icon, { name: 'search', size: 14 }), ),
          React.createElement('span', { style: { fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx-faint)', minWidth: 30, textAlign: 'center' } }, zoom.toFixed(1) + '×'),
          React.createElement('button', { className: 'hicon', onClick: () => setZoom(Math.min(4, zoom + 0.5)), title: 'Zoom in' }, React.createElement(Icon, { name: 'plus', size: 14 })),
        ),
      ),
      React.createElement('div', { className: 'tl-body' },
        React.createElement('div', { className: 'tl-labels' },
          React.createElement('div', { className: 'tl-lab ruler' }, 'time'),
          tracks.map((t) => React.createElement('div', { key: t.name, className: 'tl-lab' },
            React.createElement('span', { className: 'dot', style: { background: t.dot } }),
            t.name)),
        ),
        React.createElement('div', { className: 'tl-tracks', ref: ref, onMouseDown: onDown },
          React.createElement('div', { className: 'tl-inner', style: { width: (zoom * 100) + '%' } },
            React.createElement('div', { className: 'tl-ruler' },
              ticks.map((t) => React.createElement('div', { key: t, className: 'tl-tick', style: { left: (t / DUR) * 100 + '%' } },
                React.createElement('span', null, fmt(t))))),
            tracks.map((t) => React.createElement('div', { key: t.name, className: 'tl-row' },
              t.rows.map((r) => React.createElement(Clip, {
                key: r.id, row: r, DUR, accent: r.accent, label: r.label,
                sel: t.name === 'Shots' && selShot === r.id,
                onClick: (e) => { e.stopPropagation(); if (t.name === 'Shots') onSelShot(r.id); },
              })))),
            React.createElement('div', { className: 'tl-playhead', style: { left: (time / DUR) * 100 + '%' } }),
          ),
        ),
      ),
    );
  }

  function fmt(s) {
    const m = Math.floor(s / 60); const ss = Math.floor(s % 60);
    return m + ':' + String(ss).padStart(2, '0');
  }

  window.Topbar = Topbar;
  window.Outliner = Outliner;
  window.Timeline = Timeline;
  window.fmtTime = fmt;
})();
