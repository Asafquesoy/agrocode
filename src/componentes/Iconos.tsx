// Iconografía propia en SVG de trazo, en el mismo lenguaje gráfico del logo:
// trazo grueso, esquinas redondeadas, sin relleno, color heredado del texto.
// Nunca usar emojis ni sets de iconos genéricos en esta app — ver CLAUDE.md.
import type { SVGProps } from "react";

interface IconoProps extends Omit<SVGProps<SVGSVGElement>, "viewBox" | "width" | "height"> {
  size?: number;
}

function base(children: React.ReactNode) {
  function Icono({ size = 24, ...props }: IconoProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {children}
      </svg>
    );
  }
  return Icono;
}

// --- Cultivos ---

export const IconoCana = base(
  <>
    <path d="M12 21V9" />
    <path d="M12 9c0-2.5-1.5-4-3.5-5" />
    <path d="M12 13c0-2.2 1.3-3.6 3-4.5" />
    <path d="M12 17c0-1.8 1.6-3 3.2-3.6" />
    <path d="M9 21h6" />
  </>
);

export const IconoCitricos = base(
  <>
    <circle cx="12" cy="14" r="6" />
    <path d="M12 8c0-2.2 1-4 3-5" />
    <path d="M9.5 11.5c1-1 3-1 5 1" />
  </>
);

export const IconoMaiz = base(
  <>
    <path d="M12 3c2.6 1 4 3.4 4 6.5C16 15 14 20 12 21c-2-1-4-6-4-11.5C8 6.4 9.4 4 12 3Z" />
    <path d="M10 8.5h4M9.4 11.5h5.2M9.4 14.5h5.2" />
  </>
);

export const IconoSorgo = base(
  <>
    <path d="M12 21V8" />
    <path d="M12 8c1.6-.4 3-1.6 3-3.4" />
    <path d="M12 8c-1.6-.4-3-1.6-3-3.4" />
    <ellipse cx="12" cy="5" rx="1.6" ry="2.4" />
  </>
);

// --- Acciones / actuadores ---

export const IconoGota = base(<path d="M12 3c3 4 6 7.5 6 11a6 6 0 1 1-12 0c0-3.5 3-7 6-11Z" />);

export const IconoValvula = base(
  <>
    <path d="M4 12h4M16 12h4" />
    <rect x="8" y="8" width="8" height="8" rx="1.5" />
    <path d="M12 5v3M12 16v3" />
  </>
);

export const IconoBomba = base(
  <>
    <rect x="4" y="9" width="10" height="9" rx="1.5" />
    <path d="M14 12h3.5a2.5 2.5 0 0 1 0 5H14" />
    <path d="M7 9V6.5A1.5 1.5 0 0 1 8.5 5h1A1.5 1.5 0 0 1 11 6.5V9" />
  </>
);

export const IconoAlarma = base(
  <>
    <path d="M6 10a6 6 0 1 1 12 0c0 3.2 1 4.8 2 6H4c1-1.2 2-2.8 2-6Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </>
);

export const IconoReloj = base(
  <>
    <circle cx="12" cy="12.5" r="8" />
    <path d="M12 8v4.8l3 2" />
    <path d="M9.5 3h5" />
  </>
);

// --- Interfaz ---

export const IconoQuitar = base(
  <>
    <path d="M5 7h14" />
    <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
    <path d="M7.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h4.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
    <path d="M10.5 11v6M13.5 11v6" />
  </>
);

export const IconoFlecha = base(<path d="M5 12h13M13 6l6 6-6 6" />);

export const IconoVerificado = base(
  <>
    <path d="M12 3.5c2.3 1.2 4.3 1.6 6.5 1.6 0 8-2.8 11.8-6.5 13.4-3.7-1.6-6.5-5.4-6.5-13.4 2.2 0 4.2-.4 6.5-1.6Z" />
    <path d="M9 12.3l2 2 4-4.3" />
  </>
);

export const IconoAdvertencia = base(
  <>
    <path d="M12 4.5 21 19H3L12 4.5Z" />
    <path d="M12 10.2v4M12 16.7v.1" />
  </>
);

export const IconoMarca = base(
  <>
    <path d="M9 8 5 12l4 4" />
    <path d="M15 8l4 4-4 4" />
  </>
);

export const ICONOS_CULTIVO: Record<string, ReturnType<typeof base>> = {
  CANA: IconoCana,
  CITRICOS: IconoCitricos,
  MAIZ: IconoMaiz,
  SORGO: IconoSorgo,
};

export const ICONOS_ACTUADOR: Record<string, ReturnType<typeof base>> = {
  BOMBA_PRINCIPAL: IconoBomba,
  VALVULA_NORTE: IconoValvula,
  VALVULA_SUR: IconoValvula,
  ALARMA: IconoAlarma,
};
