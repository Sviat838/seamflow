-- Global stats are read by the Next.js server (service role) and cached there,
-- so browser roles don't need direct RPC access.
revoke execute on function public.get_global_stats() from anon, authenticated;
