/* ============================================================
   Configuración de canales — Sabiduría (Biblia + filosofías).
   ============================================================ */

export const CHANNELS = {
  sabiduria: {
    handle: '@tu-canal-sabiduria',          // ← ajustá al handle real
    displayName: 'Sabiduría Eterna',
    channelContext:
      'Canal de sabiduría y conciencia: cruza enseñanzas de la Biblia con la ' +
      'filosofía de los grandes pensadores (estoicos, Sócrates, Lao Tsé) para ' +
      'dar verdades prácticas sobre el miedo, el propósito, el perdón, la calma, ' +
      'la disciplina y el sentido de la vida. Tono sereno, profundo y esperanzador.',

    // Modelo de guiones. Default Haiku (económico). Para más profundidad: 'claude-sonnet-4-6'.
    // model: 'claude-sonnet-4-6',

    // Voz Edge TTS (gratis). Otras: es-MX-JorgeNeural, es-ES-AlvaroNeural.
    voice: 'es-CO-GonzaloNeural',

    // Producción diaria
    shortsPerDay: 3,
    longPerDay: 1,

    // Música de fondo (carpeta). Generá pads con: npm run music
    musicDir: 'assets/music',

    youtubeTokenFile: '.tokens/sabiduria.json',
  },
};
