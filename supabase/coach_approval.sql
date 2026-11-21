-- Coach approval for self sign-up. Run after roster_access.sql.
--
-- Anyone can create an account on roster.html, but a new account can't edit
-- anything until an admin approves it as a coach of a team. These two
-- functions power the admin's "Coach requests" list. Both refuse to do
-- anything unless the caller is an admin.

-- Accounts that aren't linked to any role yet (newest first).
create function public.pending_accounts()
returns table (user_id uuid, email text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, u.created_at
  from auth.users u
  where private.is_admin()
    and not exists (select 1 from public.staff s where s.user_id = u.id)
  order by u.created_at desc;
$$;

-- Make an account the coach of a team. Runs with the caller's own rights, so
-- the "admins add coaches" policy below decides whether it's allowed.
-- (Admins can only add COACH rows from the site; new admins are added in the dashboard.)
create function public.approve_coach(account uuid, team uuid)
returns void
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.staff (user_id, role, team_id) values (account, 'coach', team);
end $$;

grant insert (user_id, role, team_id) on public.staff to authenticated;
create policy "admins add coaches" on public.staff
  for insert to authenticated
  with check (private.is_admin() and role = 'coach');

-- pending_accounts must be security definer to read emails from auth.users;
-- it returns nothing unless the caller is an admin.
revoke execute on function public.pending_accounts(), public.approve_coach(uuid, uuid) from public, anon;
grant execute on function public.pending_accounts(), public.approve_coach(uuid, uuid) to authenticated;
