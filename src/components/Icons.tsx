// Iconografía de la app: capa fina sobre lucide-react, para que ningún
// componente dependa directamente de la librería de íconos.
import {
  Sprout,
  Droplets,
  CloudRain,
  Thermometer,
  Wind,
  Gauge,
  Zap,
  Siren,
  Power,
  Timer,
  Trash,
  Pencil,
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  TriangleAlert,
  Plus,
  Check,
  Download,
  Copy,
  PanelsTopLeft,
  Wifi,
  Workflow,
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

// --- Cultivo (texto libre: un solo icono genérico) ---
export const CropIcon = withThinStroke(Sprout);

// --- Acciones / actuadores ---
export const DropIcon = withThinStroke(Droplets);
export const ValveIcon = withThinStroke(Gauge);
export const PumpIcon = withThinStroke(Zap);
export const AlarmIcon = withThinStroke(Siren);
export const TimerIcon = withThinStroke(Timer);

// --- Sensores ---
export const RainIcon = withThinStroke(CloudRain);
export const TemperatureIcon = withThinStroke(Thermometer);
export const AirIcon = withThinStroke(Wind);
export const PowerIcon = withThinStroke(Power);

// --- Interfaz ---
export const RemoveIcon = withThinStroke(Trash);
export const EditIcon = withThinStroke(Pencil);
export const ArrowIcon = withThinStroke(ArrowRight);
export const BackIcon = withThinStroke(ArrowLeft);
export const VerifiedIcon = withThinStroke(CircleCheck);
export const WarningIcon = withThinStroke(TriangleAlert);
export const PlusIcon = withThinStroke(Plus);
export const CheckIcon = withThinStroke(Check);
export const SaveIcon = withThinStroke(Download);
export const CopyIcon = withThinStroke(Copy);
export const DevicesIcon = withThinStroke(PanelsTopLeft);
export const ConnectIcon = withThinStroke(Wifi);
export const RulesIcon = withThinStroke(Workflow);

// Iconos por *tipo* de aparato (catalog.ts), no por id: los aparatos los
// registra el agricultor con nombre libre.
export const SENSOR_KIND_ICONS: Record<string, LucideIcon> = {
  SOIL_MOISTURE: DropIcon,
  RAIN: RainIcon,
  TEMPERATURE: TemperatureIcon,
  AIR_HUMIDITY: AirIcon,
};

export const ACTUATOR_KIND_ICONS: Record<string, LucideIcon> = {
  PUMP: PumpIcon,
  VALVE: ValveIcon,
  ALARM: AlarmIcon,
  OTHER: PowerIcon,
};
