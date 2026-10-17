insert into public.departments(name, code) values ('Computer Science', 'CSE'), ('Electronics', 'ECE') on conflict do nothing;
insert into public.buildings(name, code) values ('Main Academic Block', 'MAB') on conflict do nothing;
