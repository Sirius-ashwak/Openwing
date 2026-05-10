import { useEffect, useRef, useState } from 'react';

type Tone = 'red' | 'blue' | 'mute' | 'ok';

interface Line {
  prefix: string;
  tone: Tone;
  text: string;
  hold?: number;
}

const SCRIPT: Line[] = [
  { prefix: 'parse', tone: 'mute', text: 'src/api/users.py · 142 lines', hold: 700 },
  { prefix: '01 red', tone: 'red', text: "traces request.args.get('id') → execute(query)", hold: 450 },
  { prefix: '01 red', tone: 'red', text: "payload: admin' OR '1'='1 --", hold: 350 },
  { prefix: '01 red', tone: 'red', text: 'vuln: CWE-89 SQL injection · severity HIGH', hold: 850 },
  { prefix: '02 blue', tone: 'blue', text: 'reading context · generating patch', hold: 550 },
  { prefix: '02 blue', tone: 'blue', text: 'parameterized query + length cap', hold: 350 },
  { prefix: '02 blue', tone: 'blue', text: 'compile_check · pass · writing to disk', hold: 700 },
  { prefix: '03 ver', tone: 'mute', text: 're-running janus_red on patched file', hold: 550 },
  { prefix: '03 ver', tone: 'mute', text: 'no exploits found · loop terminating', hold: 600 },
  { prefix: ' ok ', tone: 'ok', text: 'users.py · 1.4s · 1 vuln resolved', hold: 2600 },
];

export function JanusDemo() {
  const [completed, setCompleted] = useState<Line[]>([]);
  const [typed, setTyped] = useState('');
  const [currentIdx, setCurrentIdx] = useState(0);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = setTimeout(() => resolve(), ms);
        const check = setInterval(() => {
          if (cancelRef.current) {
            clearTimeout(id);
            clearInterval(check);
            resolve();
          }
        }, 50);
      });

    const run = async () => {
      while (!cancelRef.current) {
        setCompleted([]);
        setTyped('');
        setCurrentIdx(0);
        await sleep(500);

        for (let i = 0; i < SCRIPT.length; i++) {
          if (cancelRef.current) return;
          const line = SCRIPT[i];
          setCurrentIdx(i);
          for (let c = 1; c <= line.text.length; c++) {
            if (cancelRef.current) return;
            setTyped(line.text.slice(0, c));
            await sleep(14 + Math.random() * 18);
          }
          await sleep(line.hold ?? 350);
          setCompleted((prev) => [...prev, line]);
          setTyped('');
        }

        await sleep(1800);
      }
    };

    void run();
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const current = currentIdx < SCRIPT.length ? SCRIPT[currentIdx] : null;
  const showCurrent = current && completed.length === currentIdx;

  return (
    <div className="ow-demo" aria-hidden>
      <div className="ow-demo__chrome">
        <div className="ow-demo__dots">
          <span /><span /><span />
        </div>
        <div className="ow-demo__path">janus.run · adversarial loop</div>
        <div className="ow-demo__live">
          <span className="ow-demo__live-dot" /> live
        </div>
      </div>
      <div className="ow-demo__body">
        {completed.map((line, i) => (
          <div key={i} className="ow-demo__line">
            <span className={`ow-demo__prefix ow-demo__prefix--${line.tone}`}>{line.prefix}</span>
            <span className="ow-demo__text">{line.text}</span>
          </div>
        ))}
        {showCurrent && current && (
          <div className="ow-demo__line ow-demo__line--current">
            <span className={`ow-demo__prefix ow-demo__prefix--${current.tone}`}>{current.prefix}</span>
            <span className="ow-demo__text">
              {typed}
              <span className="ow-demo__cursor" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
