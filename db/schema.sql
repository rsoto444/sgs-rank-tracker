-- Safe to run on every deploy: everything is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sites (
  id              serial PRIMARY KEY,
  name            text NOT NULL,
  domain          text NOT NULL UNIQUE,
  kind            text NOT NULL DEFAULT 'client' CHECK (kind IN ('agency', 'client')),
  gsc_property    text,
  ga4_property_id text,
  tracking_key    text NOT NULL UNIQUE,
  location_code   integer NOT NULL DEFAULT 2840,
  language_code   text NOT NULL DEFAULT 'en',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_access (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, site_id)
);

CREATE TABLE IF NOT EXISTS keywords (
  id         serial PRIMARY KEY,
  site_id    integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  keyword    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS keywords_site_keyword ON keywords (site_id, lower(keyword));

-- One DataForSEO check per keyword per day. position is NULL when not in the top 100.
CREATE TABLE IF NOT EXISTS rank_checks (
  keyword_id integer NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  checked_on date NOT NULL,
  position   integer,
  url        text,
  PRIMARY KEY (keyword_id, checked_on)
);

-- Search Console: every query the site showed up for, per day.
CREATE TABLE IF NOT EXISTS gsc_queries (
  site_id     integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  day         date NOT NULL,
  query       text NOT NULL,
  clicks      integer NOT NULL,
  impressions integer NOT NULL,
  position    real NOT NULL,
  PRIMARY KEY (site_id, day, query)
);

-- Built-in tracking snippet: one row per page view.
CREATE TABLE IF NOT EXISTS pageviews (
  id            bigserial PRIMARY KEY,
  site_id       integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ts            timestamptz NOT NULL DEFAULT now(),
  path          text NOT NULL,
  referrer_host text,
  device        text,
  country       text,
  visitor_hash  text NOT NULL
);
CREATE INDEX IF NOT EXISTS pageviews_site_ts ON pageviews (site_id, ts);

-- GA4 daily totals and breakdowns (page, source, device, country).
CREATE TABLE IF NOT EXISTS ga4_daily (
  site_id   integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  day       date NOT NULL,
  users     integer NOT NULL,
  sessions  integer NOT NULL,
  pageviews integer NOT NULL,
  PRIMARY KEY (site_id, day)
);
CREATE TABLE IF NOT EXISTS ga4_breakdown (
  site_id   integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  day       date NOT NULL,
  dimension text NOT NULL,
  value     text NOT NULL,
  count     integer NOT NULL,
  PRIMARY KEY (site_id, day, dimension, value)
);

-- Last result of each background sync, shown on the Connections page.
CREATE TABLE IF NOT EXISTS sync_log (
  site_id  integer NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  source   text NOT NULL,
  ran_at   timestamptz NOT NULL DEFAULT now(),
  ok       boolean NOT NULL,
  message  text NOT NULL,
  PRIMARY KEY (site_id, source)
);

-- Daily checks sent to DataForSEO's cheaper Standard Queue, waiting to be collected.
CREATE TABLE IF NOT EXISTS rank_tasks (
  task_id    text PRIMARY KEY,
  keyword_id integer NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  checked_on date NOT NULL,
  posted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rank_tasks_keyword ON rank_tasks (keyword_id, checked_on);
