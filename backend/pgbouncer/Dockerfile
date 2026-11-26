FROM python:3.12-alpine
RUN apk add --no-cache pgbouncer postgresql-client
RUN pip install --no-cache-dir dj-database-url==3.1.2
COPY entrypoint.py /entrypoint.py
COPY pgbouncer.ini.template /etc/pgbouncer/pgbouncer.ini.template
EXPOSE 6432
ENTRYPOINT ["python", "/entrypoint.py"]
