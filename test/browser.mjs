/**
 * A minimal Chrome driver over the DevTools Protocol, built on node builtins
 * alone. This exists instead of a browser-automation dependency because the
 * only thing it has to do is boot the shipped artifact and poke at it — and
 * because the artifact's whole promise is that it needs nothing installed.
 *
 * Not a DOM testing framework, and not a substitute for one: `smoke.test.mjs`
 * checks that the built file runs at all. Real UI verification is still done
 * by hand in a real browser (AGENTS.md, "Testing expectations").
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Where Chrome usually lives, most specific first. */
const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

/**
 * The first Chrome on this machine, or null — a fresh clone has none, and
 * the smoke test skips rather than fails.
 *
 * `CHROME_PATH` replaces the search rather than joining it: someone pointing
 * at a specific browser wants that browser, not a silent fallback to another.
 */
export async function findChrome() {
  const candidates = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : CANDIDATES;
  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next one.
    }
  }
  return null;
}

/**
 * Serve one file at `/` on a random port. The artifact is opened over HTTP
 * rather than `file://` so it gets a normal origin, and `localStorage`
 * behaves the way it does for a real user.
 */
export async function serve(file) {
  const body = await readFile(file);
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1' }, () => resolve(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}

/** Launch headless Chrome and attach to one blank page. */
export async function launch(chromePath) {
  const profile = await mkdtemp(join(tmpdir(), 'planner-smoke-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ]);

  // Chrome prints its WebSocket endpoint to stderr once it is ready.
  const endpoint = await new Promise((resolve, reject) => {
    let buffered = '';
    const timer = setTimeout(() => reject(new Error(`Chrome did not start:\n${buffered}`)), 20000);
    chrome.stderr.on('data', (chunk) => {
      buffered += chunk;
      const found = buffered.match(/ws:\/\/[^\s]+/);
      if (found) {
        clearTimeout(timer);
        resolve(found[0]);
      }
    });
    chrome.on('exit', (code) => reject(new Error(`Chrome exited with ${code}:\n${buffered}`)));
  });

  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.onopen = () => resolve(undefined);
    socket.onerror = () => reject(new Error('could not connect to Chrome'));
  });

  let nextId = 0;
  /** @type {Map<number, { resolve: Function, reject: Function }>} */
  const pending = new Map();
  /** @type {Array<(event: any) => void>} */
  const listeners = [];

  socket.onmessage = (message) => {
    const data = JSON.parse(String(message.data));
    if (data.id !== undefined) {
      const waiter = pending.get(data.id);
      pending.delete(data.id);
      if (!waiter) return;
      if (data.error) waiter.reject(new Error(data.error.message));
      else waiter.resolve(data.result);
      return;
    }
    for (const listener of listeners) listener(data);
  };

  /** Send one CDP command, optionally inside a page session. */
  const send = (method, params = {}, sessionId = undefined) => {
    const id = ++nextId;
    socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };

  const { targetId } = /** @type {any} */ (
    await send('Target.createTarget', { url: 'about:blank' })
  );
  const { sessionId } = /** @type {any} */ (
    await send('Target.attachToTarget', { targetId, flatten: true })
  );

  /** Console errors and uncaught exceptions, in the order they happened. */
  /** @type {string[]} */
  const problems = [];
  listeners.push((event) => {
    if (event.sessionId !== sessionId) return;
    if (event.method === 'Runtime.exceptionThrown') {
      const { exceptionDetails } = event.params;
      problems.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
      problems.push(event.params.args.map((a) => a.description ?? a.value).join(' '));
    }
  });

  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);

  return {
    problems,

    /** Navigate and wait for the load event. */
    async goto(url) {
      const loaded = new Promise((resolve) => {
        const onEvent = (event) => {
          if (event.sessionId === sessionId && event.method === 'Page.loadEventFired') {
            listeners.splice(listeners.indexOf(onEvent), 1);
            resolve(undefined);
          }
        };
        listeners.push(onEvent);
      });
      await send('Page.navigate', { url }, sessionId);
      await loaded;
    },

    /**
     * Evaluate an expression in the page and return its value.
     * Throws if the page threw, so a broken expression cannot pass silently.
     */
    async evaluate(expression) {
      const result = /** @type {any} */ (
        await send(
          'Runtime.evaluate',
          { expression, returnByValue: true, awaitPromise: true },
          sessionId,
        )
      );
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
        );
      }
      return result.result.value;
    },

    async close() {
      socket.close();
      chrome.kill();
      await rm(profile, { recursive: true, force: true });
    },
  };
}
