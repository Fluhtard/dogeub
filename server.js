import dotenv from "dotenv";

import Fastify from "fastify";

import fastifyStatic from "@fastify/static";

import fastifyCookie from "@fastify/cookie";

import { join } from "node:path";

import { createServer, ServerResponse } from "node:http";

import { logging, server as wisp } from "@mercuryworkshop/wisp-js/server";

import createBareServer from "@tomphttp/bare-server-node";

import { MasqrMiddleware } from "./masqr.js";

dotenv.config();

ServerResponse.prototype.setMaxListeners(50);

const port = process.env.PORT ? Number(process.env.PORT) : 2345;

// Allow both Node's HTTP server and Bare-server to co-exist
const httpServer = createServer();
const bare = createBareServer("/seal/");

logging.set_level(logging.NONE);

Object.assign(wisp.options, {
  dns_method: "resolve",
  dns_servers: ["1.1.1.3", "1.0.0.3"],
  dns_result_order: "ipv4first",
});

httpServer.on("upgrade", (req, sock, head) =>
  bare.shouldRoute(req) ? bare.routeUpgrade(req, sock, head)
  : req.url.endsWith("/wisp/") ? wisp.routeRequest(req, sock, head)
  : sock.end()
);

const app = Fastify({
  serverFactory: h => (httpServer.on("request", (req, res) =>
    bare.shouldRoute(req) ? bare.routeRequest(req, res) : h(req, res)
  ), httpServer),
  logger: false
});

await app.register(fastifyCookie);

[
  { root: join(import.meta.dirname, "dist"), prefix: "/", decorateReply: true },
].forEach(r => app.register(fastifyStatic, { ...r, decorateReply: r.decorateReply||false }));

if (process.env.MASQR === "true")
  app.addHook("onRequest", MasqrMiddleware);

// Simple HTTP health check endpoint
app.get("/health", async () => {
  return "OK";
});

const proxy = (url, type="application/javascript") => async (req, reply) => {
  try {
    const res = await fetch(url(req)); if (!res.ok) return reply.code(res.status).send();

    if (res.headers.get("content-type")) reply.type(res.headers.get("content-type")); else reply.type(type);

    return reply.send(Buffer.from(await res.arrayBuffer()));
  } catch {
    return reply.code(500).send();
  }
};

app.get("/assets/img/*", proxy(req => `https://dogeub-assets.pages.dev/img/${req.params["*"]}`, ""));
app.get("/js/script.js", proxy(()=> "https://byod.privatedns.org/js/script.js"));

app.get("/return", async (req, reply) =>
  req.query?.q
    ? fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(req.query.q)}`)
        .then(r => r.json()).catch(()=>reply.code(500).send({error:"request failed"}))
    : reply.code(401).send({ error: "query parameter?" })
);

app.setNotFoundHandler((req, reply) =>
  req.raw.method==="GET" && req.headers.accept?.includes("text/html")
    ? reply.sendFile("index.html")
    : reply.code(404).send({ error: "Not Found" })
);

await app.listen({ port, host: '0.0.0.0' });
console.log(`Server running on ${port}`);
