import { useState } from 'react';
import { Alert, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import type { ContentDetail, ContentSegment, ContentVariant, GuideAnnotation } from '../api/contents';
import { validWordPick } from '../vocabulary/validation';
import { annotationPieces } from './annotations';
import { useAnnotationReview } from './useAnnotationReview';

interface Props {
  detail: ContentDetail; variant: ContentVariant; segment: ContentSegment; segmentIndex: number;
  annotations: GuideAnnotation[]; onPlay?: () => void;
}

function Explanation({ detail, variant, segment, segmentIndex, annotation, onClose, onPlay }: Omit<Props, 'annotations'> & {
  annotation: GuideAnnotation; onClose: () => void;
}) {
  const review = useAnnotationReview(detail, variant, segment, segmentIndex, annotation);
  return <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="annotation-title">
    <DialogTitle id="annotation-title"><span lang="en">{annotation.text}</span></DialogTitle>
    <DialogContent>
      <Typography lang="fr" sx={{ fontWeight: 600, mb: 1 }}>{annotation.meaning}</Typography>
      <Typography lang="fr">{annotation.note}</Typography>
      <Box component="blockquote" lang="en" sx={{ m: 0, mt: 2, pl: 2, borderLeft: '3px solid #03915A', color: 'text.secondary' }}>
        {segment.text}
      </Box>
      {review.isError && <Alert severity="error" sx={{ mt: 2 }}>L’ajout à la révision a échoué. Tu peux réessayer.</Alert>}
      {review.isSuccess && <Alert severity="success" sx={{ mt: 2 }}>Expression enregistrée dans ta révision.</Alert>}
    </DialogContent>
    <DialogActions sx={{ flexWrap: 'wrap', gap: 1, p: 2 }}>
      {onPlay && <Button onClick={onPlay}>Écouter depuis cette phrase</Button>}
      {validWordPick(annotation.text, segment.text) && <Button disabled={review.isPending || review.isSuccess} onClick={() => review.mutate()}>
        {review.isSuccess ? 'Enregistrée' : review.isPending ? 'Enregistrement…' : 'Ajouter à ma révision'}
      </Button>}
      <Button onClick={onClose}>Fermer</Button>
    </DialogActions>
  </Dialog>;
}

/** Le texte reste identique ; les seules zones interactives sont les difficultés annotées. */
export function AnnotatedText(props: Props) {
  const [selected, setSelected] = useState<GuideAnnotation | null>(null);
  return <>
    {annotationPieces(props.segment.text, props.annotations).map((piece, index) => piece.annotation
      ? <ButtonBase key={index} component="button" type="button" aria-label={`Expliquer « ${piece.text} »`} aria-haspopup="dialog"
        onClick={(event) => { event.stopPropagation(); setSelected(piece.annotation!); }}
        sx={{ display: 'inline', font: 'inherit', lineHeight: 'inherit', textAlign: 'inherit', verticalAlign: 'baseline',
          color: 'inherit', backgroundColor: '#03915A14', textDecoration: 'underline', textDecorationColor: '#03915A',
          textUnderlineOffset: '4px', borderRadius: '3px', '&.Mui-focusVisible': { outline: '2px solid #03915A', outlineOffset: '2px' } }}>
        {piece.text}
      </ButtonBase>
      : <span key={index}>{piece.text}</span>)}
    {selected && <Explanation key={`${selected.segmentId}:${selected.startChar}`} {...props} annotation={selected} onClose={() => setSelected(null)} />}
  </>;
}
