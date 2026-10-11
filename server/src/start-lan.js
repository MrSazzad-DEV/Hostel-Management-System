import "./config.js";

process.env.SERVE_CLIENT = "true";
await import("./index.js");
