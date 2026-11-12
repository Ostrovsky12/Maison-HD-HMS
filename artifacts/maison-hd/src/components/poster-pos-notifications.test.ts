import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as requests from "../lib/poster-pos-request";

const source = readFileSync(new URL("./poster-pos-notifications.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  fileName: "poster-pos-notifications.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const channel = { enabled: true, online: false, spotId: 1, tabletId: 2, lastSeenAt: null };
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
type Element = { type: string; props: Record<string, any> };

function harness(request: requests.PosterPosRequest) {
  const hooks: any[] = [], effects: Array<() => void> = [], polls: Array<() => void> = [];
  let cursor = 0, firstRender = true, tree: Element;
  const exports: Record<string, any> = {};
  const jsx = (type: string, props: Record<string, any>) => ({ type, props });
  vm.runInNewContext(compiled, {
    exports, setInterval: (fn: () => void) => { polls.push(fn); return 1; }, clearInterval() {},
    require(name: string) {
      if (name === "react") return {
        useState(initial: any) {
          const index = cursor++;
          if (firstRender) hooks[index] = initial;
          return [hooks[index], (value: any) => {
            hooks[index] = typeof value === "function" ? value(hooks[index]) : value;
          }];
        },
        useRef(initial: any) {
          const index = cursor++;
          if (firstRender) hooks[index] = { current: initial };
          return hooks[index];
        },
        useEffect(fn: () => void) { if (firstRender) effects.push(fn); },
      };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "lucide-react") return { Loader2: "loader" };
      if (name === "@/lib/poster-pos-request") return requests;
      return { Button: "button", Input: "input", Label: "label", Card: "section",
        CardHeader: "header", CardContent: "main", CardTitle: "h2", CardDescription: "p" };
    },
  });
  function render() {
    cursor = 0;
    tree = exports.default({ request });
    firstRender = false;
    for (const effect of effects.splice(0)) effect();
  }
  function nodes(value: any): Element[] {
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap(child => nodes(child));
    return [value, ...nodes(value.props?.children)];
  }
  function text(value: any): string {
    if (Array.isArray(value)) return value.map(child => text(child)).join("");
    if (value && typeof value === "object") return text(value.props?.children);
    return typeof value === "string" ? value : "";
  }
  render();
  return { render, nodes: () => nodes(tree), text: (value: any = tree) => text(value), poll: () => polls[0](),
    create: () => nodes(tree).find(n => n.type === "button" && /Створити код|Створюємо код/.test(text(n)))! };
}

test("a validation failure remains visible after a successful background poll", async () => {
  const h = harness(async () => channel);
  await flush(); h.render();
  h.nodes().find(n => n.props.id === "pos-notice-tablet")!.props.onChange({ target: { value: "" } });
  h.render();
  h.create().props.onClick(); await flush(); h.render();
  assert.match(h.text(), /Вкажіть числові ID/);
  h.poll(); await flush(); h.render();
  assert.match(h.text(), /Вкажіть числові ID/);
});

test("a stale online poll cannot erase a newly created code or re-enable duplicate requests", async () => {
  let reads = 0, writes = 0;
  let finishRead: (value: unknown) => void = () => {};
  let finishWrite: (value: unknown) => void = () => {};
  const code = `1.${"a".repeat(64)}`;
  const h = harness(async (_path, opts) => {
    if (opts?.method === "PUT") {
      writes++;
      return new Promise(resolve => { finishWrite = resolve; });
    }
    if (++reads === 1) return channel;
    return new Promise(resolve => { finishRead = resolve; });
  });
  await flush(); h.render();
  h.poll();
  const click = h.create().props.onClick;
  click(); click(); h.render();
  assert.equal(writes, 1);
  assert.equal(h.create().props.disabled, true);
  assert.match(h.text(), /Створюємо код/);
  finishWrite({ ...channel, pairingCode: code }); await flush(); h.render();
  finishRead({ ...channel, online: true }); await flush(); h.render();
  assert.equal(h.nodes().find(n => n.props.id === "pos-pair-code")?.props.value, code);
  assert.equal(h.create().props.disabled, false);
});

test("an initial loading failure can be retried and restores the register fields", async () => {
  let reads = 0;
  const h = harness(async () => {
    if (++reads === 1) throw new Error("Fixture offline");
    return channel;
  });
  await flush(); h.render();
  assert.match(h.text(), /Fixture offline/);
  assert.equal(h.create().props.disabled, true);
  h.nodes().find(n => n.type === "button" && h.text(n) === "Оновити стан каси")!.props.onClick();
  await flush(); h.render();
  assert.equal(h.nodes().find(n => n.props.id === "pos-notice-tablet")?.props.value, "2");
  assert.equal(h.create().props.disabled, false);
});
