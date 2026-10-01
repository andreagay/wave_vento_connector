import { NAME, VERSION } from "../src/version.js";

export default function handler(_req, res) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: "ok", name: NAME, version: VERSION }));
}
