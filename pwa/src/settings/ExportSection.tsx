import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice, SectionTitle } from '@/components/ui/kit';
import { useDataExport } from './useDataExport';

export function ExportSection() {
  const exporter = useDataExport();
  return <section>
    <SectionTitle>Mes données</SectionTitle>
    <p className="mb-3 mt-0 text-sm leading-relaxed text-muted-foreground">
      Récupère tout ce qui t’appartient : tes notes (corbeille incluse) et leurs liens, tes contenus préparés avec
      leurs textes et traductions, tes dossiers, tes émissions et ta progression d’écoute — dans un JSON complet et
      un document Markdown lisible. Les audios ne sont pas inclus : l’export liste leurs empreintes et leurs tailles.
    </p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => exporter.mutate(2)} disabled={exporter.isPending}>
        <Download className="size-4" />{exporter.isPending ? 'Préparation…' : 'Exporter tout (JSON + Markdown)'}
      </Button>
      <Button variant="ghost" onClick={() => exporter.mutate(1)} disabled={exporter.isPending}>Export historique</Button>
    </div>
    {exporter.data && <div className="mt-2 flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm"><a href={exporter.data.jsonUrl} download={`discover-export-${exporter.data.date}.json`} className="no-underline">Enregistrer le JSON</a></Button>
      {exporter.data.markdownUrl && <Button asChild variant="outline" size="sm"><a href={exporter.data.markdownUrl} download={`discover-export-${exporter.data.date}.md`} className="no-underline">Enregistrer le Markdown</a></Button>}
    </div>}
    {exporter.data?.partial && <Notice tone="warning" className="mt-2">
      Certains textes sont indisponibles. Les fichiers exportés indiquent les éléments manquants ; réessaie l’export après vérification.
    </Notice>}
    {exporter.isError && <Notice tone="warning" className="mt-2">Export impossible pour l’instant.</Notice>}
  </section>;
}
