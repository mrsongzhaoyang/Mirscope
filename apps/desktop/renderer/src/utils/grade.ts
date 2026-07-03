export function gradeFromScore(score: number): 'A+' | 'A' | 'B' | 'C' {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  return 'C';
}
