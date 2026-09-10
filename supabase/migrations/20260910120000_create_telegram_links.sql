-- supabase/migrations/20260910120000_create_telegram_links.sql
-- Maps a Telegram user id to a Supabase auth user. Written only by the
-- telegram-auth Edge Function (service_role); an authenticated user may
-- read their own row (for a future "unlink" screen).

create table if not exists public.telegram_links (
    tg_id       bigint primary key,
    user_id     uuid not null references auth.users (id) on delete cascade,
    email       text not null,
    tg_username text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create unique index if not exists telegram_links_user_id_key
    on public.telegram_links (user_id);

alter table public.telegram_links enable row level security;

drop policy if exists "read own telegram link" on public.telegram_links;
create policy "read own telegram link" on public.telegram_links
    for select to authenticated
    using (user_id = auth.uid());

grant select on public.telegram_links to authenticated;
