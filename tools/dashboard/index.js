#!/usr/bin/env node
// tools/dashboard/index.js — entry point
import { PATHS } from './config.js';
import { startServer } from './server.js';
const port = Number(process.argv[2]) || (process.env.DASHBOARD_PORT ? Number(process.env.DASHBOARD_PORT) : 8787);
const server = startServer(port);
// Keep the process alive (defensive; the listening socket should suffice)
setInterval(() => {}, 60000);
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });