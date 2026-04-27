export type SkinCheckerOption = {
  id: string;
  label: string;
  score: number;
  critical?: boolean;
};

export type SkinCheckerQuestion = {
  id: string;
  title: string;
  help?: string;
  options: readonly SkinCheckerOption[];
};

// Exact questions from ai checker.docx
export const skinCheckerQuestions: readonly SkinCheckerQuestion[] = [
  {
    id: 'q1',
    title: 'Are you 18 years or older?',
    help: 'Age Verification',
    options: [
      { id: 'yes', label: 'Yes', score: 0 },
      { id: 'no', label: 'No', score: 8, critical: true },
    ],
  },
  {
    id: 'q2',
    title: 'Do you have sensitive skin or a history of skin reactions (rashes, redness, itching)?',
    help: 'Skin Sensitivity',
    options: [
      { id: 'yes', label: 'Yes', score: 3 },
      { id: 'no', label: 'No', score: 0 },
    ],
  },
  {
    id: 'q3',
    title: 'How would you describe your skin type?',
    help: 'Skin Type',
    options: [
      { id: 'oily', label: 'Oily', score: 1 },
      { id: 'dry', label: 'Dry', score: 1 },
      { id: 'normal', label: 'Normal', score: 0 },
      { id: 'combination', label: 'Combination', score: 1 },
    ],
  },
  {
    id: 'q4',
    title: 'Do you have any known allergies (especially to metals, dyes, or cosmetics)?',
    help: 'Allergies',
    options: [
      { id: 'yes', label: 'Yes', score: 4, critical: true },
      { id: 'no', label: 'No', score: 0 },
      { id: 'not_sure', label: 'Not sure', score: 2 },
    ],
  },
  {
    id: 'q5',
    title: 'Do you have any medical conditions like diabetes, eczema, psoriasis, or blood disorders?',
    help: 'Medical Conditions',
    options: [
      { id: 'yes', label: 'Yes', score: 4, critical: true },
      { id: 'no', label: 'No', score: 0 },
      { id: 'not_sure', label: 'Not sure', score: 2 },
    ],
  },
  {
    id: 'q6',
    title: 'Are you currently taking any medications (like blood thinners, acne treatments, or steroids)?',
    help: 'Medication Check',
    options: [
      { id: 'yes', label: 'Yes', score: 4, critical: true },
      { id: 'no', label: 'No', score: 0 },
      { id: 'not_sure', label: 'Not sure', score: 2 },
    ],
  },
  {
    id: 'q7',
    title: 'Have you had a tattoo before? If yes, did you face any issues during healing?',
    help: 'Previous Tattoo Experience',
    options: [
      { id: 'yes_issues', label: 'Yes, I had issues', score: 3 },
      { id: 'yes_no_issues', label: 'Yes, no issues', score: 0 },
      { id: 'no', label: 'No', score: 0 },
    ],
  },
  {
    id: 'q8',
    title: 'Is the area where you want the tattoo currently injured, sunburned, or infected?',
    help: 'Optional',
    options: [
      { id: 'yes', label: 'Yes', score: 5, critical: true },
      { id: 'no', label: 'No', score: 0 },
    ],
  },
] as const;

export type SkinCheckerFlag = 'GREEN' | 'RED';

export const evaluateSkinChecker = (answers: Record<string, string>): { flag: SkinCheckerFlag; score: number; criticalHit: boolean } => {
  let score = 0;
  let criticalHit = false;

  for (const q of skinCheckerQuestions) {
    const picked = answers[q.id];
    const opt = q.options.find((o) => o.id === picked);
    if (!opt) continue;
    score += opt.score;
    if (opt.critical) criticalHit = true;
  }

  const flag: SkinCheckerFlag = criticalHit || score >= 6 ? 'RED' : 'GREEN';
  return { flag, score, criticalHit };
};
