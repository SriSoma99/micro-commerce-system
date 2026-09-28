import { createApp } from "./app";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 5002);
const server = createApp().listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`payment-simulator listening on http://${host}:${port} (dummy gateway: no real money moves)`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
