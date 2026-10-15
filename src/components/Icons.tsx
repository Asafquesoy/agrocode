// Iconografía de la app: capa fina sobre lucide-react, para que ningún
// componente dependa directamente de la librería de íconos.
import {
  Sprout,
  Droplets,
  CloudDrizzle,
  Thermometer,
  Gauge,
  Waves,
  SlidersHorizontal,
  Bell,
  Plug,
  Timer,
  Trash,
  Pencil,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
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
export const PumpIcon = withThinStroke(Waves);
export const FlowIcon = withThinStroke(SlidersHorizontal);
export const AlarmIcon = withThinStroke(Bell);
export const PlugIcon = withThinStroke(Plug);
export const TimerIcon = withThinStroke(Timer);

// --- Sensores ---
export const RainIcon = withThinStroke(CloudDrizzle);
export const TemperatureIcon = withThinStroke(Thermometer);

// --- Interfaz ---
export const RemoveIcon = withThinStroke(Trash);
export const EditIcon = withThinStroke(Pencil);
export const ArrowIcon = withThinStroke(ArrowRight);
export const BackIcon = withThinStroke(ArrowLeft);
export const ChevronIcon = withThinStroke(ChevronDown);
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
// registra el agricultor con nombre libre. Los mismos del diseño del formulario
// de creación del dispositivo.
export const SENSOR_KIND_ICONS: Record<string, LucideIcon> = {
  SOIL_MOISTURE: CropIcon,
  RAIN: RainIcon,
  TEMPERATURE: TemperatureIcon,
  AIR_HUMIDITY: DropIcon,
};

export const ACTUATOR_KIND_ICONS: Record<string, LucideIcon> = {
  PUMP: PumpIcon,
  VALVE: FlowIcon,
  ALARM: AlarmIcon,
  OTHER: PlugIcon,
};
