import { useState } from 'react';
import { FlaskConical, Layers, ShieldCheck } from 'lucide-react';
import { ConversionResultPanel } from '../components/ConversionResult';
import { SvgDropzone, type SvgInput } from '../components/SvgDropzone';
import { NextCard, Stat , plural } from '../components/ui';
import { STATS, formatPct } from '../site';
import { listIconSets, totalIconCount } from '../library/iconSets';
import { useDocumentTitle } from '../hooks';

export function ConvertPage() {
  useDocumentTitle('SVG to Excalidraw — convert any SVG to editable shapes');
  const [input, setInput] = useState<SvgInput | null>(null);
  const setCount = listIconSets().length;
  const iconCount = totalIconCount();

  return (
    <main className="page page-convert">
      <section className="hero">
        <h1 className="hero-title">
          Convert any SVG to <span className="hero-accent">Excalidraw</span>
        </h1>
        <p className="hero-sub">
          Real editable shapes — not an embedded image. Drop a file and paste it straight
          onto your canvas.
        </p>

        <SvgDropzone onAccept={setInput} compact={Boolean(input)} />

        <p className="hero-privacy">
          <ShieldCheck size={14} aria-hidden="true" />
          Runs entirely in your browser. <span className="hero-privacy-nobr">Your file is never uploaded.</span>
        </p>
      </section>

      {input && <ConversionResultPanel key={input.source} input={input} />}

      <section className="next-steps">
        <NextCard to="/icons" icon={Layers} title="Need a whole icon set?">
          {iconCount} icons across {plural(setCount, 'ready-made set')}. Browse, restyle the
          lot at once and export an Excalidraw library.
        </NextCard>

        <NextCard to="/methodology" icon={FlaskConical} title="Wondering if it's accurate?">
          {STATS.tortureCount} edge cases built to break it, each one compared pixel by pixel
          against a real renderer. All the results are here, including the{' '}
          {STATS.tortureExpectedFailures} that fail on purpose.
        </NextCard>
      </section>

      <section className="stat-strip" aria-label="Conversion accuracy">
        <Stat value={formatPct(STATS.iconMeanError)}>
          mean shape error across every icon in every set
        </Stat>
        <Stat value={STATS.tortureCount}>edge cases in the test suite</Stat>
        <Stat value={STATS.tortureExpectedFailures}>
          that fail on purpose, to hold a known limit in place
        </Stat>
      </section>
    </main>
  );
}
