-- migrate:up

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS app;

-- ============================================================
-- Common enums
-- ============================================================
CREATE TYPE app.user_status AS ENUM ('active', 'suspended', 'deactivated', 'deleted');
CREATE TYPE app.post_status AS ENUM ('published', 'deleted');
CREATE TYPE app.visibility AS ENUM ('community', 'restricted');
CREATE TYPE app.event_status AS ENUM ('scheduled', 'cancelled', 'completed');
CREATE TYPE app.event_location_type AS ENUM ('online', 'physical', 'hybrid');
CREATE TYPE app.event_access_mode AS ENUM ('community', 'roles', 'users');
CREATE TYPE app.video_source_type AS ENUM ('external', 'object_storage');
CREATE TYPE app.video_provider AS ENUM ('youtube', 'vimeo', 'twitch', 'other');
CREATE TYPE app.reaction_type AS ENUM ('like', 'love', 'insightful', 'useful');
CREATE TYPE app.report_status AS ENUM ('pending', 'reviewing', 'resolved', 'dismissed');
CREATE TYPE app.report_target_type AS ENUM ('post', 'comment');
CREATE TYPE app.notification_type AS ENUM (
  'comment',
  'comment_reply',
  'mention',
  'reaction',
  'follow',
  'event_update',
  'moderation'
);
CREATE TYPE app.email_delivery_status AS ENUM ('queued', 'sent', 'failed', 'cancelled');
CREATE TYPE app.identity_provider AS ENUM ('github', 'google', 'other');

-- ============================================================
-- Utility function / trigger: updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- Users / authentication / authorization
-- ============================================================
CREATE TABLE app.users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  username varchar(40) NOT NULL,
  display_name varchar(120) NOT NULL,
  email varchar(320) NOT NULL,
  status app.user_status NOT NULL DEFAULT 'active',
  avatar_url text,
  bio text,
  website_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT users_username_format_ck CHECK (username ~ '^[A-Za-z0-9_][A-Za-z0-9_-]{2,39}$'),
  CONSTRAINT users_email_nonempty_ck CHECK (length(trim(email)) > 0)
);

CREATE UNIQUE INDEX users_username_active_uq
  ON app.users (lower(username))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX users_email_active_uq
  ON app.users (lower(email))
  WHERE deleted_at IS NULL;

CREATE INDEX users_username_trgm_idx ON app.users USING gin (username gin_trgm_ops);

CREATE TABLE app.user_credentials (
  user_id uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE RESTRICT,
  password_hash text NOT NULL,
  password_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.user_identities (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  provider app.identity_provider NOT NULL,
  provider_subject text NOT NULL,
  profile jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE INDEX user_identities_user_idx ON app.user_identities(user_id);

CREATE TABLE app.roles (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  code varchar(50) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.permissions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  code varchar(100) NOT NULL UNIQUE,
  name varchar(150) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.user_roles (
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES app.roles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE app.role_permissions (
  role_id uuid NOT NULL REFERENCES app.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES app.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE app.auth_sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  ip inet,
  user_agent text,
  UNIQUE (token_hash)
);

CREATE INDEX auth_sessions_user_idx ON app.auth_sessions(user_id, expires_at);

CREATE TABLE app.auth_tokens (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  purpose varchar(30) NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Posts / community
-- ============================================================
CREATE TABLE app.posts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  author_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  title varchar(240),
  slug varchar(280),
  excerpt varchar(500),
  body_markdown text,
  status app.post_status NOT NULL DEFAULT 'published',
  visibility app.visibility NOT NULL DEFAULT 'community',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  hidden_at timestamptz,
  hidden_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  CONSTRAINT posts_id_author_uq UNIQUE (id, author_id),
  CONSTRAINT posts_content_ck CHECK (
    NULLIF(trim(coalesce(body_markdown, '')), '') IS NOT NULL
    OR title IS NOT NULL
  )
);

CREATE UNIQUE INDEX posts_slug_active_uq
  ON app.posts (slug)
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX posts_author_created_idx
  ON app.posts(author_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX posts_feed_idx
  ON app.posts(created_at DESC)
  WHERE deleted_at IS NULL AND status = 'published' AND hidden_at IS NULL;

CREATE TABLE app.post_tags (
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE app.tags (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name varchar(80) NOT NULL,
  slug varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug)
);

ALTER TABLE app.post_tags
  ADD CONSTRAINT post_tags_tag_fk
  FOREIGN KEY (tag_id) REFERENCES app.tags(id) ON DELETE CASCADE;

CREATE INDEX post_tags_tag_idx ON app.post_tags(tag_id, post_id);

CREATE TABLE app.media_assets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  bucket_name varchar(255) NOT NULL,
  object_key text NOT NULL,
  media_type varchar(100) NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  checksum_sha256 bytea,
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  duration_seconds numeric(12,3) CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (bucket_name, object_key)
);

CREATE TABLE app.post_images (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES app.media_assets(id) ON DELETE RESTRICT,
  alt_text varchar(250),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, media_asset_id)
);

CREATE INDEX post_images_post_order_idx
  ON app.post_images(post_id, sort_order, created_at);

-- ============================================================
-- Books / authors / publishers / reviews
-- ============================================================
CREATE TABLE app.book_authors (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name varchar(200) NOT NULL,
  external_provider varchar(50),
  external_id varchar(150),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_provider, external_id)
);

CREATE TABLE app.publishers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name varchar(200) NOT NULL,
  external_provider varchar(50),
  external_id varchar(150),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_provider, external_id)
);

