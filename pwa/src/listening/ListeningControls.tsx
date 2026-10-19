import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { Button, Divider, FormControlLabel, Menu, MenuItem, Stack, Switch, Tooltip } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../player/PlayerProvider';
import { readAutoplayNext, writeAutoplayNext } from './nextUp';
import { playReturnPoint, returnPointStore, useReturnPoint } from './returnPoint';
import { SLEEP_CHOICES, sleepRemainingSec, sleepStore, useSleep } from './sleep';

/** mm:ss, comme l'horloge du lecteur (copie locale : le module lecteur importe celui-ci). */
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Minuterie de sommeil et enchaînement « lire ensuite », dans le lecteur complet (I5). */
export function ListeningControls() {
  const sleep = useSleep();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [autoplay, setAutoplay] = useState(() => readAutoplayNext());

  // État visible : le compte à rebours avance tant qu'une échéance horloge est active.
  useEffect(() => {
    if (!sleep || sleep.endsAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sleep]);

  const remaining = sleepRemainingSec(sleep, now);

  return <>
    <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap" justifyContent="center">
      <Tooltip title="Arrêter la lecture plus tard">
        <Button size="small" color={sleep ? 'primary' : 'inherit'} startIcon={<TimerOutlinedIcon />}
          aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)}
          sx={sleep ? undefined : { color: 'text.secondary' }}>
          {sleep
            ? sleep.endsAt === null ? 'Minuterie : fin de l’épisode' : `Arrêt dans ${clock(remaining ?? 0)}`
            : 'Minuterie de sommeil'}
        </Button>
      </Tooltip>
      <FormControlLabel label="Lire ensuite les téléchargements" labelPlacement="start"
        control={<Switch size="small" checked={autoplay} onChange={(_e, on) => { setAutoplay(on); writeAutoplayNext(on); }} />} />
    </Stack>
    <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} MenuListProps={{ 'aria-label': 'Minuterie de sommeil' }}>
      {SLEEP_CHOICES.map((choice) => (
        <MenuItem key={String(choice.value)} selected={sleep?.mode === choice.value}
          onClick={() => { sleepStore.start(choice.value); setAnchor(null); }}>
          {choice.label}
        </MenuItem>
      ))}
      {sleep && <>
        <Divider />
        <MenuItem onClick={() => { sleepStore.cancel(); setAnchor(null); }}>Annuler la minuterie</MenuItem>
      </>}
    </Menu>
  </>;
}

/** « Revenir à la version B1 » : reprend la version adaptée à l'endroit quitté avant le saut vers l'original (I3). */
export function ReturnToVersionButton({ onClose }: { onClose: () => void }) {
  const point = useReturnPoint();
  const player = usePlayer();
  const navigate = useNavigate();
  // Visible seulement sur l'original rejoint par le saut : ailleurs, il n'y a rien à reprendre.
  const onOriginal = !!point?.jumpedTo && player.track !== null
    && player.track.targetType === point.jumpedTo.targetType
    && player.track.targetId === point.jumpedTo.targetId
    && player.track.audioRef === point.jumpedTo.audioRef;
  if (!point || !onOriginal) return null;
  const back = () => {
    if (point.track) playReturnPoint(point, player);
    else returnPointStore.clear();
    navigate(`/library/${point.contentId}?v=${encodeURIComponent(point.variantKey)}`);
    onClose();
  };
  return <Button variant="outlined" size="small" onClick={back}>
    {`Revenir à ${point.label}${point.positionSec !== undefined ? ` (reprendre à ${clock(point.positionSec)})` : ''}`}
  </Button>;
}

/** État toujours visible, même quand le lecteur complet est replié. */
export function ListeningStatus() {
  const sleep = useSleep();
  if (!sleep) return null;
  return <span role="status">{sleep.mode === 'end' ? 'Arrêt en fin d’épisode · ' : `Minuterie ${sleep.mode} min · `}</span>;
}
