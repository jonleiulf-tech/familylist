-- Views for dynamisk aggregering. Ingen manuelle summeringsfelt eller
-- hardkodede rad-områder – alt aggregeres fra faktiske rader hver gang.

create view public.milestone_logged_minutes as
select
  m.id as milestone_id,
  m.project_id,
  coalesce(sum(te.duration_minutes), 0)::bigint as logged_minutes,
  count(distinct te.id) as entry_count
from public.milestones m
left join public.time_entries te on te.milestone_id = m.id
group by m.id, m.project_id;

create view public.milestone_task_counts as
select
  m.id as milestone_id,
  m.project_id,
  count(t.id) as task_count,
  count(t.id) filter (where t.status <> 'done') as open_task_count
from public.milestones m
left join public.tasks t on t.milestone_id = m.id
group by m.id, m.project_id;

alter view public.milestone_logged_minutes set (security_invoker = on);
alter view public.milestone_task_counts set (security_invoker = on);
