import { t, uiLocale } from './i18n';
import { memo, useMemo, useRef, type ComponentProps } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import type { Element, Root, RootContent, Text } from 'hast';

const fadeDuration = 380;
type Receipt = { start: number; end: number; at: number };
type FadeHistory = { source: string; receipts: Receipt[] };
function FadeSpan({node,...props}:ComponentProps<'span'> & ExtraProps) {
  const born=Number(node?.properties['data-stream-born']);
  const delay=useMemo(()=>Number.isFinite(born)?-Math.max(0,performance.now()-born):0,[born]);
  return <span key={Number.isFinite(born)?`${born}:${node?.properties['data-stream-start']}`:undefined} {...props} style={Number.isFinite(born)?{...props.style,animationDelay:`${delay}ms`}:props.style}/>;
}
const components: Components = {
  span: FadeSpan,
  a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,
  img: ({ alt }) => <span className="muted">{t("[изображение: ")}{alt}]</span>
};

// Annotate the existing Markdown text leaves; Markdown is still parsed as one
// document, so emphasis, links, lists and code can span arbitrary SSE fragments.
// Source offsets and elapsed time stop a reparse from fading old words again.
function fadePlugin({ source, receipts }: { source: string; receipts: Receipt[] }) {
  return (tree: Root) => {
    function visit(parent: Root | Element) {
      const children: RootContent[] = [];
      for (const node of parent.children) {
        if (node.type === 'element') visit(node);
        const start = node.position?.start.offset, end = node.position?.end.offset;
        if (node.type !== 'text' || start === undefined || end === undefined) { children.push(node); continue; }
        const recent = receipts.filter(r => r.end > start && r.start < end);
        if (!recent.length) { children.push(node); continue; }
        // Escapes and HTML entities have different source/display lengths. Keep
        // those intact instead of slicing at a potentially incorrect boundary.
        if (source.slice(start, end) !== node.value) { children.push(node); continue; }
        let cursor = 0;
        for (const receipt of recent) {
          const from = Math.max(cursor, receipt.start - start, 0);
          const to = Math.min(node.value.length, receipt.end - start);
          if (to <= from) continue;
          if (from > cursor) children.push({ type: 'text', value: node.value.slice(cursor, from) } as Text);
          children.push({ type: 'element', tagName: 'span', properties: {
            className: ['stream-fade'], 'data-stream-born': receipt.at,
            'data-stream-start': start + from
          }, children: [{ type: 'text', value: node.value.slice(from, to) }] } as Element);
          cursor = to;
        }
        if (cursor < node.value.length) children.push({ type: 'text', value: node.value.slice(cursor) } as Text);
      }
      parent.children = children;
    }
    visit(tree);
  };
}

const MessageMarkdown = memo(function MessageMarkdown({ content, streaming }: { content: string; streaming: boolean }) {
  const history = useRef<FadeHistory>({ source: streaming ? '' : content, receipts: [] });
  const now = performance.now();
  const previous = history.current;
  let receipts = previous.receipts.filter(r => now - r.at < fadeDuration);
  if (!content.startsWith(previous.source)) receipts = [];
  if (streaming && content.length > previous.source.length && content.startsWith(previous.source)) {
    receipts.push({ start: previous.source.length, end: content.length, at: now });
  }
  history.current = { source: content, receipts };
  return <ReactMarkdown components={components} rehypePlugins={receipts.length ? [[fadePlugin, { source: content, receipts }]] : []}>{content}</ReactMarkdown>;
});

export default MessageMarkdown;
