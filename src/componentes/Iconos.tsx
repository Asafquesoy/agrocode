// Iconografía de la app: capa fina sobre lucide-react.
// Se conservan los mismos nombres de exportación e íconos de mapeo que la versión
// dibujada a mano anterior, para que ningún punto de uso (PanelSalida, RecetaPropuesta,
// AsistenteNuevaRegla) tenga que cambiar su import.
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
  Terminal,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

// Trazo un poco más fino que el default de lucide (2px), para que quede cercano
// al lápiz de 1.75px que tenía la iconografía dibujada a mano.
function conTrazoFino(IconoBase: LucideIcon): LucideIcon {
  function Icono(props: LucideProps) {
    return <IconoBase strokeWidth={1.5} absoluteStrokeWidth {...props} />;
  }
  return Icono as LucideIcon;
}

// --- Cultivos ---
export const IconoCana = conTrazoFino(Wheat);
export const IconoCitricos = conTrazoFino(Citrus);
export const IconoMaiz = conTrazoFino(Sprout);
export const IconoSorgo = conTrazoFino(Leaf);

// --- Acciones / actuadores ---
export const IconoGota = conTrazoFino(Droplets);
export const IconoValvula = conTrazoFino(Gauge);
export const IconoBomba = conTrazoFino(Zap);
export const IconoAlarma = conTrazoFino(Siren);
export const IconoReloj = conTrazoFino(Timer);

// --- Interfaz ---
export const IconoQuitar = conTrazoFino(Trash);
export const IconoFlecha = conTrazoFino(ArrowRight);
export const IconoVerificado = conTrazoFino(CircleCheck);
export const IconoAdvertencia = conTrazoFino(TriangleAlert);
export const IconoMarca = conTrazoFino(Plus);

// --- Chrome de consola ---
export const IconoCheck = conTrazoFino(Check);
export const IconoTerminal = conTrazoFino(Terminal);

export const ICONOS_CULTIVO: Record<string, LucideIcon> = {
  CANA: IconoCana,
  CITRICOS: IconoCitricos,
  MAIZ: IconoMaiz,
  SORGO: IconoSorgo,
};

export const ICONOS_ACTUADOR: Record<string, LucideIcon> = {
  BOMBA_PRINCIPAL: IconoBomba,
  VALVULA_NORTE: IconoValvula,
  VALVULA_SUR: IconoValvula,
  ALARMA: IconoAlarma,
};
