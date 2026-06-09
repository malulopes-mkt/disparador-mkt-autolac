#!/bin/sh
./node_modules/.bin/prisma db push --schema ./prisma/schema.prisma --accept-data-loss
exec node server.js
