import { useState } from 'react';
import { ArrowRight, FlaskConical, Layers, ShieldCheck } from 'lucide-react';
import { ConversionResultPanel } from '../components/ConversionResult';
import { SvgDropzone, type SvgInput } from '../components/SvgDropzone';
import { Link } from '../router';
import { STATS, formatPct } from '../site';
import { listIconSets, totalIconCount } from '../utils/iconSets';

export function ConvertPage() {
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
          Runs entirely in your browser. Your file is never uploaded.
        </p>
      </section>

      {input && <ConversionResultPanel key={input.source} input={input} />}

      <section className="next-steps">
        <Link to="/icons" className="next-card">
          <span className="next-card-icon">
            <Layers size={18} aria-hidden="true" />
          </span>
          <span className="next-card-body">
            <span className="next-card-title">
              Need a whole icon set? <ArrowRight size={15} aria-hidden="true" />
            </span>
            <span className="next-card-text">
              {iconCount} icons across {setCount} ready-made set{setCount === 1 ? '' : 's'}.
              Browse, restyle the lot at once and export an Excalidraw library.
            </span>
          </span>
        </Link>

        <Link to="/methodology" className="next-card">
          <span className="next-card-icon">
            <FlaskConical size={18} aria-hidden="true" />
          </span>
          <span className="next-card-body">
            <span className="next-card-title">
              Wondering if it's accurate? <ArrowRight size={15} aria-hidden="true" />
            </span>
            <span className="next-card-text">
              {STATS.tortureCount} edge cases built to break it, each one compared pixel by
              pixel against a real renderer. All the results are here, including the{' '}
              {STATS.tortureFailures} that fail on purpose.
            </span>
          </span>
        </Link>
      </section>

      <section className="stat-strip" aria-label="Conversion accuracy">
        <div className="stat">
          <span className="stat-value">{formatPct(STATS.iconMeanError)}</span>
          <span className="stat-label">mean shape error across {STATS.iconCount} icons</span>
        </div>
        <div className="stat">
          <span className="stat-value">{STATS.tortureCount}</span>
          <span className="stat-label">edge cases in the test suite</span>
        </div>
        <div className="stat">
          <span className="stat-value">{STATS.tortureFailures}</span>
          <span className="stat-label">that fail on purpose, to hold a known limit in place</span>
        </div>
      </section>
    </main>
  );
}
