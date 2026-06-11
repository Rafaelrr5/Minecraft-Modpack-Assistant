/**
 * Contract tests for the NVIDIA chat-model adapter — driven through an injected transport so
 * they need no network (Constitution P3). They cover response mapping, the request body +
 * Authorization header shape (including sampling + `extraBody` passthrough), 429 backoff, the
 * missing-key error, and the guarantee that the API key is never logged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NvidiaChatModel, createNvidiaChatModel } from './nvidia-chat-model.ts';
import type { LogFields, Logger } from '../../core/ports/logger.ts';

const FAKE_KEY = 'nvapi-TEST-SECRET-DO-NOT-LOG-0123456789';

const completionFixture = {
  id: 'chatcmpl-test',
  model: 'deepseek-ai/deepseek-v4-pro',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Hello from DeepSeek.' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('complete maps an OpenAI-compatible response to a ChatCompletion (AC-1)', async () => {
  const fetchStub: typeof fetch = () => Promise.resolve(jsonResponse(completionFixture));
  const model = new NvidiaChatModel({ apiKey: FAKE_KEY, fetch: fetchStub });

  const result = await model.complete({ messages: [{ role: 'user', content: 'hi' }] });

  assert.equal(result.content, 'Hello from DeepSeek.');
  assert.equal(result.model, 'deepseek-ai/deepseek-v4-pro');
  assert.equal(result.finishReason, 'stop');
  assert.deepEqual(result.usage, { promptTokens: 11, completionTokens: 7, totalTokens: 18 });
  assert.equal(model.id, 'nvidia');
});

test('request carries model, mapped sampling, merged extraBody, stream:false and a Bearer key (AC-2)', async () => {
  let captured: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | undefined;
  const fetchStub: typeof fetch = (input, init) => {
    captured = {
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    };
    return Promise.resolve(jsonResponse(completionFixture));
  };

  const model = new NvidiaChatModel({
    apiKey: FAKE_KEY,
    fetch: fetchStub,
    extraBody: { chat_template_kwargs: { thinking: false } },
  });

  await model.complete({
    messages: [
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
    ],
    sampling: { temperature: 1, topP: 0.95, maxTokens: 16384, stop: ['END'] },
  });

  assert.ok(captured);
  assert.ok(captured.url.endsWith('/chat/completions'));
  assert.equal(captured.headers.Authorization, `Bearer ${FAKE_KEY}`);

  const body = captured.body;
  assert.equal(body.model, 'deepseek-ai/deepseek-v4-pro');
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 1);
  assert.equal(body.top_p, 0.95);
  assert.equal(body.max_tokens, 16384);
  assert.deepEqual(body.stop, ['END']);
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'be brief' },
    { role: 'user', content: 'hi' },
  ]);
  assert.deepEqual(body.chat_template_kwargs, { thinking: false });
});

test('honors a 429 Retry-After with a bounded retry, without a real delay (AC-3)', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const fetchStub: typeof fetch = () => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve(
        new Response('rate limited', { status: 429, headers: { 'Retry-After': '2' } }),
      );
    }
    return Promise.resolve(jsonResponse(completionFixture));
  };

  const model = new NvidiaChatModel({
    apiKey: FAKE_KEY,
    fetch: fetchStub,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });

  const result = await model.complete({ messages: [{ role: 'user', content: 'hi' }] });

  assert.equal(calls, 2); // retried exactly once
  assert.deepEqual(sleeps, [2000]); // waited per Retry-After (2s) via the injected sleep
  assert.equal(result.content, 'Hello from DeepSeek.');
});

test('factory throws a clear error when no API key is configured (AC-4)', () => {
  const previous = process.env.NVIDIA_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  try {
    assert.throws(() => createNvidiaChatModel(), /NVIDIA_API_KEY|NVIDIA API key/);
  } finally {
    if (previous !== undefined) process.env.NVIDIA_API_KEY = previous;
  }
});

test('the API key never appears in any log record (AC-5)', async () => {
  const records: Array<{ message: string; fields?: LogFields }> = [];
  const capture = (message: string, fields?: LogFields): void => {
    records.push({ message, ...(fields ? { fields } : {}) });
  };
  const capturingLogger: Logger = {
    debug: capture,
    info: capture,
    warn: capture,
    error: capture,
    child() {
      return capturingLogger;
    },
  };

  const fetchStub: typeof fetch = () => Promise.resolve(jsonResponse(completionFixture));
  const model = new NvidiaChatModel({ apiKey: FAKE_KEY, fetch: fetchStub, logger: capturingLogger });

  await model.complete({ messages: [{ role: 'user', content: 'secret prompt' }] });

  const serialized = JSON.stringify(records);
  assert.ok(records.length > 0, 'expected at least one log record');
  assert.ok(!serialized.includes(FAKE_KEY), 'API key leaked into a log record');
});

// --- Tool-calling (spec 0017, FR-10) ----------------------------------------

const toolCallFixture = {
  id: 'chatcmpl-tools',
  model: 'deepseek-ai/deepseek-v4-pro',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'resolve_mods', arguments: '{"include":["sodium"]}' },
          },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
};

test('renders request.tools + toolChoice to the OpenAI wire shape (0017 FR-10)', async () => {
  let body: Record<string, unknown> | undefined;
  const fetchStub: typeof fetch = (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Promise.resolve(jsonResponse(completionFixture));
  };
  const model = new NvidiaChatModel({ apiKey: FAKE_KEY, fetch: fetchStub });

  await model.complete({
    messages: [{ role: 'user', content: 'build me a pack' }],
    tools: [
      {
        name: 'resolve_mods',
        description: 'Resolve a mod list into a pinned pack state.',
        parameters: {
          type: 'object',
          properties: { include: { type: 'array' } },
          required: ['include'],
        },
      },
    ],
    toolChoice: 'auto',
  });

  assert.ok(body);
  assert.deepEqual(body.tools, [
    {
      type: 'function',
      function: {
        name: 'resolve_mods',
        description: 'Resolve a mod list into a pinned pack state.',
        parameters: {
          type: 'object',
          properties: { include: { type: 'array' } },
          required: ['include'],
        },
      },
    },
  ]);
  assert.equal(body.tool_choice, 'auto');
});

test('parses tool_calls from a completion, tolerating null content (0017 FR-10)', async () => {
  const fetchStub: typeof fetch = () => Promise.resolve(jsonResponse(toolCallFixture));
  const model = new NvidiaChatModel({ apiKey: FAKE_KEY, fetch: fetchStub });

  const result = await model.complete({ messages: [{ role: 'user', content: 'go' }] });

  assert.equal(result.content, ''); // null content normalized to '' when tool calls are present
  assert.equal(result.finishReason, 'tool_calls');
  assert.deepEqual(result.toolCalls, [
    { id: 'call_1', name: 'resolve_mods', arguments: '{"include":["sodium"]}' },
  ]);
});

test('serializes assistant tool-call turns and tool results to wire messages (0017 FR-10)', async () => {
  let body: Record<string, unknown> | undefined;
  const fetchStub: typeof fetch = (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Promise.resolve(jsonResponse(completionFixture));
  };
  const model = new NvidiaChatModel({ apiKey: FAKE_KEY, fetch: fetchStub });

  await model.complete({
    messages: [
      { role: 'user', content: 'resolve sodium' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'resolve_mods', arguments: '{"include":["sodium"]}' }],
      },
      { role: 'tool', toolCallId: 'call_1', name: 'resolve_mods', content: '{"ok":true}' },
    ],
  });

  assert.ok(body);
  assert.deepEqual(body.messages, [
    { role: 'user', content: 'resolve sodium' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'resolve_mods', arguments: '{"include":["sodium"]}' },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' },
  ]);
});

test('a plain (toolless) request still maps messages to bare { role, content } (0017 FR-10 additive)', async () => {
  let body: Record<string, unknown> | undefined;
  const fetchStub: typeof fetch = (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Promise.resolve(jsonResponse(completionFixture));
  };
  const model = new NvidiaChatModel({ apiKey: FAKE_KEY, fetch: fetchStub });

  await model.complete({ messages: [{ role: 'user', content: 'hi' }] });

  assert.ok(body);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
  assert.ok(!('tools' in body), 'no tools field when none requested');
  assert.ok(!('tool_choice' in body), 'no tool_choice field when none requested');
});
