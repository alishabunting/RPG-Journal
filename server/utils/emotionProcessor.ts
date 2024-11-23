/**
 * Calculate emotional intensity based on mood
 * @param mood The mood string from journal analysis
 * @returns A multiplier for stat changes based on emotional intensity
 */
export function getEmotionalIntensity(mood: string): number {
  const intensityMap: Record<string, number> = {
    'very positive': 1.2,
    'positive': 1.1,
    'neutral': 1.0,
    'negative': 0.9,
    'very negative': 0.8
  };
  return intensityMap[mood.toLowerCase()] || 1.0;
}

/**
 * Normalize mood string to standard format
 * @param mood Raw mood string from analysis
 * @returns Normalized mood string
 */
export function normalizeMood(mood: string): string {
  const normalizedMood = mood.toLowerCase().trim();
  const moodMap: Record<string, string> = {
    'very happy': 'very positive',
    'happy': 'positive',
    'sad': 'negative',
    'very sad': 'very negative',
    'angry': 'very negative',
    'excited': 'very positive',
    'content': 'positive',
    'neutral': 'neutral'
  };
  return moodMap[normalizedMood] || 'neutral';
}
