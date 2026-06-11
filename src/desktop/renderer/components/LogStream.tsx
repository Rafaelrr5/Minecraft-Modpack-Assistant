/** Live capability output pane (spec 0022, FR-6). Subscribes to streamed `onLog` chunks. */
import { useEffect, useRef, useState } from 'react';

export function LogStream(): JSX.Element {
  const [lines, setLines] = useState<string>('');
  const endRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const unsubscribe = window.mpa.onLog((_sessionId, text) => {
      setLines((prev) => prev + text);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    endRef.current?.scrollTo({ top: endRef.current.scrollHeight });
  }, [lines]);

  return (
    <pre ref={endRef} className="logstream" aria-label="Live output">
      {lines || 'No output yet. Run an action to see live progress here.'}
    </pre>
  );
}
