-- Offerten: the next automatic number is the smallest free number counting from
-- the lowest one in use (gaps from deleted Offerten are filled first), else
-- MAX + 1; numbers below the lowest one are never handed out. Versions ("12_2")
-- count as their base number, so a number used by any version stays taken.
-- Orders and Rechnungen keep MAX + 1. create_document still assigns the number
-- under the per-sequence advisory lock, so simultaneous saves can't collide.
create or replace function public.next_document_number(p_table text, p_art text default 'standard')
returns bigint
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  m bigint;
begin
  case p_table
    when 'orders' then
      select max(public._doc_nummer(data->>'orderNumber')) into m from public.orders;
    when 'offerten' then
      with belegt as (
        select distinct public._doc_nummer(data->>'offertNumber') as n
          from public.offerten
      )
      -- First number after a used one that is itself unused: the lowest gap
      -- above the lowest number in use, or MAX + 1. Empty table -> 1.
      select min(b.n + 1) into m
        from belegt b
       where b.n >= 1
         and not exists (select 1 from belegt c where c.n = b.n + 1);
      return coalesce(m, 1);
    when 'rechnungen' then
      select max(public._doc_nummer(data->>'rechnungNumber')) into m from public.rechnungen
       where case when data->>'art' in ('anzahlung', 'schluss') then data->>'art' else 'standard' end = p_art;
    else
      raise exception 'Unknown document table: %', p_table;
  end case;
  return coalesce(m, 0) + 1;
end
$$;

revoke all on function public.next_document_number(text, text) from public, anon;
grant execute on function public.next_document_number(text, text) to authenticated;
