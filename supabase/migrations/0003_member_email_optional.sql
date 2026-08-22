-- Members imported from the club's master sheet arrive with a name and a
-- member number and nothing else: the club has never collected addresses
-- for most of the roster. Requiring email forced a choice between blocking
-- the import and inventing 98 placeholder addresses that would later be
-- mistaken for real ones and mailed to.
--
-- Email stays unique (Postgres allows many NULLs under a unique index), so
-- real addresses collected later still cannot collide.
alter table members alter column email drop not null;
