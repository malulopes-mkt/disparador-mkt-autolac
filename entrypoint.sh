#!/bin/sh
npx prisma migrate deploy --schema ./prisma/schema.prisma 2>/dev/null || npx prisma db push --schema ./prisma/schema.prisma --accept-data-loss
exec node server.js
