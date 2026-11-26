#!/usr/bin/env python
"""PgBouncer entrypoint: parses DATABASE_URL with dj_database_url (the same library
Django itself uses) instead of shell grep/cut/sed, so a password containing '@', ':'
or other special characters is handled correctly. Every other PgBouncer Docker image
we evaluated does its own naive shell-based URL parsing and breaks on exactly that
case — the real production DATABASE_URL in this project has a literal '@' in its
password, which is precisely the bug class that caused real breakage earlier in this
project's backup/restore scripts and fast-backend's own DB connector.

With auth_type = scram-sha-256, PgBouncer accepts a plaintext password in
userlist.txt and negotiates SCRAM with Postgres itself — no need to extract or
compute a SCRAM verifier here."""
import os
import sys

import dj_database_url

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    sys.exit("DATABASE_URL is required")

config = dj_database_url.parse(DATABASE_URL)
user = config["USER"]
password = config["PASSWORD"]
host = config["HOST"]
port = config["PORT"] or 5432
dbname = config["NAME"]

with open("/etc/pgbouncer/pgbouncer.ini.template", encoding="utf-8") as f:
    template = f.read()

with open("/etc/pgbouncer/pgbouncer.ini", "w", encoding="utf-8") as f:
    f.write(template.format(host=host, port=port, dbname=dbname, user=user))

# Quotes inside the password would break userlist.txt's quoted-field format; the real
# password doesn't contain one, and this keeps the file-writing logic simple and honest
# about that one unsupported case rather than silently mangling it.
if '"' in password:
    sys.exit('DATABASE_URL password must not contain a literal " character (pgbouncer userlist.txt limitation)')

with open("/etc/pgbouncer/userlist.txt", "w", encoding="utf-8") as f:
    f.write(f'"{user}" "{password}"\n')

os.execvp("pgbouncer", ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"])
