import { Repeat2, Turtle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/kit';
import type { ActiveListeningApi } from '../player/ActiveListening';
export function ActiveListeningControls({ controls }: { controls: ActiveListeningApi | null }) {
  if (!controls?.available) return null;
  return <section aria-label="Écoute active" className="space-y-2 rounded-2xl border border-border bg-card p-3">
    <p className="m-0 text-sm font-semibold">Écoute active</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={controls.segmentIndex < 0} onClick={controls.repeat}><Repeat2 className="size-4" />Répéter le passage</Button>
      <Button variant={controls.slowing ? 'default' : 'outline'} disabled={controls.segmentIndex < 0} onClick={controls.slow} aria-pressed={controls.slowing}>
        <Turtle className="size-4" />Ce passage à 0,75×
      </Button>
    </div>
    <Checkbox checked={controls.pauseAfterSegment} onChange={controls.setPauseAfterSegment} label="Pause après chaque passage" />
    {controls.slowing && <p role="status" className="m-0 text-xs text-muted-foreground">La vitesse choisie reprend à la fin du passage.</p>}
  </section>;
}
