import type { Agent } from '../core/agent';
import type { AgentServerOptions, NextRequestBody } from './types';
import { createAgentServer } from './core';
import express from 'express';

export function createExpressRouter(agent: Agent, opts: AgentServerOptions = {}) {
  const serverCore = createAgentServer(agent, opts);
  const router = express.Router();

  router.post(serverCore.base + '/next', async (req, res) => {
    try {
      const body = (req.body || {}) as NextRequestBody;
      const out = await serverCore.handleNext(body);
      res.status(200).json(out);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  router.post(serverCore.base + '/stream', async (req, res) => {
    try {
      const body = (req.body || {}) as NextRequestBody;
      res.status(200);
      res.setHeader('Content-Type', serverCore.streamCT);
      await serverCore.handleStream(body, (ev) => {
        res.write(JSON.stringify(ev) + '\n');
      });
      res.end();
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  return router;
}

