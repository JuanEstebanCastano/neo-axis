import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { Button } from "./ui";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

const NAV: { to: string; icon: IconName; label: string }[] = [
  { to: "/", icon: "feed", label: "Feed" },
  { to: "/colecciones", icon: "collections", label: "Colecciones" },
  { to: "/biblioteca", icon: "library", label: "Biblioteca" },
  { to: "/snippets", icon: "snippet", label: "Snippets" },
  { to: "/descubrir", icon: "spark", label: "Descubrir" },
];

function ThemeSwitch() {
  const { theme, toggle } = useTheme();
  return (
    <button
      className="theme-switch"
      onClick={toggle}
      aria-label={`Cambiar a tema ${theme === "light" ? "oscuro" : "claro"}`}
    >
      <span className="theme-switch__knob">
        <Icon name={theme === "light" ? "sun" : "moon"} size={15} />
      </span>
    </button>
  );
}

export function Shell({
  title, subtitle, actions, children,
}: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark">N</span>
          <span>
            <span className="brand__name">Neo Axis</span>
            <br />
            <span className="brand__sub">libros + código</span>
          </span>
        </div>

        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => `nav__item ${isActive ? "is-active" : ""}`}>
              <Icon name={n.icon} size={20} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__foot">
          <ThemeSwitch />
          {user ? (
            <Button variant="ghost" icon="logout" onClick={() => logout()}>Salir</Button>
          ) : (
            <Button variant="accent" onClick={() => navigate("/auth")}>Ingresar</Button>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar__title">
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="topbar__actions">
            {actions}
            <span className="mobile-theme"><ThemeSwitch /></span>
            {user ? (
              <span className="usertag">
                <span className="usertag__av"><Icon name="user" size={16} /></span>
                <span className="usertag__name">@{user.username}</span>
              </span>
            ) : null}
          </div>
        </header>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
