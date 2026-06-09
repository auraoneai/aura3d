/* Inspector / Properties — context panel for the current selection. */
import { Fragment, type ReactNode } from "react";
import { Icon } from "./Icon";
import { cap, fmt, shade } from "../state/util";
import type { EpisodeDocument, Selection } from "../state/types";

function Field({
  label,
  icon,
  value,
  mono,
  act,
  chev
}: {
  label: string;
  icon?: string;
  value: ReactNode;
  mono?: boolean;
  act?: boolean;
  chev?: boolean;
}) {
  return (
    <div className={"field" + (act ? " act" : "")}>
      <div className="fl">
        {icon && <Icon name={icon} size={11} />}
        {label}
      </div>
      <div className={"fv" + (mono ? " mono" : "")}>
        {value}
        {chev && (
          <span className="chev">
            <Icon name="chevD" size={13} />
          </span>
        )}
      </div>
    </div>
  );
}

function Sec({ children }: { children: ReactNode }) {
  return (
    <div className="insp-sec">
      {children}
      <span className="ln" />
    </div>
  );
}

export interface InspectorProps {
  data: EpisodeDocument;
  sel: Selection | null;
}

export function Inspector({ data, sel }: InspectorProps) {
  if (!sel) {
    return (
      <section className="panel insp">
        <div className="panel-h">
          <Icon name="sliders" size={15} style={{ color: "var(--tx-dim)" }} />
          <span className="ttl">Inspector</span>
        </div>
        <div className="insp-empty">
          <Icon name="sliders" size={26} style={{ color: "var(--tx-faint)", opacity: 0.6 }} />
          <div>Nothing selected.</div>
          <div>Select a shot, character, set, or prop — or describe a scene in the Director Console.</div>
        </div>
      </section>
    );
  }
  const typeLabel = ({ shot: "Shot", cast: "Character", set: "Set", prop: "Prop" } as Record<string, string>)[sel.type] || "—";
  let body: ReactNode = null;

  if (sel.type === "shot") {
    const s = data.shots.find((x) => x.id === sel.id) || data.shots[0];
    const idx = data.shots.indexOf(s) + 1;
    const beats = data.beats.filter((b) => b.shot === s.id);
    body = (
      <Fragment>
        <div className="insp-hero" style={{ backgroundImage: "url(" + s.frame + ")" }}>
          <div className="ov" />
          <div className="tag">{"SHOT " + String(idx).padStart(2, "0")}</div>
          <div className="cap">
            <div className="nm">{s.name}</div>
            <div className="sub">{s.cam}</div>
          </div>
        </div>
        <div className="prop-grid">
          <Field label="Duration" icon="history" value={s.dur + "s"} mono />
          <Field label="Lens" icon="camera" value={s.cam.split("·")[1] || s.cam} mono />
          <Field label="In" value={fmt(s.start)} mono />
          <Field label="Out" value={fmt(s.start + s.dur)} mono />
        </div>
        <div className="prop-grid one">
          <Field label="Framing" icon="frame" value={s.cam.split("·")[0]} />
        </div>
        <Sec>Cast in shot</Sec>
        <div className="castrow">
          {s.who.map((id) => {
            const c = data.cast.find((x) => x.id === id);
            if (!c) return null;
            return (
              <div key={id} className="castchip">
                <span className="d" style={{ background: c.color }}>
                  {c.glyph}
                </span>
                {c.name}
              </div>
            );
          })}
        </div>
        <Sec>{beats.length + " beat" + (beats.length === 1 ? "" : "s") + " · director plan"}</Sec>
        {beats.length ? (
          <div className="beat-plan">
            {beats.map((b) => {
              const speaker = data.cast.find((x) => x.id === b.who);
              const listener = data.cast.find((x) => x.id === b.listener);
              return (
                <div key={b.id} className="beat-row" data-testid="director-beat">
                  <div className="beat-line">“{cap(b.text)}”</div>
                  <div className="beat-intents">
                    <span className="beat-chip cam" title="camera framing">{b.camera}</span>
                    <span className="beat-chip spk" title="speaker action">
                      {(speaker?.name ?? b.who)} · {b.speakingIntent}
                    </span>
                    {b.listener && (
                      <span className="beat-chip lst" title="listener reaction">
                        {(listener?.name ?? b.listener)} · {b.listenerIntent}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="insp-note">No dialogue beats yet — direct one from the console.</div>
        )}
      </Fragment>
    );
  } else if (sel.type === "cast") {
    const c = data.cast.find((x) => x.id === sel.id) || data.cast[0];
    const appears = data.shots.filter((s) => s.who.includes(c.id)).length;
    body = (
      <Fragment>
        <div className="insp-avatar" style={{ background: "linear-gradient(150deg," + c.color + "," + shade(c.color) + ")" }}>
          {c.glyph}
        </div>
        <div className="insp-name">{c.name}</div>
        <div className="insp-sub">{c.kind}</div>
        <div className="prop-grid">
          <Field label="Lines" icon="mic" value={c.lines || 0} mono />
          <Field label="In shots" icon="film" value={appears} mono />
          <Field
            label="Accent"
            value={
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 13, height: 13, borderRadius: 4, background: c.color }} />
                {c.color}
              </span>
            }
          />
        </div>
        <div className="insp-note">
          {c.name + " is rigged and assignable to any beat. Type “cast” commands in the console to re-pose or re-cast."}
        </div>
      </Fragment>
    );
  } else {
    const list = sel.type === "set" ? data.sets : data.props;
    const o = list.find((x) => x.id === sel.id) || list[0];
    body = (
      <Fragment>
        <div className="insp-avatar" style={{ background: "linear-gradient(150deg,#2b3350,#1a2032)", fontSize: 22 }}>
          <Icon name={o.icon} size={26} style={{ color: "var(--acc)" }} />
        </div>
        <div className="insp-name">{o.name}</div>
        <div className="insp-sub">{typeLabel + " · " + o.meta}</div>
        <div className="prop-grid">
          <Field label="Type" value={o.meta} mono />
        </div>
        <div className="insp-note">Linked into the working document. Re-light or swap from the console with “set …”.</div>
      </Fragment>
    );
  }

  return (
    <section className="panel insp">
      <div className="panel-h">
        <Icon name="sliders" size={15} style={{ color: "var(--tx-dim)" }} />
        <span className="ttl">Inspector</span>
        <span className="sp" />
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--acc)",
            background: "rgba(123,123,255,.12)",
            border: "1px solid rgba(123,123,255,.25)",
            padding: "2px 7px",
            borderRadius: 6
          }}
        >
          {typeLabel}
        </span>
      </div>
      <div className="insp-scroll">{body}</div>
    </section>
  );
}
