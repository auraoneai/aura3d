/* Topbar — logo + version, breadcrumb, saved status, view toggle, share, Render. */
import { Icon, Logo } from "./Icon";
import type { ViewMode } from "../state/types";

const VIEW_MODES: ViewMode[] = ["Render", "Wireframe", "Storyboard"];

export interface TopbarProps {
  scene: string;
  onRender: () => void;
  rendering: boolean;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  saved: boolean;
}

export function Topbar({ scene, onRender, rendering, viewMode, setViewMode, saved }: TopbarProps) {
  return (
    <header className="top">
      <div className="brand">
        <Logo size={30} />
        <div>
          <div className="wm">
            Aura3D <b>Studio</b>
          </div>
        </div>
      </div>

      <div className="crumb">
        <span className="proj">Animations</span>
        <span className="sep">/</span>
        {/* No scene-switcher menu exists, so the dead down-chevron (which implied a
            dropdown) was removed — only the live scene name remains. */}
        <span className="scene">{scene}</span>
        <div className="save">
          <span className="dot" style={saved ? undefined : { background: "var(--warn)", boxShadow: "0 0 8px var(--warn)" }} />
          {saved ? "All changes saved" : "Saving…"}
        </div>
      </div>

      <div className="grow" />

      <div className="seg">
        {VIEW_MODES.map((m) => (
          <button key={m} className={viewMode === m ? "on" : ""} onClick={() => setViewMode(m)}>
            <Icon name={m === "Render" ? "film" : m === "Wireframe" ? "cube" : "grid"} size={14} />
            {m}
          </button>
        ))}
      </div>

      <div className="grow" />

      {/* Removed the dead History button, the FAKE collaborator avatars (no multi-user collab
          exists — they were pure decoration), and the dead Share button. Only real, wired controls
          remain: the view-mode toggle and Render. */}
      <button className="btn btn-warm" onClick={onRender} disabled={rendering}>
        <Icon
          name={rendering ? "render" : "play2"}
          size={15}
          style={rendering ? { animation: "sp 2s linear infinite" } : undefined}
        />
        {rendering ? "Rendering…" : "Render"}
      </button>
    </header>
  );
}
