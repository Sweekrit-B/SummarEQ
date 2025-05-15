// api/index.ts
import { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../app";
import { Server } from "http";
import { createServer } from "http";

let server: Server;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!server) {
    server = createServer(app);
  }
  server.emit("request", req, res);
}
