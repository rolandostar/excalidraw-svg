import { useState } from 'react';
import { ArrowRight, FlaskConical, Layers, ShieldCheck } from 'lucide-react';
import { SvgDropzone, type SvgInput } from '../components/SvgDropzone';
import { Link } from '../router';
import { STATS, formatPct } from '../site';

export function ConvertPage() {
  const [input, setInput] = useState<SvgInput | null>(null);

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

      {input && (
        <section className="result-placeholder glass-panel" aria-live="polite">
          <p>
            Loaded <strong>{input.name}</strong> ({input.source.length.toLocaleString()} bytes)
          </p>
        </section>
      )}

      <section className="next-steps">
        <Link to="/icons" className="next-card">
          <span className="next-card-icon">
            <Layers size={18} aria-hidden="true" />
          </span>
          <span className="next-card-body">
            <span className="next-card-title">
              Need Google Cloud icons? <ArrowRight size={15} aria-hidden="true" />
            </span>
            <span className="next-card-text">
              {STATS.iconCount} of them, batteries included. Browse, restyle and export a
              ready-made Excalidraw library.
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
              {STATS.tortureCount} torture cases, pixel-diffed against a real renderer.
              Results published in full — including the {STATS.tortureFailures} we
              still fail.
            </span>
          </span>
        </Link>
      </section>

      <section className="stat-strip" aria-label="Measured conversion fidelity">
        <div className="stat">
          <span className="stat-value">{formatPct(STATS.iconMeanError)}</span>
          <span className="stat-label">mean shape error across {STATS.iconCount} icons</span>
        </div>
        <div className="stat">
          <span className="stat-value">{STATS.tortureCount}</span>
          <span className="stat-label">adversarial SVGs in the regression gate</span>
        </div>
        <div className="stat">
          <span className="stat-value">{STATS.tortureFailures}</span>
          <span className="stat-label">known failures, documented not hidden</span>
        </div>
      </section>
    </main>
  );
}
