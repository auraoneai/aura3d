/* Scene Outliner — collapsible Shots / Cast / Sets / Props with counts + visibility. */
import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import type { CastMember, CastSource, EpisodeDocument, PropEntity, Selection, SelectionType, SetEntity } from "../state/types";
import { fidelityLabel, type CharacterFidelity } from "../state/fidelity";

interface RowProps {
  name: string;
  sel: boolean;
  onSelect: () => void;
  hidden: boolean;
  onToggle: () => void;
  meta?: string;
  accent?: string;
  glyph?: string;
  icon?: string;
  /** Provenance badge (Phase E3): authored-fallback vs catalog-resolved vs user-uploaded. */
  source?: CastSource;
  sourceLabel?: string;
  /** M7 — fidelity tier badge (A/B/C); C renders as "Previz". */
  fidelity?: CharacterFidelity;
}

/** Short, honest badge text + class per cast provenance class (E3). */
const SOURCE_BADGE: Record<CastSource, { text: string; cls: string }> = {
  "authored-fallback": { text: "fallback", cls: "src-fallback" },
  "catalog-resolved": { text: "catalog", cls: "src-catalog" },
  "user-uploaded": { text: "uploaded", cls: "src-uploaded" }
};

function Row({ name, sel, onSelect, hidden, onToggle, meta, accent, glyph, icon, source, sourceLabel, fidelity }: RowProps) {
  const badge = source ? SOURCE_BADGE[source] : undefined;
  return (
    <div className={"ol-item" + (sel ? " sel" : "")} onClick={onSelect}>
      {glyph ? (
        <div className="av" style={{ background: accent }}>
          {glyph}
        </div>
      ) : (
        <div className="ic">
          <Icon name={icon || "cube"} size={13} />
        </div>
      )}
      <span className="nm">{name}</span>
      {fidelity && (
        <span
          className={"fid-badge fid-" + fidelity.grade.toLowerCase() + (fidelity.previz ? " fid-previz" : "")}
          title={fidelity.reason}
          data-grade={fidelity.grade}
          data-previz={fidelity.previz ? "true" : "false"}
        >
          {fidelity.previz ? "Previz" : fidelityLabel(fidelity.grade)}
        </span>
      )}
      {badge && (
        <span className={"src-badge " + badge.cls} title={sourceLabel ?? badge.text} data-source={source}>
          {badge.text}
        </span>
      )}
      {meta && <span className="meta">{meta}</span>}
      <button
        className={"vis" + (hidden ? " off" : "")}
        title={hidden ? "Show" : "Hide"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <Icon name={hidden ? "eyeOff" : "eye"} size={14} />
      </button>
    </div>
  );
}

function Group({
  title,
  count,
  children,
  onAdd
}: {
  title: string;
  count: number;
  children: ReactNode;
  onAdd?: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="ol-group">
      <div className={"ol-gh" + (open ? "" : " closed")} onClick={() => setOpen(!open)}>
        <span className="tw">
          <Icon name="chevD" size={13} />
        </span>
        {title}
        <span className="cnt">{count}</span>
        {onAdd && (
          <button
            className="add"
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
          >
            <Icon name="plus" size={13} />
          </button>
        )}
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

export interface OutlinerProps {
  data: EpisodeDocument;
  sel: Selection | null;
  onSelect: (type: SelectionType, id: string) => void;
  hidden: Set<string>;
  onToggle: (id: string) => void;
  onAddCast: () => void;
  onOpenPalette: () => void;
}

export function Outliner({ data, sel, onSelect, hidden, onToggle, onAddCast, onOpenPalette }: OutlinerProps) {
  return (
    <section className="panel col">
      <div className="ol-search" onClick={onOpenPalette} style={{ cursor: "text" }}>
        <Icon name="search" size={14} />
        <input placeholder="Search scene…" readOnly style={{ cursor: "text" }} />
        <kbd>⌘K</kbd>
      </div>
      <div className="ol-scroll">
        {/* M7 — scene fidelity tier. A grade-C scene is labeled "previz" and never sold as finished. */}
        <div
          className={"scene-fidelity fid-" + data.fidelity.grade.toLowerCase() + (data.fidelity.previz ? " fid-previz" : "")}
          title={data.fidelity.reason}
          data-grade={data.fidelity.grade}
          data-previz={data.fidelity.previz ? "true" : "false"}
        >
          <span className="fid-tier">{data.fidelity.previz ? "Previz" : fidelityLabel(data.fidelity.grade)}</span>
          <span className="fid-note">
            {data.fidelity.previz ? "preview-quality — not a finished render" : "scene fidelity"}
          </span>
        </div>
        <Group title="Shots" count={data.shots.length}>
          {data.shots.map((s) => (
            <div
              key={s.id}
              className={"ol-item" + (sel?.type === "shot" && sel.id === s.id ? " sel" : "")}
              onClick={() => onSelect("shot", s.id)}
            >
              <div className="ic" style={{ background: s.color + "33", color: s.color }}>
                <Icon name="film" size={13} />
              </div>
              <span className="nm">{s.name}</span>
              <span className="meta">{s.dur + "s"}</span>
            </div>
          ))}
        </Group>

        <Group title="Cast" count={data.cast.length} onAdd={onAddCast}>
          {data.cast.map((c: CastMember) => (
            <Row
              key={c.id}
              name={c.name}
              glyph={c.glyph}
              accent={c.color}
              meta={c.lines ? c.lines + " lines" : "—"}
              source={c.source}
              sourceLabel={c.sourceLabel}
              fidelity={c.fidelity}
              sel={sel?.type === "cast" && sel.id === c.id}
              onSelect={() => onSelect("cast", c.id)}
              hidden={hidden.has(c.id)}
              onToggle={() => onToggle(c.id)}
            />
          ))}
        </Group>

        <Group title="Sets" count={data.sets.length}>
          {data.sets.map((s: SetEntity) => (
            <Row
              key={s.id}
              name={s.name}
              icon={s.icon}
              meta={s.meta}
              sel={sel?.type === "set" && sel.id === s.id}
              onSelect={() => onSelect("set", s.id)}
              hidden={hidden.has(s.id)}
              onToggle={() => onToggle(s.id)}
            />
          ))}
        </Group>

        <Group title="Props" count={data.props.length}>
          {data.props.map((p: PropEntity) => (
            <Row
              key={p.id}
              name={p.name}
              icon={p.icon}
              meta={p.meta}
              sel={sel?.type === "prop" && sel.id === p.id}
              onSelect={() => onSelect("prop", p.id)}
              hidden={hidden.has(p.id)}
              onToggle={() => onToggle(p.id)}
            />
          ))}
        </Group>
      </div>
    </section>
  );
}
