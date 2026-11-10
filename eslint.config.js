/**
 * CONFIGURACIÓN DE ESLINT (formato "flat", el de ESLint 9)
 * ──────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 * Revisa el código buscando errores reales, no cuestiones de estilo: variables
 * que no se usan, `await` olvidados, comparaciones que nunca se cumplen.
 *
 * TENÉ EN CUENTA
 * Es un archivo, no una lista de carpetas: cada bloque del array se aplica a
 * los archivos que diga su `files`, y el último que toque un archivo gana.
 * No usamos las reglas que necesitan tipos (`recommendedTypeChecked`): son
 * varias veces más lentas y `pnpm typecheck` ya cubre esa parte.
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  // Lo que ni se mira: compilados, dependencias y tipos generados.
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.vite/**",
      "packages/db/src/schema.d.ts",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Backend y paquetes: corren en Node.
  {
    files: ["apps/api/**/*.ts", "apps/worker/**/*.ts", "packages/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  // Frontend: corre en el navegador. Incluye los sueltos de public/, como
  // theme-init.js, que no pasan por Vite.
  {
    files: ["apps/web/**/*.{ts,tsx}", "apps/web/public/**/*.js"],
    languageOptions: { globals: globals.browser },
  },

  // Scripts de operación: CommonJS corriendo en Node a mano.
  {
    files: ["**/*.cjs", "ops/**/*.js", "scripts/**/*.js"],
    languageOptions: { globals: globals.node, sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  // Ajustes propios del proyecto.
  {
    rules: {
      // Un argumento o variable que empieza con _ es "lo sé, no lo uso".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
