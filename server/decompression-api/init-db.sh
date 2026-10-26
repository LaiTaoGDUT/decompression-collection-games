#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 <<'SQL'
\getenv app_password GAME_API_DB_PASSWORD
CREATE ROLE decompression_api LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE decompression_api OWNER TO decompression_api;
GRANT CONNECT ON DATABASE decompression_api TO decompression_api;
SQL
