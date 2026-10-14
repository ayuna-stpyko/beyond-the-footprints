type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/** 小さな DOM ビルダー: h('div.cls.cls2', { onclick }, ...children) */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K | `${K}.${string}`,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const [name, ...classes] = tag.split('.');
  // tag の先頭は K なので、split した name も K
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const el = document.createElement(name as K);
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ` ${String(v)}`;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

export const img = (src: string, cls = '') => h('img', { src, alt: '', class: cls || undefined });

/** トーストを表示しておく時間 */
const TOAST_MS = 1800;

export function toast(message: string) {
  const el = h('div.toast', {}, message);
  document.body.append(el);
  setTimeout(() => el.remove(), TOAST_MS);
}
