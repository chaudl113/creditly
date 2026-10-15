export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3101").replace(/\/$/, "");
