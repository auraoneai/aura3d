/* Stage viewport — render preview, HUD, title-safe guides, transport */
(function () {
  const { useState } = React;
  const Icon = window.Icon, fmt = window.fmtTime;

  function Stage({ data, shot, time, playing, onPlay, onScrub, onStep, viewMode, rendering, renderPct }) {
    const [guides, setGuides] = useState(false);
    const [cc, setCc] = useState(true);
    const DUR = data.DUR;
    const beat = data.beats.find((b) => time >= b.start && time < b.start + b.dur);
    const speaker = beat && data.cast.find((c) => c.id === beat.who);
    const beatPct = beat ? Math.max(0, Math.min(1, (time - beat.start) / beat.dur)) : 0;

    const scrubAt = (clientX, el) => {
      const r = el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      onScrub(pct * DUR);
    };
    const onDown = (e) => {
      const el = e.currentTarget;
      scrubAt(e.clientX, el);
      const mv = (ev) => scrubAt(ev.clientX, el);
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    };

    const filter = viewMode === 'Wireframe'
      ? 'saturate(0) contrast(1.3) brightness(1.1) invert(.06)'
      : 'none';

    if (viewMode === 'Storyboard') {
      return React.createElement('section', { className: 'panel stage' },
        React.createElement('div', { className: 'stage-canvas', style: { padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: '1fr', gap: 12, alignItems: 'stretch', justifyItems: 'stretch', background: '#070810' } },
          data.shots.map((s, i) => React.createElement('div', {
            key: s.id, style: {
              position: 'relative', borderRadius: 10, overflow: 'hidden',
              background: 'url(' + s.frame + ') center/cover', border: shot.id === s.id ? '2px solid var(--acc)' : '1px solid var(--line-2)',
            }
          },
            React.createElement('div', { style: { position: 'absolute', inset: 0, boxShadow: 'inset 0 0 60px rgba(0,0,0,.5)' } }),
            React.createElement('div', { className: 'hud-chip', style: { position: 'absolute', left: 10, top: 10 } },
              React.createElement('span', { className: 'k' }, 'SHOT ' + (i + 1)), React.createElement('span', { className: 'v' }, s.name)),
            React.createElement('div', { className: 'hud-chip', style: { position: 'absolute', right: 10, bottom: 10, fontSize: 9.5 } }, s.cam),
          )),
        ),
      );
    }

    return React.createElement('section', { className: 'panel stage' },
      React.createElement('div', { className: 'stage-canvas' },
        React.createElement('div', { className: 'stage-env' }),
        // HUD top-left
        React.createElement('div', { className: 'hud tl' },
          React.createElement('div', { className: 'hud-chip' },
            React.createElement('span', { className: 'live' }, React.createElement('span', { className: 'd' }), 'LIVE'),
            React.createElement('span', { className: 'k' }, '·'),
            React.createElement('span', { className: 'v' }, 'low-fi preview')),
          React.createElement('div', { className: 'hud-chip' },
            React.createElement('span', { className: 'k' }, 'SHOT'),
            React.createElement('span', { className: 'v' }, data.shots.indexOf(shot) + 1 + ' / ' + data.shots.length),
            React.createElement('span', { className: 'k' }, shot.name)),
        ),
        // HUD top-right
        React.createElement('div', { className: 'hud tr' },
          React.createElement('div', { className: 'hud-chip' }, React.createElement(Icon, { name: 'camera', size: 12 }), React.createElement('span', { className: 'v' }, shot.cam)),
          React.createElement('div', { className: 'hud-chip' }, React.createElement('span', { className: 'k' }, '1920×1080'), React.createElement('span', { className: 'v' }, '24fps')),
          React.createElement('div', { style: { display: 'flex', gap: 7 } },
            React.createElement('button', { className: 'hud-chip', onClick: () => setGuides(!guides), style: { color: guides ? 'var(--acc)' : 'var(--tx)' } },
              React.createElement(Icon, { name: 'frame', size: 12 }), 'Guides'),
            React.createElement('button', { className: 'hud-chip' }, React.createElement(Icon, { name: 'expand', size: 12 })),
          ),
        ),
        // centered render region
        React.createElement('div', { className: 'region-wrap' },
          React.createElement('div', { className: 'render-region' },
            React.createElement('div', { className: 'stage-frame', key: shot.id, style: { backgroundImage: 'url(' + shot.frame + ')', filter } }),
            React.createElement('div', { className: 'stage-vig' }),
            React.createElement('div', { className: 'stage-grain' }),
            guides && React.createElement('div', { className: 'guides' },
              React.createElement('div', { className: 'safe action' }),
              React.createElement('div', { className: 'safe title' }),
              React.createElement('div', { className: 'cross' }),
            ),
            React.createElement('span', { className: 'tick tl' }),
            React.createElement('span', { className: 'tick tr' }),
            React.createElement('span', { className: 'tick bl' }),
            React.createElement('span', { className: 'tick br' }),
            // live caption / subtitle
            cc && beat && speaker && React.createElement('div', { className: 'caption', key: beat.id },
              React.createElement('span', { className: 'who', style: { background: speaker.color } }, speaker.name),
              React.createElement('span', { className: 'ctext' }, cap(beat.text)),
              React.createElement('span', { className: 'bar' }, React.createElement('i', { style: { width: (beatPct * 100) + '%', background: speaker.color } })),
            ),
          ),
        ),
        rendering && React.createElement(RenderOverlay, { pct: renderPct }),
        // transport
        React.createElement('div', { className: 'transport' },
          React.createElement('button', { className: 'tp-btn', onClick: () => onStep(-1), title: 'Prev shot' }, React.createElement(Icon, { name: 'prev', size: 16 })),
          React.createElement('button', { className: 'tp-btn tp-play', onClick: onPlay }, React.createElement(Icon, { name: playing ? 'pause' : 'play', size: 16 })),
          React.createElement('button', { className: 'tp-btn', onClick: () => onStep(1), title: 'Next shot' }, React.createElement(Icon, { name: 'next', size: 16 })),
          React.createElement('div', { className: 'tp-time' }, React.createElement('b', null, fmt(time)), React.createElement('span', { className: 'sl' }, ' / ' + fmt(DUR))),
          React.createElement('div', { className: 'scrub', onMouseDown: onDown },
            React.createElement('div', { className: 'scrub-rail' },
              React.createElement('div', { className: 'scrub-buf', style: { width: '100%' } }),
              React.createElement('div', { className: 'scrub-fill', style: { width: (time / DUR) * 100 + '%' } }),
              React.createElement('div', { className: 'scrub-marks' },
                data.shots.map((s) => React.createElement('div', { key: s.id, className: 'scrub-mark', style: { left: (s.start / DUR) * 100 + '%', background: s.color } }))),
              React.createElement('div', { className: 'scrub-head', style: { left: (time / DUR) * 100 + '%' } }),
            )),
          React.createElement('button', { className: 'tp-pill' + (cc ? ' on' : ''), onClick: () => setCc(!cc), title: 'Captions' }, 'CC'),
          React.createElement('button', { className: 'tp-pill' }, '720p'),
          React.createElement('button', { className: 'tp-btn', title: 'Mute' }, React.createElement(Icon, { name: 'sound', size: 16 })),
        ),
      ),
    );
  }

  function RenderOverlay({ pct }) {
    const r = 32, c = 2 * Math.PI * r;
    return React.createElement('div', { className: 'render-ov' },
      React.createElement('div', { className: 'render-ring' },
        React.createElement('svg', { width: 74, height: 74 },
          React.createElement('circle', { cx: 37, cy: 37, r, fill: 'none', stroke: 'rgba(255,255,255,.12)', strokeWidth: 5 }),
          React.createElement('circle', { cx: 37, cy: 37, r, fill: 'none', stroke: 'var(--warm)', strokeWidth: 5, strokeLinecap: 'round', strokeDasharray: c, strokeDashoffset: c * (1 - pct / 100), style: { transition: 'stroke-dashoffset .25s' } }),
        ),
        React.createElement('div', { className: 'render-pct' }, Math.round(pct) + '%')),
      React.createElement('div', { style: { textAlign: 'center' } },
        React.createElement('div', { className: 'ttl' }, 'Rendering preview'),
        React.createElement('div', { className: 'sub' }, pct < 40 ? 'aura · rigging cast…' : pct < 75 ? 'aura · simulating lighting…' : 'aura · compositing frames…')),
    );
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  window.Stage = Stage;
})();
