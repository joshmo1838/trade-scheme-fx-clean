-- Run in Supabase SQL Editor after admin-customer-email.sql.
-- One private conversation per customer.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

grant select, insert on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

drop policy if exists "Customers and admins can view conversations" on public.conversations;
create policy "Customers and admins can view conversations"
on public.conversations for select to authenticated
using (customer_id = (select auth.uid()) or public.is_admin());

drop policy if exists "Customers and admins can create conversations" on public.conversations;
create policy "Customers and admins can create conversations"
on public.conversations for insert to authenticated
with check (customer_id = (select auth.uid()) or public.is_admin());

drop policy if exists "Participants can read messages" on public.messages;
create policy "Participants can read messages"
on public.messages for select to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.customer_id = (select auth.uid()) or public.is_admin())
  )
);

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.customer_id = (select auth.uid()) or public.is_admin())
  )
);

-- Enable Supabase Realtime updates for in-app chat.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
