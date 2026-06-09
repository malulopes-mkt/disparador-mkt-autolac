#!/bin/sh
./node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma 2>/dev/null || ./node_modules/.bin/prisma db push --schema ./prisma/schema.prisma --accept-data-loss
exec node server.js
