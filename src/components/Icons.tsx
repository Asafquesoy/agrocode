// Iconografía de la app: capa fina sobre lucide-react, para que ningún
// componente dependa directamente de la librería de íconos.
import {
  Wheat,
  Citrus,
  Sprout,
  Leaf,
  Droplets,
  Gauge,
  Zap,
  Siren,
  Timer,
  Trash,
  ArrowRight,
  CircleCheck,
  TriangleAlert,
  Plus,
  Check,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

// Trazo más fino que el default de lucide (2px) para una línea más ligera.
function withThinStroke(BaseIcon: LucideIcon): LucideIcon {
  function Icon(props: LucideProps) {
    return <BaseIcon strokeWidth={1.5} absoluteStrokeWidth {...props} />;
  }
  return Icon as LucideIcon;
}

// --- Cultivos ---
export const CaneIcon = withThinStroke(Wheat);
export const CitrusIcon = withThinStroke(Citrus);
export const CornIcon = withThinStroke(Sprout);
export const SorghumIcon = withThinStroke(Leaf);

// --- Acciones / actuadores ---
export const DropIcon = withThinStroke(Droplets);
export const ValveIcon = withThinStroke(Gauge);
export const PumpIcon = withThinStroke(Zap);
export const AlarmIcon = withThinStroke(Siren);
export const TimerIcon = withThinStroke(Timer);

// --- Interfaz ---
export const RemoveIcon = withThinStroke(Trash);
export const ArrowIcon = withThinStroke(ArrowRight);
export const VerifiedIcon = withThinStroke(CircleCheck);
export const WarningIcon = withThinStroke(TriangleAlert);
export const PlusIcon = withThinStroke(Plus);
export const CheckIcon = withThinStroke(Check);

export const CROP_ICONS: Record<string, LucideIcon> = {
  CANA: CaneIcon,
  CITRICOS: CitrusIcon,
  MAIZ: CornIcon,
  SORGO: SorghumIcon,
};

export const ACTUATOR_ICONS: Record<string, LucideIcon> = {
  BOMBA_PRINCIPAL: PumpIcon,
  VALVULA_NORTE: ValveIcon,
  VALVULA_SUR: ValveIcon,
  ALARMA: AlarmIcon,
};
