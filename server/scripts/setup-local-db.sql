-- Run as PostgreSQL superuser (e.g. psql -U postgres -f scripts/setup-local-db.sql)
CREATE USER sneaker WITH PASSWORD 'sneaker';
CREATE DATABASE sneaker_drop OWNER sneaker;
GRANT ALL ON SCHEMA public TO sneaker;