CREATE TABLE app.books (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  external_provider varchar(50),
  external_id varchar(150),
  title varchar(500) NOT NULL,
  publication_year smallint CHECK (publication_year IS NULL OR publication_year BETWEEN 0 AND 3000),
  publisher_id uuid REFERENCES app.publishers(id) ON DELETE SET NULL,
  isbn13 varchar(13),
  cover_url text,
  language_code varchar(10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (external_provider, external_id)
);

CREATE INDEX books_title_trgm_idx ON app.books USING gin (title gin_trgm_ops);

CREATE TABLE app.book_author_links (
  book_id uuid NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES app.book_authors(id) ON DELETE RESTRICT,
  author_order smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (book_id, author_id)
);

CREATE INDEX book_author_links_author_idx ON app.book_author_links(author_id, book_id);

CREATE TABLE app.book_tags (
  book_id uuid NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES app.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);

CREATE INDEX book_tags_tag_idx ON app.book_tags(tag_id, book_id);

CREATE TABLE app.book_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  post_id uuid NOT NULL UNIQUE,
  reviewer_id uuid NOT NULL,
  book_id uuid NOT NULL REFERENCES app.books(id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  contains_spoilers boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT book_reviews_post_author_fk
    FOREIGN KEY (post_id, reviewer_id)
    REFERENCES app.posts(id, author_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX book_reviews_user_book_uq
  ON app.book_reviews (reviewer_id, book_id);

CREATE INDEX book_reviews_book_idx ON app.book_reviews(book_id, created_at DESC);

-- ============================================================
-- Videos
-- ============================================================
CREATE TABLE app.post_videos (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  source_type app.video_source_type NOT NULL,
  provider app.video_provider,
  external_id varchar(200),
  source_url text,
  media_asset_id uuid REFERENCES app.media_assets(id) ON DELETE RESTRICT,
  title varchar(500),
  description text,
  thumbnail_url text,
  duration_seconds numeric(12,3) CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  metadata jsonb,
  metadata_fetched_at timestamptz,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_videos_source_ck CHECK (
    (source_type = 'external' AND source_url IS NOT NULL AND media_asset_id IS NULL)
    OR
    (source_type = 'object_storage' AND media_asset_id IS NOT NULL AND source_url IS NULL)
  )
);

CREATE INDEX post_videos_post_order_idx
  ON app.post_videos(post_id, sort_order, created_at);

CREATE UNIQUE INDEX post_videos_external_uq
  ON app.post_videos(provider, external_id)
  WHERE provider IS NOT NULL AND external_id IS NOT NULL;

-- ============================================================
-- Code snippets
-- ============================================================
CREATE TABLE app.post_snippets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  title varchar(240) NOT NULL,
  description text,
  language varchar(80) NOT NULL,
  language_version varchar(80),
  source_code text NOT NULL,
  filename varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX post_snippets_language_idx ON app.post_snippets(language);

-- ============================================================
-- GitHub repositories
-- ============================================================
CREATE TABLE app.github_repositories (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  canonical_url text NOT NULL UNIQUE,
  repository_name varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.post_github_repositories (
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL REFERENCES app.github_repositories(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, repository_id)
);

CREATE INDEX post_github_repositories_repo_idx
  ON app.post_github_repositories(repository_id, post_id);

-- ============================================================
-- Events / activities
-- ============================================================
CREATE TABLE app.post_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  post_id uuid NOT NULL UNIQUE REFERENCES app.posts(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone_name varchar(64) NOT NULL,
  location_type app.event_location_type NOT NULL,
  location_name varchar(255),
  address text,
  meeting_url text,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status app.event_status NOT NULL DEFAULT 'scheduled',
  access_mode app.event_access_mode NOT NULL DEFAULT 'community',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_events_time_ck CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT post_events_location_ck CHECK (
    (location_type = 'online' AND meeting_url IS NOT NULL AND address IS NULL)
    OR
    (location_type = 'physical' AND address IS NOT NULL AND meeting_url IS NULL)
    OR
    (location_type = 'hybrid' AND meeting_url IS NOT NULL AND address IS NOT NULL)
  )
);

CREATE TABLE app.event_registrations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id uuid NOT NULL REFERENCES app.post_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  registered_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  UNIQUE (event_id, user_id)
);

CREATE INDEX event_registrations_event_idx ON app.event_registrations(event_id, registered_at);
CREATE INDEX event_registrations_user_idx ON app.event_registrations(user_id, registered_at DESC);

CREATE TABLE app.event_allowed_roles (
  event_id uuid NOT NULL REFERENCES app.post_events(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES app.roles(id) ON DELETE RESTRICT,
  PRIMARY KEY (event_id, role_id)
);

CREATE TABLE app.event_allowed_users (
  event_id uuid NOT NULL REFERENCES app.post_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  PRIMARY KEY (event_id, user_id)
);

-- ============================================================
-- Social interaction
-- ============================================================
CREATE TABLE app.post_reactions (
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  reaction app.reaction_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX post_reactions_user_idx ON app.post_reactions(user_id, created_at DESC);

CREATE TABLE app.comments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  parent_comment_id uuid REFERENCES app.comments(id) ON DELETE CASCADE,
  body_markdown text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX comments_post_created_idx
  ON app.comments(post_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX comments_parent_idx ON app.comments(parent_comment_id, created_at);

CREATE TABLE app.post_bookmarks (
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX post_bookmarks_user_idx ON app.post_bookmarks(user_id, created_at DESC);

CREATE TABLE app.user_follows (
  follower_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT user_follows_no_self_ck CHECK (follower_id <> following_id)
);

CREATE INDEX user_follows_following_idx ON app.user_follows(following_id, created_at DESC);

-- ============================================================
-- Mentions
-- ============================================================
CREATE TABLE app.post_mentions (
  post_id uuid NOT NULL REFERENCES app.posts(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, mentioned_user_id)
);

CREATE TABLE app.comment_mentions (
  comment_id uuid NOT NULL REFERENCES app.comments(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, mentioned_user_id)
);

-- ============================================================
-- Moderation / reports / auditing
-- ============================================================
CREATE TABLE app.moderation_reports (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  reporter_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  target_type app.report_target_type NOT NULL,
  post_id uuid REFERENCES app.posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES app.comments(id) ON DELETE CASCADE,
  reason_code varchar(80) NOT NULL,
  details text,
  status app.report_status NOT NULL DEFAULT 'pending',
  resolved_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_reports_target_ck CHECK (
    (target_type = 'post' AND post_id IS NOT NULL AND comment_id IS NULL)
    OR
    (target_type = 'comment' AND comment_id IS NOT NULL AND post_id IS NULL)
  )
);

CREATE INDEX moderation_reports_status_idx
  ON app.moderation_reports(status, created_at DESC);

CREATE TABLE app.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  actor_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  action_code varchar(100) NOT NULL,
  target_type varchar(80),
  target_id uuid,
  reason text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_target_idx
  ON app.admin_audit_log(target_type, target_id, created_at DESC);
CREATE INDEX admin_audit_log_actor_idx
  ON app.admin_audit_log(actor_user_id, created_at DESC);

-- ============================================================
-- Notifications / email
-- ============================================================
CREATE TABLE app.user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  email_comments boolean NOT NULL DEFAULT true,
  email_mentions boolean NOT NULL DEFAULT true,
  email_reactions boolean NOT NULL DEFAULT true,
  email_events boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.notifications (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  recipient_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  type app.notification_type NOT NULL,
  entity_type varchar(80),
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_recipient_idx
  ON app.notifications(recipient_user_id, created_at DESC);

CREATE INDEX notifications_unread_idx
  ON app.notifications(recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TABLE app.email_notification_queue (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES app.notifications(id) ON DELETE SET NULL,
  template_code varchar(100) NOT NULL,
  recipient_email varchar(320) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status app.email_delivery_status NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_queue_pending_idx
  ON app.email_notification_queue(scheduled_at, created_at)
  WHERE status = 'queued';

-- ============================================================
-- Cross-entity search index, intentionally denormalized.
-- The application layer should upsert rows when indexed entities change.
-- ============================================================
CREATE TABLE app.search_documents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  entity_type varchar(40) NOT NULL,
  entity_id uuid NOT NULL,
  title text,
  content text,
  search_vector tsvector NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX search_documents_vector_idx
  ON app.search_documents USING gin (search_vector);

CREATE INDEX search_documents_title_trgm_idx
  ON app.search_documents USING gin (title gin_trgm_ops);

-- ============================================================
-- Updated-at triggers
-- ============================================================
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON app.users
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER user_credentials_set_updated_at
BEFORE UPDATE ON app.user_credentials
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER user_identities_set_updated_at
BEFORE UPDATE ON app.user_identities
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER posts_set_updated_at
BEFORE UPDATE ON app.posts
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER books_set_updated_at
BEFORE UPDATE ON app.books
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER book_reviews_set_updated_at
BEFORE UPDATE ON app.book_reviews
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER post_videos_set_updated_at
BEFORE UPDATE ON app.post_videos
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER post_snippets_set_updated_at
BEFORE UPDATE ON app.post_snippets
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER github_repositories_set_updated_at
BEFORE UPDATE ON app.github_repositories
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER post_events_set_updated_at
BEFORE UPDATE ON app.post_events
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER post_reactions_set_updated_at
BEFORE UPDATE ON app.post_reactions
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER comments_set_updated_at
BEFORE UPDATE ON app.comments
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER user_notification_preferences_set_updated_at
BEFORE UPDATE ON app.user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================
-- Seed base roles / permissions
-- ============================================================
INSERT INTO app.roles (code, name, description)
VALUES
  ('user', 'User', 'Regular community member'),
  ('moderator', 'Moderator', 'Community moderation role'),
  ('admin', 'Administrator', 'Platform administration role')
ON CONFLICT (code) DO NOTHING;

INSERT INTO app.permissions (code, name, description)
VALUES
  ('posts.create', 'Create posts', 'Create community publications'),
  ('posts.edit_own', 'Edit own posts', 'Edit owned publications'),
  ('posts.delete_own', 'Delete own posts', 'Soft-delete owned publications'),
  ('comments.create', 'Create comments', 'Comment on publications'),
  ('events.create', 'Create events', 'Create community events'),
  ('events.manage_own', 'Manage own events', 'Manage owned events'),
  ('moderation.read_reports', 'Read reports', 'Review moderation reports'),
  ('moderation.manage_content', 'Manage content', 'Hide or remove community content'),
  ('admin.audit.read', 'Read audit log', 'Read administrative audit records'),
  ('users.manage_roles', 'Manage roles', 'Assign and revoke user roles')
ON CONFLICT (code) DO NOTHING;

-- Basic user permissions.
INSERT INTO app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app.roles r
JOIN app.permissions p ON p.code IN (
  'posts.create',
  'posts.edit_own',
  'posts.delete_own',
  'comments.create',
  'events.create',
  'events.manage_own'
)
WHERE r.code = 'user'
ON CONFLICT DO NOTHING;

-- Moderator permissions.
INSERT INTO app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app.roles r
JOIN app.permissions p ON p.code IN (
  'moderation.read_reports',
  'moderation.manage_content'
)
WHERE r.code = 'moderator'
ON CONFLICT DO NOTHING;

-- Admin permissions.
INSERT INTO app.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app.roles r
JOIN app.permissions p ON p.code IN (
  'moderation.read_reports',
  'moderation.manage_content',
  'admin.audit.read',
  'users.manage_roles'
)
WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;


-- migrate:down
DROP SCHEMA IF EXISTS app CASCADE;
