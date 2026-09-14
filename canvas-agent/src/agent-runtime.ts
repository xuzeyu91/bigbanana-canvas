const ANSI_ESCAPE = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export function redactAgentLog(text: string) {
    return text
        .replace(ANSI_ESCAPE, "")
        .replace(/(authorization\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\r\n,;]+)/gi, "$1[REDACTED]")
        .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[REDACTED]")
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
        .replace(/((?:api[ _-]*key|token)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[REDACTED]");
}

export function createAgentLogWriter(emit: (text: string) => void) {
    let buffer = "";
    const send = (text: string) => emit(redactAgentLog(text));
    return {
        write(text: string) {
            buffer += text;
            let newline = buffer.indexOf("\n");
            while (newline >= 0) {
                send(buffer.slice(0, newline + 1));
                buffer = buffer.slice(newline + 1);
                newline = buffer.indexOf("\n");
            }
        },
        flush() {
            if (buffer) send(buffer);
            buffer = "";
        },
    };
}
