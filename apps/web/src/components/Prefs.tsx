/**
 * Los dos conmutadores de preferencia: tema e idioma.
 *
 * Viven juntos y fuera del Shell porque las pantallas de autenticación no
 * tienen Shell y también los necesitan: quien llega a iniciar sesión tiene
 * que poder cambiar el idioma antes de entrar, no después.
 */
import { Icon } from "./Icon";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/I18nContext";

export function ThemeSwitch() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="theme-switch"
      onClick={toggle}
      aria-label={t(theme === "light" ? "shell.toDark" : "shell.toLight")}
    >
      <span className="theme-switch__knob">
        <Icon name={theme === "light" ? "sun" : "moon"} size={15} />
      </span>
    </button>
  );
}

/**
 * Es un radiogroup y no un botón que alterna: con los dos idiomas a la
 * vista se ve cuál está activo y cuál está disponible sin tener que
 * tocarlo para averiguarlo.
 */
export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="seg seg--compact" role="radiogroup" aria-label={t("shell.language")}>
      <button
        type="button"
        role="radio"
        aria-checked={lang === "es"}
        className="seg__opt"
        onClick={() => setLang("es")}
        title={t("shell.langEsFull")}
      >
        {t("shell.langEs")}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={lang === "en"}
        className="seg__opt"
        onClick={() => setLang("en")}
        title={t("shell.langEnFull")}
      >
        {t("shell.langEn")}
      </button>
    </div>
  );
}
