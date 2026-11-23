-- Sequential document numbers: always MAX(existing) + 1, assigned inside the database
-- so two devices saving at once can't get the same number.

-- Numeric part of a number: 10, "OFF-10", "RE-2026-010" -> 10; a version suffix ("12_2") is ignored.
create or replace function public._doc_nummer(v text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select substring(regexp_replace(coalesce(v, ''), '_\d+$', '') from '(\d{1,9})\D*$')::bigint
$$;

-- Next free number. Rechnung types (standard / anzahlung / schluss) count separately.
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
      select max(public._doc_nummer(data->>'offertNumber')) into m from public.offerten;
    when 'rechnungen' then
      select max(public._doc_nummer(data->>'rechnungNumber')) into m from public.rechnungen
       where case when data->>'art' in ('anzahlung', 'schluss') then data->>'art' else 'standard' end = p_art;
    else
      raise exception 'Unknown document table: %', p_table;
  end case;
  return coalesce(m, 0) + 1;
end
$$;

-- Inserts a document. p_auto: assigns the next number under a per-sequence lock;
-- otherwise the number in p_data is kept (manual override, new Offerte version).
create or replace function public.create_document(p_table text, p_id text, p_data jsonb, p_auto boolean default true)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  art text := 'standard';
  feld text;
  doc jsonb := p_data;
begin
  feld := case p_table
    when 'orders' then 'orderNumber'
    when 'offerten' then 'offertNumber'
    when 'rechnungen' then 'rechnungNumber'
  end;
  if feld is null then
    raise exception 'Unknown document table: %', p_table;
  end if;
  if p_table = 'rechnungen' and p_data->>'art' in ('anzahlung', 'schluss') then
    art := p_data->>'art';
  end if;

  -- Held until commit; the number is read by a later statement, so it sees the previous writer's row.
  perform pg_advisory_xact_lock(hashtext('doc_nummer:' || p_table || ':' || art));

  if p_auto then
    doc := doc || jsonb_build_object(feld, public.next_document_number(p_table, art));
  elsif doc->feld is null then
    raise exception 'Missing document number';
  end if;

  case p_table
    when 'orders' then insert into public.orders (id, data) values (p_id, doc);
    when 'offerten' then insert into public.offerten (id, data) values (p_id, doc);
    when 'rechnungen' then insert into public.rechnungen (id, data) values (p_id, doc);
  end case;
  return doc;
end
$$;

revoke all on function public._doc_nummer(text) from public, anon;
revoke all on function public.next_document_number(text, text) from public, anon;
revoke all on function public.create_document(text, text, jsonb, boolean) from public, anon;
grant execute on function public._doc_nummer(text) to authenticated;
grant execute on function public.next_document_number(text, text) to authenticated;
grant execute on function public.create_document(text, text, jsonb, boolean) to authenticated;
