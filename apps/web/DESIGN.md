# Sistema de diseño — Neo Axis web

Mundo visual: **neumorfismo sobrio**. El relieve nace de dos sombras opuestas
sobre un fondo del mismo color que los elementos; el acento violeta hace los
trabajos reales (acción, estado activo, foco). Regla de oro: **el relieve va en
contenedores y controles; el texto siempre en alto contraste.**

## Hojas de estilo

| Archivo | Qué vive ahí |
|---|---|
| `tokens.css` | Todo valor que se repite: color, relieve, forma, ritmo, tipografía, movimiento. |
| `base.css` | Reset acotado y superficies que da el navegador (selección, caret, barras, foco). |
| `components.css` | Primitivas con componente propio en `src/components/ui.tsx`. |
| `layout.css` | Shell, navegación, encabezado y el juego cerrado de utilidades. |
| `pages.css` | Lo propio de una sola vista. Lo que aparece en dos, sube de capa. |

## Color

| Rol | Claro | Oscuro |
|---|---|---|
| Fondo / superficie | `#e8ebf2` | `#2a2d34` |
| Texto principal | `#272b33` | `#e9ebf1` |
| Texto secundario | `#4a5363` | `#a6adba` |
| Texto terciario / placeholder | `#5f6878` | `#8f98a8` |
| Acento | `#6441ef` | `#a78dff` |
| Acento sobre `--accent-soft` | `#5633d8` | `#c0aeff` |
| Error | `#b32639` | `#ef8191` |
| Éxito | `#1a6e50` | `#5fcfae` |
| Calificación | `#8a5e00` | `#e6b45a` |
| Sombra oscura | `rgba(156,165,184,.55)` | `rgba(0,0,0,.55)` |
| Sombra clara | `rgba(255,255,255,.95)` | `rgba(255,255,255,.06)` |

Estrategia: **Restrained** (gris + un acento). Tema por `data-theme` en `<html>`,
fijado antes de pintar y recordado en `localStorage`.

**Todo color que alguna vez lleva texto encima cumple 4.5:1 contra el fondo, en
los dos temas, medido.** Por eso el acento es el violeta profundo y no el
brillante: un acento que no puede llevar texto obliga a inventar un segundo
violeta para cada etiqueta. Los valores medidos están anotados en `tokens.css`.

## Relieve (presets)

- `--nm-raised` / `--nm-raised-sm`: elemento elevado (tarjetas, botones).
- `--nm-inset` / `--nm-inset-sm`: tallado hacia adentro (campos, estado activo).
- `--nm-flat`: relieve mínimo (badges, filas).

Toda sombra lleva desplazamiento **y** desenfoque (nunca halos planos). Un
separador es un surco (`.rule`), no un borde.

## Tipografía

- UI: **Manrope** (400–800). Display hasta ~30px, tracking `-0.02em`.
- Código / datos: **JetBrains Mono**.
- Jerarquía por peso y tamaño, no por color. Medida de lectura ≤ ~70 caracteres
  (`.measure`, y topes locales en párrafos y biografías). Un formulario corto
  va a `.narrow` (520px): estirado a los 1120px del contenido, obliga a barrer
  la pantalla de lado a lado para pasar de la etiqueta al campo.
- Las cifras de datos van tabulares, para que una columna no baile de ancho.

## Forma y ritmo

- Radios: tarjeta `20px`, control `14px`, chip `10px`, botón y carril `pill`.
- Espaciado por escala `--sp-1`…`--sp-9` (4 → 56). Nada de píxeles sueltos.
- Más aire arriba de los títulos que abajo.

## Interacción firma

Los controles **se hunden** al presionar (`:active` → sombra `inset`,
`translateY(1px)`, 130ms). El interruptor de tema desliza su perilla. Es el
único gesto "físico" del sistema; el resto es quieto.

## Movimiento

Un solo momento autoral: el contenido de cada página hace *fade-up* al montar
(`.page`, ease-out). Respeta `prefers-reduced-motion`.

## Superficies del navegador

Tematizadas desde la paleta: selección, caret, `accent-color`, barras de
desplazamiento, la flecha del `<select>`, el botón de `<input type=file>`, el
color de la barra del navegador móvil (`theme-color`) y el icono de la pestaña.

`theme-color` es **una sola etiqueta sin `media`**, que fija `prefs-init.js`
antes de pintar y actualiza `ThemeContext` al conmutar. Con dos etiquetas por
`prefers-color-scheme`, un teléfono en modo oscuro con la app en claro pintaba
la barra oscura contra una página clara: el tema lo elige la persona dentro de
la app, no el sistema operativo.

