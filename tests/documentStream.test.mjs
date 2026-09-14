import test from "node:test";
import assert from "node:assert/strict";
import { readDocumentStream } from "../app/lib/documentStream.ts";

const event = (event_id, type, content) => ({ event_id, type, content });
function stream(events, end = true) {
    return new ReadableStream({start(controller) {
        const bytes = new TextEncoder().encode(events.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join(""));
        // Split CRLF and UTF-8 characters across arbitrary network packets.
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        if (end) controller.close();
    }});
}

test("disconnect resumes the same request after its last event, without duplicate text", async () => {
    const start = event(1, "pipeline_started", { request_id: "run" });
    const text = event(2, "chunk", { text: "Текст", done: false });
    const calls = [], seen = [];
    await readDocumentStream({
        signal: new AbortController().signal, retryDelay: 0,
        open: async (params) => { calls.push(params); return calls.length === 1
            ? stream([start, text]) : stream([text, event(3, "chunk", {text: "", done: true})]); },
        onRequestId: () => {}, onRecovering: () => {}, onEvent: data => seen.push(JSON.parse(data)),
    });
    assert.deepEqual(calls, [{request_id: undefined, after_event: 0}, {request_id: "run", after_event: 2}]);
    assert.equal(seen.filter(e => e.content.text === "Текст").length, 1);
});

test("EOF without done is reported, retries are bounded", async () => {
    let calls = 0;
    await assert.rejects(readDocumentStream({
        signal: new AbortController().signal, retryDelay: 0,
        open: async () => { calls++; return stream([event(1, "pipeline_started", {request_id: "run"})]); },
        onRequestId: () => {}, onRecovering: () => {}, onEvent: () => {},
    }), /запрос не завершён/);
    assert.equal(calls, 3);
});

test("an explicit abort never reconnects", async () => {
    const controller = new AbortController(); let calls = 0;
    await assert.rejects(readDocumentStream({
        signal: controller.signal, retryDelay: 0,
        open: async () => { calls++; controller.abort(); throw new Error("aborted"); },
        onRequestId: () => {}, onRecovering: () => {}, onEvent: () => {},
    }), {name: "AbortError"});
    assert.equal(calls, 1);
});
