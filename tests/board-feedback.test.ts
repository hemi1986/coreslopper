// The board's feedback while it waits for the server (ST-022): the view spinner and busy buttons in
// packages/cli/src/board/lib.js. No DOM library is installed, so a small fake document stands in for the page.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  attributes = new Map<string, string>();
  className = '';
  textContent = '';
  disabled = false;
  private listeners = new Map<string, ((event: unknown) => unknown)[]>();
  classList = {
    add: (name: string) => { if (!this.classList.contains(name)) this.className = (this.className + ' ' + name).trim(); },
    remove: (name: string) => { this.className = this.className.split(' ').filter((c) => c && c !== name).join(' '); },
    contains: (name: string) => this.className.split(' ').includes(name),
  };
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  addEventListener(type: string, fn: (event: unknown) => unknown) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  appendChild(child: FakeElement | { data: string }) {
    if (child instanceof FakeElement) { child.parentNode = this; this.children.push(child); }
    else this.textContent += child.data;
    return child;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }
  querySelector(selector: string): FakeElement | null {
    if (selector.startsWith('button')) return this.find((e) => e.tagName === 'BUTTON' && (e.getAttribute('type') ?? 'submit') === 'submit');
    return null;
  }
  find(test: (e: FakeElement) => boolean): FakeElement | null {
    for (const child of this.children) { if (test(child)) return child; const deep = child.find(test); if (deep) return deep; }
    return null;
  }
  spinners() { return this.children.filter((c) => c.classList.contains('spinner') || c.classList.contains('view-spinner')); }
}

const byId = new Map<string, FakeElement>();
type Handler = (event: unknown) => unknown;
interface BoardLib {
  LOADING_DELAY: number;
  loading(work: Promise<unknown>): Promise<unknown>;
  pending(run: Handler, options?: { spinner: boolean }): Handler;
  el(tag: string, attrs: Record<string, unknown>, children?: unknown[]): FakeElement;
  setLang(code: string | null): void;
  t(key: string): string;
}
let lib: BoardLib;

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: (tag: string) => new FakeElement(tag),
    createTextNode: (data: string) => ({ data }),
    getElementById: (id: string) => byId.get(id) ?? null,
    documentElement: new FakeElement('html'),
  });
  // @ts-expect-error the board's page modules are plain JS without type declarations
  lib = (await import('../packages/cli/src/board/lib.js')) as BoardLib;
});

beforeEach(() => {
  vi.useFakeTimers();
  byId.set('main', new FakeElement('main'));
  byId.set('status', new FakeElement('div'));
});
afterEach(() => { vi.useRealTimers(); });

const main = () => byId.get('main')!;
const status = () => byId.get('status')!;

function deferred<T = unknown>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('the view spinner', () => {
  it('shows nothing when the view answers within 200 ms', async () => {
    const view = deferred();
    const done = lib.loading(view.promise);
    await vi.advanceTimersByTimeAsync(150);
    view.resolve(undefined);
    await done;
    await vi.advanceTimersByTimeAsync(100);
    expect(main().spinners()).toHaveLength(0);
    expect(main().classList.contains('loading')).toBe(false);
    expect(status().textContent).toBe('');
  });

  it('shows the spinner after 200 ms, announces it, and removes it when the view answers', async () => {
    const view = deferred();
    const done = lib.loading(view.promise);
    await vi.advanceTimersByTimeAsync(lib.LOADING_DELAY);
    expect(main().spinners()).toHaveLength(1);
    expect(main().spinners()[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(main().classList.contains('loading')).toBe(true);
    expect(['lädt …', 'loading …']).toContain(status().textContent);
    view.resolve(undefined);
    await done;
    expect(main().spinners()).toHaveLength(0);
    expect(main().classList.contains('loading')).toBe(false);
    expect(status().textContent).toBe('');
  });

  it('leaves one spinner when a newer view starts before the older one answers', async () => {
    const first = deferred(), second = deferred();
    const one = lib.loading(first.promise);
    await vi.advanceTimersByTimeAsync(lib.LOADING_DELAY);
    const two = lib.loading(second.promise);
    expect(main().spinners()).toHaveLength(0);
    first.resolve(undefined);
    await one;
    await vi.advanceTimersByTimeAsync(lib.LOADING_DELAY);
    expect(main().spinners()).toHaveLength(1);
    second.resolve(undefined);
    await two;
    expect(main().spinners()).toHaveLength(0);
    expect(status().textContent).toBe('');
  });

  it('has its label in German and English', () => {
    lib.setLang('de');
    expect(lib.t('loading')).toBe('lädt …');
    lib.setLang('en');
    expect(lib.t('loading')).toBe('loading …');
  });
});

describe('a button that sends a request', () => {
  function click(button: FakeElement, handler: Handler) {
    return handler({ currentTarget: button, preventDefault() {} });
  }

  it('is disabled with a spinner until the answer arrives, and a double click sends one request', async () => {
    const button = lib.el('button', { text: 'Save' });
    const answer = deferred();
    const send = vi.fn(() => answer.promise);
    const handler = lib.pending(send);
    const done = click(button, handler);
    click(button, handler);
    expect(send).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.spinners()).toHaveLength(1);
    expect(button.textContent).toBe('Save');
    answer.resolve(undefined);
    await done;
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.spinners()).toHaveLength(0);
    click(button, handler);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('is enabled again after a refusal, which shows where the view shows it', async () => {
    const button = lib.el('button', { text: 'Use' });
    const message = lib.el('p', {});
    const handler = lib.pending(() => Promise.reject(new Error('refused')).catch((e: Error) => { message.textContent = e.message; }));
    await click(button, handler);
    expect(message.textContent).toBe('refused');
    expect(button.disabled).toBe(false);
    expect(button.spinners()).toHaveLength(0);
  });

  it('stays as it is when nothing is sent (a declined confirm)', () => {
    const button = lib.el('button', { text: 'Delete' });
    click(button, lib.pending(() => undefined));
    expect(button.disabled).toBe(false);
    expect(button.spinners()).toHaveLength(0);
  });

  it('shows no spinner for an upload, which keeps its percentage', async () => {
    const button = lib.el('button', { text: 'Upload' });
    const answer = deferred();
    const done = click(button, lib.pending(() => answer.promise, { spinner: false }));
    expect(button.disabled).toBe(true);
    expect(button.spinners()).toHaveLength(0);
    answer.resolve(undefined);
    await done;
    expect(button.disabled).toBe(false);
  });

  it('on a form, stops the page submit and busies the submit button', async () => {
    const submit = lib.el('button', { type: 'submit', text: 'Create' });
    const form = lib.el('form', {}, [submit]);
    const answer = deferred();
    const send = vi.fn(() => answer.promise);
    const handler = lib.pending(send);
    const prevented = vi.fn();
    const done = handler({ currentTarget: form, preventDefault: prevented });
    handler({ currentTarget: form, preventDefault: prevented });
    expect(prevented).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(submit.disabled).toBe(true);
    expect(submit.spinners()).toHaveLength(1);
    answer.resolve(undefined);
    await done;
    expect(submit.disabled).toBe(false);
  });
});
