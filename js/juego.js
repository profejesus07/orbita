// Reglas compartidas por el docente y los estudiantes: economía, mejoras y planetas.

export const MEJORAS = {
  motor: {
    nombre: 'Motor',
    icono: '🔥',
    descripcion: 'Combustible que ganas por cada acierto',
    valores: [10, 20, 50, 120, 300, 750],
    costos: [0, 60, 250, 900, 3000, 10000],
    formato: (v) => `+${formatear(v)} por acierto`,
  },
  propulsor: {
    nombre: 'Propulsor',
    icono: '🚀',
    descripcion: 'Multiplica todo lo que ganas',
    valores: [1, 1.5, 2, 3, 5],
    costos: [0, 400, 1500, 5000, 15000],
    formato: (v) => `×${String(v).replace('.', ',')}`,
  },
  blindaje: {
    nombre: 'Blindaje',
    icono: '🛡️',
    descripcion: 'Reduce lo que pierdes al fallar',
    valores: [1, 0.6, 0.3, 0],
    costos: [0, 150, 600, 2000],
    formato: (v) => (v === 0 ? 'Sin pérdidas' : `Pierdes el ${Math.round(v * 100)}%`),
  },
};

// Cada acierto seguido suma un 10 % extra, hasta un 50 %.
export const RACHA_MAXIMA = 5;

export const PLANETAS = [
  { nombre: 'Tierra', meta: 0, color: '#4f9dff' },
  { nombre: 'Luna', meta: 100, color: '#c9ccd6' },
  { nombre: 'Marte', meta: 500, color: '#e2643c' },
  { nombre: 'Ceres', meta: 2000, color: '#a89f91' },
  { nombre: 'Júpiter', meta: 6000, color: '#d9a066' },
  { nombre: 'Saturno', meta: 15000, color: '#e8cf8a' },
  { nombre: 'Urano', meta: 35000, color: '#7fd8e0' },
  { nombre: 'Neptuno', meta: 75000, color: '#4a6cf7' },
  { nombre: 'Plutón', meta: 150000, color: '#d8b4a0' },
];

export function mejorasIniciales() {
  return { motor: 0, propulsor: 0, blindaje: 0 };
}

export function gananciaAcierto(jugador) {
  const base = MEJORAS.motor.valores[jugador.mejoras.motor];
  const multiplicador = MEJORAS.propulsor.valores[jugador.mejoras.propulsor];
  const extraRacha = Math.min(jugador.racha, RACHA_MAXIMA) * 0.1;
  return Math.round(base * multiplicador * (1 + extraRacha));
}

export function perdidaFallo(jugador) {
  const base = MEJORAS.motor.valores[jugador.mejoras.motor];
  return Math.round(base * MEJORAS.blindaje.valores[jugador.mejoras.blindaje]);
}

// Devuelve el costo del siguiente nivel, o null si la mejora ya está al máximo.
export function costoSiguienteNivel(clave, nivel) {
  const mejora = MEJORAS[clave];
  return nivel + 1 < mejora.valores.length ? mejora.costos[nivel + 1] : null;
}

export function planetaActual(combustible) {
  let actual = PLANETAS[0];
  for (const planeta of PLANETAS) if (combustible >= planeta.meta) actual = planeta;
  return actual;
}

export function siguientePlaneta(combustible) {
  return PLANETAS.find((p) => p.meta > combustible) ?? null;
}

// Posición de 0 a 1 en la ruta, en escala logarítmica para que los primeros planetas no se amontonen.
export function posicionEnRuta(combustible) {
  const maximo = Math.log10(1 + PLANETAS[PLANETAS.length - 1].meta);
  return Math.min(1, Math.log10(1 + Math.max(0, combustible)) / maximo);
}

export function formatear(numero) {
  return Math.round(numero).toLocaleString('es');
}

export function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function nuevoId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function barajar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export function formatearTiempo(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export const LETRAS = ['A', 'B', 'C', 'D'];
