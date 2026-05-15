create table if not exists lesson53_leads (
  id integer primary key autoincrement,
  created_at text not null,
  email text not null,
  name text,
  business text,
  industry text,
  score integer,
  verdict text,
  payload_json text
);

create index if not exists idx_lesson53_leads_created_at
  on lesson53_leads (created_at);

create index if not exists idx_lesson53_leads_email
  on lesson53_leads (email);
