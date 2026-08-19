export const NOTIFICATION_SOUNDS = [
  { id: 'soft', label: 'Suave', description: 'Toque curto e discreto' },
  { id: 'chime', label: 'Sino', description: 'Sino claro e equilibrado' },
  { id: 'double', label: 'Duplo', description: 'Dois toques rápidos' },
  { id: 'crystal', label: 'Cristal', description: 'Som leve e brilhante' },
  { id: 'pop', label: 'Pop', description: 'Confirmação curta' },
  { id: 'pulse', label: 'Pulso', description: 'Pulso moderno' },
  { id: 'ascending', label: 'Ascendente', description: 'Sequência crescente' },
  { id: 'digital', label: 'Digital', description: 'Alerta eletrônico' },
  { id: 'bell', label: 'Campainha', description: 'Campainha de mesa' },
  { id: 'deep', label: 'Grave', description: 'Aviso baixo e encorpado' },
] as const

export type NotificationSoundId = typeof NOTIFICATION_SOUNDS[number]['id'] | 'silent'

type Tone = {
  frequency: number
  offset: number
  duration: number
  gain: number
  type?: OscillatorType
  endFrequency?: number
}

const PROFILES: Record<Exclude<NotificationSoundId, 'silent'>, Tone[]> = {
  soft: [{ frequency: 620, offset: 0, duration: 0.18, gain: 0.055, type: 'sine', endFrequency: 760 }],
  chime: [
    { frequency: 784, offset: 0, duration: 0.28, gain: 0.075, type: 'sine' },
    { frequency: 1175, offset: 0.06, duration: 0.32, gain: 0.045, type: 'sine' },
  ],
  double: [
    { frequency: 700, offset: 0, duration: 0.11, gain: 0.07, type: 'sine' },
    { frequency: 880, offset: 0.14, duration: 0.13, gain: 0.07, type: 'sine' },
  ],
  crystal: [
    { frequency: 1047, offset: 0, duration: 0.24, gain: 0.045, type: 'sine' },
    { frequency: 1568, offset: 0.04, duration: 0.3, gain: 0.03, type: 'sine' },
  ],
  pop: [{ frequency: 520, offset: 0, duration: 0.09, gain: 0.085, type: 'sine', endFrequency: 760 }],
  pulse: [
    { frequency: 440, offset: 0, duration: 0.09, gain: 0.055, type: 'triangle' },
    { frequency: 440, offset: 0.12, duration: 0.09, gain: 0.055, type: 'triangle' },
  ],
  ascending: [
    { frequency: 523, offset: 0, duration: 0.11, gain: 0.045, type: 'sine' },
    { frequency: 659, offset: 0.1, duration: 0.11, gain: 0.05, type: 'sine' },
    { frequency: 784, offset: 0.2, duration: 0.16, gain: 0.055, type: 'sine' },
  ],
  digital: [
    { frequency: 880, offset: 0, duration: 0.07, gain: 0.035, type: 'square' },
    { frequency: 660, offset: 0.09, duration: 0.07, gain: 0.035, type: 'square' },
    { frequency: 990, offset: 0.18, duration: 0.08, gain: 0.035, type: 'square' },
  ],
  bell: [
    { frequency: 660, offset: 0, duration: 0.34, gain: 0.065, type: 'sine' },
    { frequency: 1320, offset: 0, duration: 0.24, gain: 0.025, type: 'sine' },
  ],
  deep: [{ frequency: 240, offset: 0, duration: 0.3, gain: 0.09, type: 'triangle', endFrequency: 190 }],
}

export function playNotificationSound(soundId: NotificationSoundId) {
  if (soundId === 'silent' || typeof window === 'undefined') return
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const tones = PROFILES[soundId] ?? PROFILES.soft
    let finishAt = 0

    for (const tone of tones) {
      const start = context.currentTime + tone.offset
      const end = start + tone.duration
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = tone.type ?? 'sine'
      oscillator.frequency.setValueAtTime(tone.frequency, start)
      if (tone.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(tone.gain, start + Math.min(0.02, tone.duration / 3))
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start)
      oscillator.stop(end)
      finishAt = Math.max(finishAt, tone.offset + tone.duration)
    }

    window.setTimeout(() => context.close().catch(() => {}), (finishAt + 0.15) * 1000)
  } catch {
    // Browsers may block audio before the first user interaction.
  }
}
