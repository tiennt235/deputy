import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * An async-iterable queue used to feed the Agent SDK's streaming input mode.
 * The orchestrator pushes user messages over time (initial prompt + follow-up
 * guidance); the SDK consumes them via `for await`.
 */
export class InputQueue implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = [];
  private resolvers: Array<(r: IteratorResult<SDKUserMessage>) => void> = [];
  private closed = false;

  push(text: string): void {
    if (this.closed) return;
    const msg = {
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      session_id: "",
    } as unknown as SDKUserMessage;
    const resolver = this.resolvers.shift();
    if (resolver) resolver({ value: msg, done: false });
    else this.queue.push(msg);
  }

  hasPending(): boolean {
    return this.queue.length > 0;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  close(): void {
    this.closed = true;
    let resolver = this.resolvers.shift();
    while (resolver) {
      resolver({ value: undefined as any, done: true });
      resolver = this.resolvers.shift();
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
        continue;
      }
      if (this.closed) return;
      const next = await new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
        this.resolvers.push(resolve);
      });
      if (next.done) return;
      yield next.value;
    }
  }
}
