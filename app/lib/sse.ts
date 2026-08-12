export type RawSseEvent = {
    eventName?: string;
    data: string;
};

function parseSseEventBlock(eventBlock: string): RawSseEvent | undefined {
    let eventName: string | undefined;
    const dataLines: string[] = [];

    eventBlock.split(/\r?\n/).forEach((rawLine) => {
        const line = rawLine.trimEnd();
        if (!line || line.startsWith(":")) {
            return;
        }

        if (line.startsWith("event:")) {
            eventName = line.slice(6).trim() || undefined;
            return;
        }

        if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
        }
    });

    if (!dataLines.length) {
        return;
    }

    return {
        eventName,
        data: dataLines.join("\n"),
    };
}

export async function readSseStream(
    stream: ReadableStream<Uint8Array>,
    onEvent: (event: RawSseEvent) => void,
) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        if (!value) {
            continue;
        }

        buffer += decoder.decode(value, { stream: true });
        const eventBlocks = buffer.split(/\r?\n\r?\n/);
        buffer = eventBlocks.pop() ?? "";

        eventBlocks.forEach((eventBlock) => {
            const event = parseSseEventBlock(eventBlock);
            if (event) {
                onEvent(event);
            }
        });
    }

    buffer += decoder.decode();
    if (!buffer.trim()) {
        return;
    }

    const event = parseSseEventBlock(buffer);
    if (event) {
        onEvent(event);
    }
}
