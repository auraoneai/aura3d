/* Inspector / Properties — context for the current selection */
(function () {
  const Icon = window.Icon, fmt = window.fmtTime;

  function Field({ label, icon, value, mono, act, chev }) {
    return React.createElement('div', { className: 'field' + (act ? ' act' : '') },
      React.createElement('div', { className: 'fl' }, icon && React.createElement(Icon, { name: icon, size: 11 }), label),
      React.createElement('div', { className: 'fv' + (mono ? ' mono' : '') }, value,
        chev && React.createElement('span', { className: 'chev' }, React.createElement(Icon, { name: 'chevD', size: 13 }))),
    );
  }
  function Sec({ children }) { return React.createElement('div', { className: 'insp-sec' }, children, React.createElement('span', { className: 'ln' })); }

  function Inspector({ data, sel }) {
    const typeLabel = { shot: 'Shot', cast: 'Character', set: 'Set', prop: 'Prop' }[sel.type] || '—';
    let body = null;

    if (sel.type === 'shot') {
      const s = data.shots.find((x) => x.id === sel.id) || data.shots[0];
      const idx = data.shots.indexOf(s) + 1;
      const beats = data.beats.filter((b) => b.shot === s.id);
      body = React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'insp-hero', style: { backgroundImage: 'url(' + s.frame + ')' } },
          React.createElement('div', { className: 'ov' }),
          React.createElement('div', { className: 'tag' }, 'SHOT ' + String(idx).padStart(2, '0')),
          React.createElement('div', { className: 'cap' },
            React.createElement('div', { className: 'nm' }, s.name),
            React.createElement('div', { className: 'sub' }, s.cam)),
        ),
        React.createElement('div', { className: 'prop-grid' },
          React.createElement(Field, { label: 'Duration', icon: 'history', value: s.dur + 's', mono: true }),
          React.createElement(Field, { label: 'Lens', icon: 'camera', value: s.cam.split('·')[1] || s.cam, mono: true, act: true, chev: true }),
          React.createElement(Field, { label: 'In', value: fmt(s.start), mono: true }),
          React.createElement(Field, { label: 'Out', value: fmt(s.start + s.dur), mono: true }),
        ),
        React.createElement('div', { className: 'prop-grid one' },
          React.createElement(Field, { label: 'Framing', icon: 'frame', value: s.cam.split('·')[0], act: true, chev: true }),
        ),
        React.createElement(Sec, null, 'Cast in shot'),
        React.createElement('div', { className: 'castrow' },
          s.who.map((id) => { const c = data.cast.find((x) => x.id === id); return React.createElement('div', { key: id, className: 'castchip' },
            React.createElement('span', { className: 'd', style: { background: c.color } }, c.glyph), c.name); })),
        React.createElement(Sec, null, beats.length + ' beat' + (beats.length === 1 ? '' : 's')),
        React.createElement('div', { className: 'insp-note' }, beats.length ? '“' + cap(beats[0].text) + '”' : 'No dialogue beats yet — direct one from the console.'),
      );
    } else if (sel.type === 'cast') {
      const c = data.cast.find((x) => x.id === sel.id) || data.cast[0];
      const appears = data.shots.filter((s) => s.who.includes(c.id)).length;
      body = React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'insp-avatar', style: { background: 'linear-gradient(150deg,' + c.color + ',' + shade(c.color) + ')' } }, c.glyph),
        React.createElement('div', { className: 'insp-name' }, c.name),
        React.createElement('div', { className: 'insp-sub' }, c.kind),
        React.createElement('div', { className: 'prop-grid' },
          React.createElement(Field, { label: 'Lines', icon: 'mic', value: c.lines || 0, mono: true }),
          React.createElement(Field, { label: 'In shots', icon: 'film', value: appears, mono: true }),
          React.createElement(Field, { label: 'Accent', value: React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: 7 } }, React.createElement('span', { style: { width: 13, height: 13, borderRadius: 4, background: c.color } }), c.color), act: true }),
          React.createElement(Field, { label: 'Voice', icon: 'sound', value: 'aura-vox 3', act: true, chev: true }),
        ),
        React.createElement(Sec, null, 'Rig'),
        React.createElement('div', { className: 'prop-grid one' },
          React.createElement(Field, { label: 'Base pose', value: 'idle · floaty', act: true, chev: true }),
        ),
        React.createElement('div', { className: 'insp-note' }, c.name + ' is rigged and assignable to any beat. Type “cast” commands in the console to re-pose or re-cast.'),
      );
    } else {
      const list = sel.type === 'set' ? data.sets : data.props;
      const o = list.find((x) => x.id === sel.id) || list[0];
      body = React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'insp-avatar', style: { background: 'linear-gradient(150deg,#2b3350,#1a2032)', fontSize: 22 } },
          React.createElement(Icon, { name: o.icon, size: 26, style: { color: 'var(--acc)' } })),
        React.createElement('div', { className: 'insp-name' }, o.name),
        React.createElement('div', { className: 'insp-sub' }, typeLabel + ' · ' + o.meta),
        React.createElement('div', { className: 'prop-grid' },
          React.createElement(Field, { label: 'Type', value: o.meta, mono: true }),
          React.createElement(Field, { label: 'Visible', icon: 'eye', value: 'On' }),
          sel.type === 'set' && React.createElement(Field, { label: 'HDR', value: 'dusk', act: true, chev: true }),
          sel.type === 'set' && React.createElement(Field, { label: 'Bounce', value: '0.4', mono: true }),
        ),
        React.createElement('div', { className: 'insp-note' }, 'Linked into the working document. Re-light or swap from the console with “set …”.'),
      );
    }

    return React.createElement('section', { className: 'panel insp' },
      React.createElement('div', { className: 'panel-h' },
        React.createElement(Icon, { name: 'sliders', size: 15, style: { color: 'var(--tx-dim)' } }),
        React.createElement('span', { className: 'ttl' }, 'Inspector'),
        React.createElement('span', { className: 'sp' }),
        React.createElement('span', { style: { fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--acc)', background: 'rgba(123,123,255,.12)', border: '1px solid rgba(123,123,255,.25)', padding: '2px 7px', borderRadius: 6 } }, typeLabel),
      ),
      React.createElement('div', { className: 'insp-scroll' }, body),
    );
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r * 0.55); g = Math.round(g * 0.55); b = Math.round(b * 0.62);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  window.Inspector = Inspector;
})();
