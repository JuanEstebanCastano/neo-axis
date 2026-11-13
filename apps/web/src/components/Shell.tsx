import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { Button } from "./ui";
import { LanguageSwitch, ThemeSwitch } from "./Prefs";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";
import type { TranslationKey } from "../i18n";

const NAV: { to: string; icon: IconName; label: TranslationKey }[] = [
  { to: "/", icon: "feed", label: "nav.feed" },
  { to: "/comunidad", icon: "hash", label: "nav.community" },
  { to: "/colecciones", icon: "collections", label: "nav.collections" },
  { to: "/biblioteca", icon: "library", label: "nav.library" },
  { to: "/snippets", icon: "snippet", label: "nav.snippets" },
  { to: "/repositorios", icon: "repo", label: "nav.repos" },
  { to: "/descubrir", icon: "spark", label: "nav.discover" },
];

export function Shell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const initial = (name: string) => name.trim().slice(0, 1).toUpperCase() || "·";

  return (
    <div className="shell">
      {/* Primer elemento enfocable de la página. Sin él, llegar al contenido
          con el teclado costaba pasar por la marca, las seis secciones, los
          dos conmutadores y el botón de sesión, en cada vista. */}
      <a href="#contenido" className="skip">
        {t("nav.skip")}
      </a>

      <aside className="sidebar">
        {user ? (
          <Link to="/perfil" className="brand brand--user" title={t("shell.myAccount")}>
            <span className="brand__av">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  width={42}
                  height={42}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="brand__ini">{initial(user.displayName || user.username)}</span>
              )}
            </span>
            <span className="brand__meta">
              <span className="brand__name">{user.displayName || user.username}</span>
              <span className="brand__sub">@{user.username}</span>
            </span>
          </Link>
        ) : (
          <Link to="/" className="brand">
            <span className="brand__mark" aria-hidden>
              N
            </span>
            <span className="brand__meta">
              <span className="brand__name">Neo Axis</span>
              <span className="brand__sub">{t("shell.brandSub")}</span>
            </span>
          </Link>
        )}

        <div className="sidebar__nav">
          <nav className="nav" aria-label={t("nav.label")}>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => `nav__item ${isActive ? "is-active" : ""}`}
              >
                <Icon name={item.icon} size={20} />
                <span className="nav__label">{t(item.label)}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar__foot">
          <div className="row row--sm">
            <ThemeSwitch />
            <LanguageSwitch />
          </div>
          {user ? (
            <Button variant="ghost" icon="logout" onClick={() => logout()}>
              {t("common.signOut")}
            </Button>
          ) : (
            <Button variant="accent" onClick={() => navigate("/auth")}>
              {t("common.signIn")}
            </Button>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          {/* Sólo visible en pantallas chicas, donde la columna lateral se
              vuelve barra inferior y su pie deja de estar a mano. */}
          <div className="topbar__util">
            <Link to="/" className="topbar__brand">
              <span className="brand__mark" aria-hidden>
                N
              </span>
              <span className="topbar__brand-name">Neo Axis</span>
            </Link>
            <div className="topbar__prefs">
              <LanguageSwitch />
              <ThemeSwitch />
              {user ? (
                <>
                  <Link to="/perfil" className="usertag usertag--compact" title={t("shell.viewProfile")}>
                    <span className="usertag__av">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" width={30} height={30} referrerPolicy="no-referrer" />
                      ) : (
                        <Icon name="user" size={16} />
                      )}
                    </span>
                    <span className="sr-only">{t("shell.viewProfile")}</span>
                  </Link>
                  <Button
                    variant="ghost"
                    icon="logout"
                    className="btn--icon"
                    aria-label={t("common.signOut")}
                    onClick={() => logout()}
                  />
                </>
              ) : (
                <Button variant="accent" onClick={() => navigate("/auth")}>
                  {t("common.signIn")}
                </Button>
              )}
            </div>
          </div>

          <div className="topbar__head">
            <div className="topbar__title">
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            {actions || user ? (
              <div className="topbar__actions">
                {actions}
                {user ? (
                  <Link to="/perfil" className="usertag" title={t("shell.viewProfile")}>
                    <span className="usertag__av">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" width={30} height={30} referrerPolicy="no-referrer" />
                      ) : (
                        <Icon name="user" size={16} />
                      )}
                    </span>
                    <span className="usertag__name">@{user.username}</span>
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        {/* tabIndex -1: el salto del teclado tiene que poder aterrizar acá,
            pero esto no es una parada más del recorrido con Tab. */}
        <div className="page" id="contenido" tabIndex={-1}>
          {children}
        </div>
      </main>
    </div>
  );
}
