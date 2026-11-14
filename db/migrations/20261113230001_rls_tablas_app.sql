-- migrate:up

-- ============================================================
-- Cerrar las tablas de app que nacieron sin RLS
-- ============================================================
-- Supabase trae un event trigger (ensure_rls) que enciende ROW LEVEL
-- SECURITY en cada tabla nueva, pero SÓLO en el schema `public`. Todo este
-- proyecto vive en `app`, así que cada tabla que crea dbmate nace con la
-- puerta entornada y nadie avisa. Ya pasó con app.github_connections, que se
-- arregló a mano; estas tres se quedaron atrás.
--
-- El patrón del proyecto es RLS encendido y CERO políticas: así la tabla
-- queda cerrada para cualquier rol que no sea su dueño, y la API —que conecta
-- como owner— sigue trabajando igual. No se agregan políticas acá porque
-- ninguna otra tabla del schema las tiene: el control de acceso está en la
-- API, y la base es la última reja, no la primera.
--
-- Por qué importa: sin RLS, un rol como anon o authenticated que alcance el
-- schema `app` lee la tabla entera. En password_reset_tokens eso es tomar
-- cuentas ajenas; en channels y post_attachments es ver secciones y adjuntos
-- sin pasar por la verificación de visibilidad.
--
-- ENABLE sobre una tabla que ya lo tiene no falla, así que esto es
-- idempotente y sirve igual si alguien lo encendió a mano antes.

ALTER TABLE IF EXISTS app.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.channels               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.post_attachments       ENABLE ROW LEVEL SECURITY;

-- migrate:down

ALTER TABLE IF EXISTS app.post_attachments       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.channels               DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.password_reset_tokens  DISABLE ROW LEVEL SECURITY;
