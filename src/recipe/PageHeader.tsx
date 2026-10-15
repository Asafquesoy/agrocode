import { BackIcon, VerifiedIcon, WarningIcon } from "../components/Icons";
import { SAVE_LABELS, type SaveStatus } from "./useAutosave";
import "./PageHeader.css";

// Piezas de cabecera que comparten las pantallas de un dispositivo (Configurar
// y Mis reglas): la ruta de vuelta a la lista y el estado del guardado
// automático. El título va en un `.page-heading` (h1 + p).

export function Breadcrumb({ current, onBack }: { current: string; onBack: () => void }) {
  return (
    <nav className="page-crumbs" aria-label="Ruta">
      <button className="page-crumbs__back" onClick={onBack}>
        <BackIcon size={14} /> Mis dispositivos
      </button>
      <span aria-hidden="true">/</span>
      <span className="page-crumbs__current" aria-current="page">
        {current}
      </span>
    </nav>
  );
}

export function SaveBadge({ status }: { status: SaveStatus }) {
  return (
    <span className={`save-badge save-badge--${status}`} role="status">
      {status === "saved" && <VerifiedIcon size={14} />}
      {status === "error" && <WarningIcon size={14} />}
      {SAVE_LABELS[status]}
    </span>
  );
}