El `theme_color` de `site.webmanifest` lleva el mismo gris del arranque
(`#e8ebf2`), no el violeta del acento: en la app instalada, el manifiesto manda
sobre la etiqueta y la barra de título salía violeta mientras la página seguía
siendo gris. El `background_color` del arranque se queda en claro: el
manifiesto no entiende de temas y la pantalla de carga tiene que elegir uno.

El foco es un **contorno** (`outline`), no una sombra: así respeta el radio real
de cada control y no le borra el relieve al dibujarse encima.

La excepción son los campos de texto. Ahí el anillo va por dentro, en la misma
pila de sombras del relieve, y se dibuja con `:focus` y no con `:focus-visible`:
quien hace clic en un campo también necesita ver dónde quedó el cursor, y el
contorno de teclado no aparece al hacer clic.

## Componentes (`src/components/`)

`Surface` · `Button` (accent/soft/ghost, y `btn--row` para filas pulsables) ·
`Input`/`Textarea`/`Select`/`Field`/`FormFoot` · `Segmented` (radiogroup real) ·
`Badge` · `Stars` · `Spinner`/`Skeleton` · `EmptyState` · `Rule` · `Icon` (SVG
dibujados, trazo 1.9) · `Prefs` (tema + idioma) · `AuthLayout` · `Shell` ·
`ScrollToTop`.

En `FormFoot` el aviso va a la izquierda y la acción **siempre** a la derecha,
exista o no el aviso.

Mientras se espera algo que todavía no se puede pintar, va `.wait`
(`.wait--tall` en la tarjeta de autenticación): el indicador centrado y una
altura reservada, para que lo que llega no empuje la página de golpe.

## Estructura y respuesta al ancho

- **> 1100px**: barra lateral de 252px + contenido de 1120px centrado.
- **1100–861px**: barra lateral de 224px.
- **≤ 860px**: la lateral pasa a barra inferior fija (con `safe-area`), y el
  encabezado gana una fila de utilidades con marca, idioma, tema y sesión.
  Sin ella, en el teléfono no había forma de cerrar sesión ni de entrar.
- **≤ 520px**: las etiquetas de la barra inferior se van a los lectores de
  pantalla y queda el ícono; el nombre accesible no cambia.
- Alturas de pantalla en `dvh` con respaldo en `vh`.

Al cambiar de ruta el contenido vuelve arriba (`ScrollToTop`): el navegador no
lo hace solo en una SPA, y quien bajaba por el feed aterrizaba a media página
en la vista siguiente. El "atrás" queda exento, porque ahí lo que se espera es
volver al punto exacto donde se estaba.

## Idiomas

Español (base) e inglés, en `src/i18n/`. El inglés está **tipado contra el
español**: un texto sin traducir no compila. Fechas, horas y decimales salen del
idioma activo (`es-CO` / `en-US`). El idioma se fija antes de pintar, se recuerda
en `localStorage` y se refleja en `<html lang>`.

El idioma del navegador no se adivina: el español es el idioma base del producto
y el inglés se pide con el botón. El conmutador está en el pie de la barra
lateral, en la fila de utilidades del teléfono y dentro de la tarjeta de
autenticación (quien llega a ingresar tiene que poder cambiarlo antes de entrar).

## Accesibilidad

Texto de cuerpo ≥ 4.5:1 en ambos temas; foco visible con contorno; `aria-label`
en controles de ícono; grupos de opciones como `radiogroup` de verdad;
`prefers-reduced-motion`; objetivos táctiles ≥ 44px (los enlaces en línea dentro
de una frase quedan exentos, como permite WCAG 2.5.8).

La única excepción medida son las **migas de pan**, a 34px: una ruta honda son
seis o siete botones en el mismo renglón y a tamaño completo el camino tapaba
el contenido. Siguen por encima del mínimo de WCAG 2.5.8 y con separación
entre sí.

**Saltar al contenido.** El primer elemento enfocable de toda pantalla con
`Shell` es `.skip`, que lleva a `#contenido`. Sin él, llegar al contenido con
el teclado costaba pasar por la marca, las seis secciones, los dos
conmutadores y el botón de sesión, en cada vista.

**Una tarjeta pulsable no es un botón.** El clic sobre toda la tarjeta es una
comodidad del ratón; el control de verdad es un `<button>` propio dentro (el
"Leer más" del feed), y por ahí pasa el teclado. Envolverla en `role="button"`
aplastaba título, autor y cuerpo en un solo nombre accesible kilométrico y
dejaba ese contenido fuera del alcance del lector de pantalla. Si además la
tarjeta se puede seleccionar con el ratón, el clic se ignora cuando hay texto
seleccionado: copiar una cita no debe cerrarla.

**La ubicación actual no es un enlace.** En las migas de pan, la carpeta donde
estás va como texto con `aria-current="location"`, no como botón que navega
hacia sí mismo —y tampoco como botón deshabilitado, que se lee como "no
disponible" en vez de "estás acá".
