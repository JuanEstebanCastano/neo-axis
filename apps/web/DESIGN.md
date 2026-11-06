# Sistema de diseño — Neo Axis web

Mundo visual: **neumorfismo sobrio**. El relieve nace de dos sombras opuestas
sobre un fondo del mismo color que los elementos; el acento violeta hace los
trabajos reales (acción, estado activo, foco). Regla de oro: **el relieve va en
contenedores y controles; el texto siempre en alto contraste.**

## Color (tokens en `src/styles/tokens.css`)

| Rol | Claro | Oscuro |
|---|---|---|
| Fondo / superficie | `#e8ebf2` | `#2a2d34` |
| Texto principal | `#272b33` | `#e9ebf1` |
| Texto secundario | `#5c6675` | `#a6adba` |
| Acento | `#7c5cff` | `#9d82ff` |
| Sombra oscura | `rgba(156,165,184,.55)` | `rgba(0,0,0,.55)` |
| Sombra clara | `rgba(255,255,255,.95)` | `rgba(255,255,255,.06)` |

Estrategia de color: **Restrained** (gris + un acento). Tema por `data-theme`
en `<html>`, fijado antes de pintar y recordado en `localStorage`.

## Relieve (presets)

- `--nm-raised` / `--nm-raised-sm`: elemento elevado (tarjetas, botones).
- `--nm-inset` / `--nm-inset-sm`: tallado hacia adentro (inputs, estado activo).
- `--nm-flat`: relieve mínimo (badges, filas).

Toda sombra lleva desplazamiento **y** desenfoque (nunca halos planos).

## Tipografía

- UI: **Manrope** (400–800). Display hasta ~30px, tracking `-0.02em`.
- Código / datos: **JetBrains Mono**.
- Medida de lectura y jerarquía por peso y tamaño, no por color.

## Forma y espaciado

- Radios: tarjeta `20px`, control `14px`, chip `10px`, botón `pill`.
- Ritmo con más aire arriba de los títulos que abajo.

## Interacción firma

Los controles **se hunden** al presionar (`:active` → sombra `inset`,
`translateY(1px)`, 130ms). El interruptor de tema desliza su perilla. Es el
único gesto "físico" del sistema; el resto es quieto.

## Movimiento

Un solo momento autoral: el contenido de cada página hace *fade-up* al montar
(`.page`, ease-out). Respeta `prefers-reduced-motion`.

## Superficies del navegador

Tematizadas desde la paleta: selección, caret, `accent-color`, scrollbar y anillo
de foco (`:focus-visible` con doble sombra + acento).

## Componentes (`src/components/`)

`Surface` (relieve/inset) · `Button` (accent/soft/ghost) · `Input`/`Textarea`/`Field`
· `Badge` · `Stars` · `Spinner`/`Skeleton` (shimmer) · `EmptyState` · `Icon`
(SVG dibujados, trazo 1.9) · `Shell` (sidebar + topbar; en móvil la nav pasa a
barra inferior).

## Accesibilidad

Texto body ≥ 4.5:1 en ambos temas; foco visible; `aria-label` en controles de
ícono; `prefers-reduced-motion`; objetivos táctiles ≥ 40px.
