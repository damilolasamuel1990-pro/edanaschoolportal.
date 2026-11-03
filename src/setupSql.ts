/**
 * Database setup for Edana Schools (v4 - self-healing + type repair).
 * Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
 * Safe to run again and again: it repairs tables whose id columns were
 * created with the wrong type, creates missing tables, adds missing
 * columns/indexes, and never touches login accounts.
 * Also saved as supabase-setup.sql in the project root.
 */
export const SETUP_SQL = `-- ============================================================
-- Edana Schools - Supabase setup v11 (self-healing + repair)
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run
-- Safe to run again and again. It repairs tables whose id was
-- created as text/integer instead of uuid, creates missing
-- tables, adds missing columns, and never touches user logins.
-- ============================================================

-- ---------- 0) REPAIR: fix id columns that are not uuid ----------
-- Tables created by hand/import sometimes have id as text or int,
-- which breaks the app's foreign keys. Convert them to uuid; if a
-- table is too incompatible to convert, recreate just that table
-- (school tables only - login accounts/profiles are never touched).
do $$
declare
  t text;
  idt text;
begin
  for t, idt in
    select table_name, data_type
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'id'
      and table_name in ('classes','students','subjects','student_subjects','results',
                         'reports','attendance','fee_items','payments','notices')
  loop
    if idt <> 'uuid' then
      begin
        execute format('alter table public.%I alter column id type uuid using id::uuid', t);
        raise notice 'Fixed id type on % (was %)', t, idt;
      exception when others then
        begin
          execute format('alter table public.%I alter column id type uuid using gen_random_uuid()', t);
          raise notice 'Regenerated uuid ids on % (was %)', t, idt;
        exception when others then
          execute format('drop table if exists public.%I cascade', t);
          raise notice 'Recreated table % from scratch (was incompatible: id %)', t, idt;
        end;
      end;
    end if;
  end loop;
end $$;

-- ---------- 0b) REPAIR: fix link columns (*_id) that are not uuid ----------
do $$
declare
  r record;
begin
  for r in
    select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public'
      and column_name like '%\_id'
      and table_name in ('classes','students','subjects','student_subjects','results',
                         'reports','attendance','fee_items','payments','notices','profiles')
      and data_type <> 'uuid'
  loop
    begin
      execute format('alter table public.%I alter column %I type uuid using nullif(%I::text, '''')::uuid', r.table_name, r.column_name, r.column_name);
      raise notice 'Fixed %.% to uuid (was %)', r.table_name, r.column_name, r.data_type;
    exception when others then
      begin
        -- Keep valid UUID values, clear anything else (old test/import ids)
        execute format('alter table public.%I alter column %I drop not null', r.table_name, r.column_name);
        execute format('alter table public.%I alter column %I type uuid using (case when %I::text ~ ''^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'' then %I::text::uuid else null end)', r.table_name, r.column_name, r.column_name, r.column_name);
        raise notice 'Repaired %.% to uuid (was %)', r.table_name, r.column_name, r.data_type;
      exception when others then
        raise notice 'Could not fix %.%: %', r.table_name, r.column_name, sqlerrm;
      end;
    end;
  end loop;
end $$;

-- ---------- 1) Profiles: one row per login account, holds the role ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'pending'
    check (role in ('super_admin', 'admin', 'teacher', 'student', 'parent', 'pending')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists full_name text not null default '';
alter table public.profiles add column if not exists role text not null default 'pending';
alter table public.profiles add column if not exists created_by uuid references auth.users (id);
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles enable row level security;

-- Allow the part-time staff and bursary roles:
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'teacher', 'student', 'parent', 'part_time', 'bursary', 'pending'));

-- ---------- 2) Classes (Reception 1 -> SS 3) ----------
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  level text not null default '',
  sort_order int not null default 0,
  class_teacher_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
-- If the classes table already existed (e.g. made by hand), add any missing columns:
alter table public.classes add column if not exists name text;
alter table public.classes add column if not exists level text not null default '';
alter table public.classes add column if not exists sort_order int not null default 0;
alter table public.classes add column if not exists class_teacher_id uuid references public.profiles (id);
alter table public.classes add column if not exists created_at timestamptz not null default now();
alter table public.classes alter column id set default gen_random_uuid();
alter table public.classes enable row level security;

-- ---------- 3) Students ----------
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  admission_no text not null unique,
  first_name text not null,
  last_name text not null,
  gender text not null default '',
  date_of_birth date,
  class_id uuid references public.classes (id),
  parent_id uuid references public.profiles (id),
  guardian_name text not null default '',
  guardian_phone text not null default '',
  guardian_email text not null default '',
  address text not null default '',
  passport_path text,
  status text not null default 'active' check (status in ('active','graduated','left')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.students add column if not exists admission_no text;
alter table public.students add column if not exists first_name text;
alter table public.students add column if not exists last_name text;
alter table public.students add column if not exists gender text not null default '';
alter table public.students add column if not exists date_of_birth date;
alter table public.students add column if not exists class_id uuid references public.classes (id);
alter table public.students add column if not exists parent_id uuid references public.profiles (id);
alter table public.students add column if not exists guardian_name text not null default '';
alter table public.students add column if not exists guardian_phone text not null default '';
alter table public.students add column if not exists guardian_email text not null default '';
alter table public.students add column if not exists address text not null default '';
alter table public.students add column if not exists passport_path text;
alter table public.students add column if not exists status text not null default 'active';
alter table public.students add column if not exists created_by uuid references public.profiles (id);
alter table public.students add column if not exists created_at timestamptz not null default now();
alter table public.students alter column id set default gen_random_uuid();
alter table public.students enable row level security;

-- ---------- 4) Subjects & student subject enrolment ----------
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  class_id uuid not null references public.classes (id) on delete cascade,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (class_id, name)
);
alter table public.subjects add column if not exists name text;
alter table public.subjects add column if not exists class_id uuid references public.classes (id) on delete cascade;
alter table public.subjects add column if not exists created_by uuid references public.profiles (id);
alter table public.subjects add column if not exists created_at timestamptz not null default now();
alter table public.subjects alter column id set default gen_random_uuid();
alter table public.subjects enable row level security;

create table if not exists public.student_subjects (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  unique (student_id, subject_id)
);
alter table public.student_subjects add column if not exists student_id uuid references public.students (id) on delete cascade;
alter table public.student_subjects add column if not exists subject_id uuid references public.subjects (id) on delete cascade;
alter table public.student_subjects alter column id set default gen_random_uuid();
alter table public.student_subjects enable row level security;

-- Which subjects each part-time staff teaches:
create table if not exists public.staff_subjects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  unique (profile_id, subject_id)
);
alter table public.staff_subjects add column if not exists profile_id uuid references public.profiles (id) on delete cascade;
alter table public.staff_subjects add column if not exists subject_id uuid references public.subjects (id) on delete cascade;
alter table public.staff_subjects alter column id set default gen_random_uuid();
alter table public.staff_subjects enable row level security;

-- ---------- 5) Results (scores per term) ----------
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  term text not null,
  session text not null,
  score numeric not null check (score >= 0 and score <= 100),
  test_score numeric,
  exam_score numeric,
  entered_by uuid references public.profiles (id),
  unique (student_id, subject_id, term, session)
);
alter table public.results add column if not exists student_id uuid references public.students (id) on delete cascade;
alter table public.results add column if not exists subject_id uuid references public.subjects (id) on delete cascade;
alter table public.results add column if not exists term text;
alter table public.results add column if not exists session text;
alter table public.results add column if not exists score numeric;
alter table public.results add column if not exists test_score numeric;
alter table public.results add column if not exists exam_score numeric;
alter table public.results add column if not exists entered_by uuid references public.profiles (id);
alter table public.results alter column id set default gen_random_uuid();
alter table public.results enable row level security;

-- ---------- 6) Report card extras (traits, comments, dates) ----------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  session text not null,
  affective jsonb not null default '{}'::jsonb,
  psychomotor jsonb not null default '{}'::jsonb,
  teacher_comment text not null default '',
  principal_comment text not null default '',
  term_begins date,
  term_ends date,
  next_term_begins date,
  days_opened int,
  days_present int,
  unique (student_id, session)
);
alter table public.reports add column if not exists student_id uuid references public.students (id) on delete cascade;
alter table public.reports add column if not exists session text;
alter table public.reports add column if not exists affective jsonb not null default '{}'::jsonb;
alter table public.reports add column if not exists psychomotor jsonb not null default '{}'::jsonb;
alter table public.reports add column if not exists teacher_comment text not null default '';
alter table public.reports add column if not exists principal_comment text not null default '';
alter table public.reports add column if not exists term_begins date;
alter table public.reports add column if not exists term_ends date;
alter table public.reports add column if not exists next_term_begins date;
alter table public.reports add column if not exists days_opened int;
alter table public.reports add column if not exists days_present int;
alter table public.reports alter column id set default gen_random_uuid();
alter table public.reports enable row level security;

-- ---------- 7) Attendance ----------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  date date not null,
  status text not null check (status in ('present','absent','late')),
  marked_by uuid references public.profiles (id),
  unique (student_id, date)
);
alter table public.attendance add column if not exists student_id uuid references public.students (id) on delete cascade;
alter table public.attendance add column if not exists date date;
alter table public.attendance add column if not exists status text;
alter table public.attendance add column if not exists marked_by uuid references public.profiles (id);
alter table public.attendance alter column id set default gen_random_uuid();
alter table public.attendance enable row level security;

-- ---------- 8) Fees & payments ----------
create table if not exists public.fee_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric not null default 0,
  class_id uuid references public.classes (id),
  term text not null default '',
  session text not null default '',
  created_at timestamptz not null default now()
);
alter table public.fee_items add column if not exists title text;
alter table public.fee_items add column if not exists amount numeric not null default 0;
alter table public.fee_items add column if not exists class_id uuid references public.classes (id);
alter table public.fee_items add column if not exists term text not null default '';
alter table public.fee_items add column if not exists session text not null default '';
alter table public.fee_items add column if not exists created_at timestamptz not null default now();
alter table public.fee_items alter column id set default gen_random_uuid();
alter table public.fee_items enable row level security;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  fee_item_id uuid references public.fee_items (id),
  amount numeric not null default 0,
  method text not null default '',
  reference text not null unique,
  status text not null default 'Paid',
  paid_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.payments add column if not exists student_id uuid references public.students (id) on delete cascade;
alter table public.payments add column if not exists fee_item_id uuid references public.fee_items (id);
alter table public.payments add column if not exists amount numeric not null default 0;
alter table public.payments add column if not exists method text not null default '';
alter table public.payments add column if not exists reference text;
alter table public.payments add column if not exists status text not null default 'Paid';
alter table public.payments add column if not exists proof_path text;
alter table public.payments add column if not exists verified_by uuid references public.profiles (id);
alter table public.payments add column if not exists verified_at timestamptz;
alter table public.payments add column if not exists paid_by uuid references public.profiles (id);
alter table public.payments add column if not exists created_at timestamptz not null default now();
alter table public.payments alter column id set default gen_random_uuid();
alter table public.payments enable row level security;

-- ---------- 9) Notice board ----------
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  audience text not null default 'all',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.notices add column if not exists title text;
alter table public.notices add column if not exists body text not null default '';
alter table public.notices add column if not exists audience text not null default 'all';
alter table public.notices add column if not exists created_by uuid references public.profiles (id);
alter table public.notices add column if not exists created_at timestamptz not null default now();
alter table public.notices alter column id set default gen_random_uuid();
alter table public.notices enable row level security;

-- ---------- 10) Unique indexes (needed by the app; added safely) ----------
-- Remove duplicate class names first (keeps the oldest row) so the unique index can be built:
do $$ begin
  delete from public.classes a using public.classes b where a.name = b.name and a.ctid > b.ctid;
exception when others then raise notice 'class dedupe skipped: %', sqlerrm;
end $$;
do $$ begin create unique index if not exists classes_name_key on public.classes (name); exception when others then raise notice 'classes_name_key skipped: %', sqlerrm; end $$;
do $$ begin create unique index if not exists students_admission_no_key on public.students (admission_no); exception when others then raise notice 'students_admission_no_key skipped: %', sqlerrm; end $$;
do $$ begin create unique index if not exists subjects_class_name_key on public.subjects (class_id, name); exception when others then raise notice 'subjects_class_name_key skipped: %', sqlerrm; end $$;
do $$ begin create unique index if not exists student_subjects_key on public.student_subjects (student_id, subject_id); exception when others then raise notice 'student_subjects_key skipped: %', sqlerrm; end $$;
do $$ begin create unique index if not exists staff_subjects_key on public.staff_subjects (profile_id, subject_id); exception when others then raise notice 'staff_subjects_key skipped: %', sqlerrm; end $$;
do $$ begin create unique index if not exists results_key on public.results (student_id, subject_id, term, session); exception when others then raise notice 'results_key skipped: %', sqlerrm; end $$;
do $$ begin create unique index if not exists reports_key on public.reports (student_id, session); exception when others then raise notice 'reports_key skipped: %', sqlerrm; end $$;
do $$ begin create unique index if not exists attendance_key on public.attendance (student_id, date); exception when others then raise notice 'attendance_key skipped: %', sqlerrm; end $$;
do $$ begin create unique index if not exists payments_reference_key on public.payments (reference); exception when others then raise notice 'payments_reference_key skipped: %', sqlerrm; end $$;

-- ---------- 11) Seed the class list: Reception 1 -> SS 3 ----------
-- Rename Primary 1-6 to Basic 1-6 (current national naming) if they exist:
update public.classes c
set name = v.new_name, level = 'Basic'
from (values
  ('Primary 1','Basic 1'), ('Primary 2','Basic 2'), ('Primary 3','Basic 3'),
  ('Primary 4','Basic 4'), ('Primary 5','Basic 5'), ('Primary 6','Basic 6')
) as v(old_name, new_name)
where c.name = v.old_name
  and not exists (select 1 from public.classes x where x.name = v.new_name);

insert into public.classes (name, level, sort_order) values
  ('Reception 1','Early Years',1), ('Reception 2','Early Years',2),
  ('Nursery 1','Early Years',3), ('Nursery 2','Early Years',4),
  ('Basic 1','Basic',5), ('Basic 2','Basic',6), ('Basic 3','Basic',7),
  ('Basic 4','Basic',8), ('Basic 5','Basic',9), ('Basic 6','Basic',10),
  ('JSS 1','Junior Secondary',11), ('JSS 2','Junior Secondary',12), ('JSS 3','Junior Secondary',13),
  ('SS 1','Senior Secondary',14), ('SS 2','Senior Secondary',15), ('SS 3','Senior Secondary',16)
on conflict (name) do nothing;

-- Keep the standard classes in the right order even if they existed already:
update public.classes as c
set sort_order = v.sort_order,
    level = case when coalesce(c.level, '') = '' then v.level else c.level end
from (values
  ('Reception 1','Early Years',1), ('Reception 2','Early Years',2),
  ('Nursery 1','Early Years',3), ('Nursery 2','Early Years',4),
  ('Basic 1','Basic',5), ('Basic 2','Basic',6), ('Basic 3','Basic',7),
  ('Basic 4','Basic',8), ('Basic 5','Basic',9), ('Basic 6','Basic',10),
  ('JSS 1','Junior Secondary',11), ('JSS 2','Junior Secondary',12), ('JSS 3','Junior Secondary',13),
  ('SS 1','Senior Secondary',14), ('SS 2','Senior Secondary',15), ('SS 3','Senior Secondary',16)
) as v(name, level, sort_order)
where c.name = v.name;

-- ---------- 12) Helper functions ----------
create or replace function public.is_super_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin');
$$;

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin','admin'));
$$;

create or replace function public.is_staff()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin','admin','teacher'));
$$;

-- Finance team: Super Admin, Admin and Bursary (fees & payment verification)
create or replace function public.is_finance()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin','admin','bursary'));
$$;

create or replace function public.super_admin_exists()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where role = 'super_admin');
$$;

create or replace function public.is_parent_of(p_student_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.students where id = p_student_id and parent_id = auth.uid());
$$;

-- Text-friendly twin: keeps the security rules working even if a
-- hand-made table still stores student_id as text.
create or replace function public.is_parent_of(p_student_id text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.students where id::text = p_student_id and parent_id = auth.uid());
$$;

-- Can the signed-in part-time staff member view this student?
-- True when the student offers one of the subjects assigned to them
-- (or when the student has no specific subject enrolments yet and is
-- in a class where the staff member teaches a subject).
create or replace function public.can_view_student(p_student_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1
    from public.students s
    join public.subjects sub on sub.class_id = s.class_id
    join public.staff_subjects st on st.subject_id = sub.id and st.profile_id = auth.uid()
    where s.id = p_student_id
      and (
        not exists (select 1 from public.student_subjects ss where ss.student_id = s.id)
        or exists (select 1 from public.student_subjects ss
                   where ss.student_id = s.id and ss.subject_id = sub.id)
      )
  );
$$;

-- ---------- 13) Security rules (Row Level Security) ----------
-- Profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert to authenticated
  with check (
    public.is_super_admin()
    or (id = auth.uid() and role = 'pending')
    or (id = auth.uid() and role = 'super_admin' and not public.super_admin_exists())
  );

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update to authenticated
  using (public.is_super_admin() or id = auth.uid())
  with check (
    public.is_super_admin()
    or (id = auth.uid() and role = 'super_admin' and not public.super_admin_exists())
  );

drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles for delete to authenticated
  using (public.is_super_admin());

-- Bursary/finance can view accounts (parent information)
drop policy if exists "profiles_finance_select" on public.profiles;
create policy "profiles_finance_select" on public.profiles for select to authenticated
  using (public.is_finance());

-- Classes: everyone signed in can view; only admins manage
drop policy if exists "classes_select" on public.classes;
create policy "classes_select" on public.classes for select to authenticated using (true);
drop policy if exists "classes_write" on public.classes;
create policy "classes_write" on public.classes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Students: staff manage; parents see only their own children;
-- part-time staff see only students offering their subject
drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students for select to authenticated
  using (public.is_staff() or parent_id = auth.uid());
drop policy if exists "students_part_time_select" on public.students;
create policy "students_part_time_select" on public.students for select to authenticated
  using (public.can_view_student(id));
drop policy if exists "students_write" on public.students;
create policy "students_write" on public.students for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Bursary/finance can view student information (read-only)
drop policy if exists "students_finance_select" on public.students;
create policy "students_finance_select" on public.students for select to authenticated
  using (public.is_finance());

-- Staff subjects: admins assign; part-time staff can see their own assignments
drop policy if exists "staff_subjects_select" on public.staff_subjects;
create policy "staff_subjects_select" on public.staff_subjects for select to authenticated
  using (public.is_admin() or profile_id = auth.uid());
drop policy if exists "staff_subjects_write" on public.staff_subjects;
create policy "staff_subjects_write" on public.staff_subjects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Subjects
drop policy if exists "subjects_select" on public.subjects;
create policy "subjects_select" on public.subjects for select to authenticated using (true);
drop policy if exists "subjects_write" on public.subjects;
create policy "subjects_write" on public.subjects for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Student subjects
drop policy if exists "student_subjects_select" on public.student_subjects;
create policy "student_subjects_select" on public.student_subjects for select to authenticated
  using (
    public.is_staff()
    or public.is_parent_of(student_id)
    or subject_id in (select subject_id from public.staff_subjects where profile_id = auth.uid())
  );
drop policy if exists "student_subjects_write" on public.student_subjects;
create policy "student_subjects_write" on public.student_subjects for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Results: staff enter; parents view their children's;
-- part-time staff can read/write results ONLY for their assigned subjects
drop policy if exists "results_select" on public.results;
create policy "results_select" on public.results for select to authenticated
  using (public.is_staff() or public.is_parent_of(student_id));
drop policy if exists "results_write" on public.results;
create policy "results_write" on public.results for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists "results_part_time" on public.results;
create policy "results_part_time" on public.results for all to authenticated
  using (subject_id in (select subject_id from public.staff_subjects where profile_id = auth.uid()))
  with check (subject_id in (select subject_id from public.staff_subjects where profile_id = auth.uid()));

-- Reports
drop policy if exists "reports_select" on public.reports;
create policy "reports_select" on public.reports for select to authenticated
  using (public.is_staff() or public.is_parent_of(student_id));
drop policy if exists "reports_write" on public.reports;
create policy "reports_write" on public.reports for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Attendance
drop policy if exists "attendance_select" on public.attendance;
create policy "attendance_select" on public.attendance for select to authenticated
  using (public.is_staff() or public.is_parent_of(student_id));
drop policy if exists "attendance_write" on public.attendance;
create policy "attendance_write" on public.attendance for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Fee items: everyone can view; the finance team (Super Admin, Admin, Bursary) manages
drop policy if exists "fee_items_select" on public.fee_items;
create policy "fee_items_select" on public.fee_items for select to authenticated using (true);
drop policy if exists "fee_items_write" on public.fee_items;
create policy "fee_items_write" on public.fee_items for all to authenticated
  using (public.is_finance()) with check (public.is_finance());

-- Payments: finance team sees/verifies all; parents see/pay for their own children
drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments for select to authenticated
  using (public.is_staff() or public.is_finance() or paid_by = auth.uid() or public.is_parent_of(student_id));
drop policy if exists "payments_insert" on public.payments;
create policy "payments_insert" on public.payments for insert to authenticated
  with check (public.is_finance() or (paid_by = auth.uid() and public.is_parent_of(student_id)));
drop policy if exists "payments_update" on public.payments;
create policy "payments_update" on public.payments for update to authenticated
  using (public.is_finance()) with check (public.is_finance());
-- Only Super Admin and Admin can delete payments (e.g. Clear Fees Collected);
-- the bursary can view, record and verify, but not delete.
drop policy if exists "payments_delete" on public.payments;
create policy "payments_delete" on public.payments for delete to authenticated
  using (public.is_admin());

-- Notices: everyone reads; finance team and admins post (e.g. bursary sends fee details)
drop policy if exists "notices_select" on public.notices;
create policy "notices_select" on public.notices for select to authenticated using (true);
drop policy if exists "notices_write" on public.notices;
create policy "notices_write" on public.notices for all to authenticated
  using (public.is_finance()) with check (public.is_finance());

-- ---------- 14) Storage bucket for payment proofs (receipts: images/PDFs) ----------
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- Parents upload proofs into a folder named with their own user id;
-- the finance team (Super Admin, Admin, Bursary) can view/download them.
drop policy if exists "proofs_upload_own" on storage.objects;
create policy "proofs_upload_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "proofs_read" on storage.objects;
create policy "proofs_read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_finance()));

drop policy if exists "proofs_update_own" on storage.objects;
create policy "proofs_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "proofs_delete_own" on storage.objects;
create policy "proofs_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

-- Public bucket for school assets (e.g. the proprietor's signature used on
-- report cards). Anyone can view; only Super Admin/Admin can upload or remove.
insert into storage.buckets (id, name, public)
values ('school-assets', 'school-assets', true)
on conflict (id) do nothing;

drop policy if exists "school_assets_read" on storage.objects;
create policy "school_assets_read" on storage.objects for select to public
  using (bucket_id = 'school-assets');

drop policy if exists "school_assets_insert" on storage.objects;
create policy "school_assets_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'school-assets' and public.is_admin());

drop policy if exists "school_assets_update" on storage.objects;
create policy "school_assets_update" on storage.objects for update to authenticated
  using (bucket_id = 'school-assets' and public.is_admin())
  with check (bucket_id = 'school-assets' and public.is_admin());

drop policy if exists "school_assets_delete" on storage.objects;
create policy "school_assets_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'school-assets' and public.is_admin());

-- Public bucket for student passport photos (shown on report cards).
-- Anyone can view; only staff (Super Admin, Admin, Teachers) can upload/remove.
insert into storage.buckets (id, name, public)
values ('student-passports', 'student-passports', true)
on conflict (id) do nothing;

drop policy if exists "passports_read" on storage.objects;
create policy "passports_read" on storage.objects for select to public
  using (bucket_id = 'student-passports');

drop policy if exists "passports_insert" on storage.objects;
create policy "passports_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-passports' and public.is_staff());

drop policy if exists "passports_update" on storage.objects;
create policy "passports_update" on storage.objects for update to authenticated
  using (bucket_id = 'student-passports' and public.is_staff())
  with check (bucket_id = 'student-passports' and public.is_staff());

drop policy if exists "passports_delete" on storage.objects;
create policy "passports_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'student-passports' and public.is_staff());

-- ---------- 15) Auto-create a profile for every new login account ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 16) FIRST-TIME SETUP: make yourself the Super Admin ----------
-- Create your user in Authentication -> Users -> Add user (tick
-- "Auto Confirm User"), then run this line with your email:
-- update public.profiles set role = 'super_admin' where email = 'YOUR-EMAIL@example.com';
`;
