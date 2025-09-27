import http from 'http';
import type { Agent } from '../core/agent';
import { createAgentServer } from './core';
import type { AgentServerOptions, NextRequestBody } from './types';

export function createHttpServer(agent: Agent, opts: AgentServerOptions = {}) {
  const serverCore = createAgentServer(agent, opts);
  const server = http.createServer(async (req, res) => {
    try {
      const url = req.url || '/';
      const method = req.method || 'GET';

      // CORS (simple)
      res.setHeader('Access-Control-Allow-Origin', opts.cors?.origin || '*');
      res.setHeader('Access-Control-Allow-Headers', (opts.cors?.allowHeaders || ['Content-Type']).join(','));
      res.setHeader('Access-Control-Allow-Methods', (opts.cors?.allowMethods || ['GET','POST','OPTIONS']).join(','));
      if (method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

      const isNext = method === 'POST' && url === `${serverCore.base}/next`;
      const isStream = method === 'POST' && url === `${serverCore.base}/stream`;

      if (!isNext && !isStream) {
        res.statusCode = 404; res.end('Not Found'); return;
      }

      let body = '';
      for await (const chunk of req) body += chunk;
      const parsed = body ? (JSON.parse(body) as NextRequestBody) : {};

      if (isNext) {
        const out = await serverCore.handleNext(parsed);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(out));
        return;
      }

      if (isStream) {
        res.statusCode = 200;
        res.setHeader('Content-Type', serverCore.streamCT);
        // NDJSON streaming
        await serverCore.handleStream(parsed, (e) => {
          res.write(JSON.stringify(e) + '\n');
        });
        res.end();
        return;
      }
    } catch (e: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e?.message || String(e) }));
    }
  });
  return server;
}

