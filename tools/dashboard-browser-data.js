export function dashboardBrowserData() {
  const timestamp = new Date().toISOString();
  const applications = Array.from({ length: 8 }, (_, index) => {
    const folder = `demo-application-${index + 1}`;
    const issues = index === 0 ? ['awaiting user review'] : [];
    return {
      folder,
      company: `Demo Company ${index + 1}`,
      role: index % 2 ? 'Solutions Engineer' : 'Implementation Engineer',
      platform: 'linkedin-easy-apply',
      status: index === 0 ? 'prepared' : 'review',
      userReviewed: false,
      masterCvReviewed: false,
      date: timestamp.slice(0, 10),
      docs: 2,
      hasCv: true,
      hasCl: true,
      jobUrl: 'https://example.test/jobs/demo',
      steps: { research: true, cvSource: true, cvRendered: true, clSource: true, clRendered: false, manifest: true, userReviewed: false, applied: false },
      timestamps: { research: timestamp, cvSource: timestamp, cvRendered: timestamp, clSource: timestamp, clRendered: null, manifest: timestamp, userReviewed: null, applied: null },
      stageDurations: [{ stage: 'research', startedAt: timestamp, durationMs: 1200 }],
      stage: 'clRendered',
      stageLabel: 'cover-letter rendered',
      issues,
      artifacts: [
        { name: 'CV.pdf', path: 'cv/cv.pdf', type: 'cv', hash: 'verified', actualHash: 'verified', hashMatches: true, generatedAt: timestamp, exists: true, size: 1024 },
        { name: 'Cover letter.pdf', path: 'cover-letter/cover-letter.pdf', type: 'cover-letter', hash: 'expected', actualHash: 'different', hashMatches: false, generatedAt: timestamp, exists: true, size: 2048 },
      ],
      hashMismatches: ['Cover letter.pdf'],
      links: { cvPdfPath: null, cvHtmlPath: null, clPdfPath: null, clHtmlPath: null },
      createdAt: timestamp,
      updatedAt: timestamp,
      elapsedMs: 1200,
    };
  });

  const runs = [
    { persona: 'cv-writer', timestamp, startedAt: timestamp, completedAt: timestamp, durationMs: 1200, task: 'Prepare a demo CV', status: 'done', outputs: ['cv.md'] },
    { persona: 'fact-checker', timestamp, startedAt: timestamp, completedAt: timestamp, durationMs: 800, task: 'Verify demo facts', status: 'done', outputs: ['review.md'] },
  ];

  return {
    generatedAt: timestamp,
    applications,
    cvLibrary: [{ role: 'solutions-engineer', hasSource: true, hasPdf: true, words: 400, sourceMtime: timestamp, pdfMtime: timestamp }],
    masterCv: { exists: true, path: 'CVs/MASTER_CV.md', words: 620, mtime: timestamp },
    masterCoverLetter: { exists: true, path: 'CVs/MASTER_COVER_LETTER.md', words: 340, mtime: timestamp },
    templateStatus: {
      templateExists: true,
      styleExists: true,
      frozen: true,
      styleTokens: 'Arial 9.5pt (CV) / 10.5pt (letter), 1.4 line height, 15mm (CV) / 0.79in (letter) margins, black text only, bullet U+25CF, A4',
    },
    guardrails: {
      dailyCap: { used: 2, cap: 10, remaining: 8 },
      lastHalt: null,
      tosAcknowledgement: {
        acknowledged: true,
        acknowledgedAt: timestamp,
        acknowledgedBy: 'demo-user',
        terms: 'LinkedIn User Agreement',
      },
      rules: [
        { id: 'G1', rule: 'File inputs never written', status: 'enforced' },
        { id: 'G2', rule: 'Submit/Send never clicked (allowlist)', status: 'enforced' },
        { id: 'G3', rule: 'Plan hash + 5-min expiry', status: 'enforced' },
        { id: 'G4', rule: 'CAPTCHA/checkpoint halts run', status: 'enforced' },
        { id: 'G5', rule: '10 applications/day cap', status: 'self-discipline' },
        { id: 'G6', rule: 'Audit log (timestamp, job, field, value hash, source)', status: 'enforced' },
        { id: 'G7', rule: 'Sensitive answers stored as hashes only', status: 'enforced' },
        { id: 'G8', rule: 'No fabrication', status: 'enforced' },
        { id: 'G9', rule: 'Preparation gate before apply', status: 'enforced' },
        { id: 'G10', rule: 'Frozen layout (template + style.js)', status: 'enforced' },
        { id: 'G11', rule: 'LinkedIn ToS acknowledgement', status: 'acknowledged' },
      ],
    },
    renderHistory: [
      {
        name: '2026-11-11-demo-render',
        path: 'data/out/rendered/2026-11-11-demo-render',
        updatedAt: timestamp,
        files: [
          { name: 'cv.pdf', path: 'data/out/rendered/2026-11-11-demo-render/cv.pdf', mtime: timestamp, size: 1024 },
          { name: 'cover-letter.pdf', path: 'data/out/rendered/2026-11-11-demo-render/cover-letter.pdf', mtime: timestamp, size: 2048 },
        ],
      },
    ],
    totals: { applications: applications.length, complete: 2, exceptions: 1, runs: runs.length },
    interventions: [{ folder: applications[0].folder, company: applications[0].company, role: applications[0].role, issue: 'awaiting user review', stage: applications[0].stage }],
    global: { scan: true, scanJobId: 'demo-job', scanState: 'complete', plan: true, planFields: 3, planUnknowns: 0, planAmbiguities: 0, appliedCount: 0, auditEntries: 0 },
    personaCounts: { 'cv-writer': 1, 'fact-checker': 1 },
    agentMonitor: [
      { name: 'cv-writer', count: 1, success: 1, failed: 0, avgDurationMs: 1200, lastRun: timestamp, lastStatus: 'done', currentTask: runs[0].task, runs: [runs[0]] },
      { name: 'fact-checker', count: 1, success: 1, failed: 0, avgDurationMs: 800, lastRun: timestamp, lastStatus: 'done', currentTask: runs[1].task, runs: [runs[1]] },
    ],
    activitySummary: { runs: 2, apps: applications.length, cvs: 1, reviewed: 0 },
    systemHealth: {
      state: 'Degraded',
      reasons: ['1 item needs attention', '1 artifact hash mismatch'],
      activeExecutions: applications.length,
      completedExecutions: 2,
      failedExecutions: 0,
      interruptedExecutions: 0,
      requiresAttention: 1,
      hashMismatchCount: 8,
      avgProcessingTimeMs: 1000,
      lastSuccessfulExecution: timestamp,
    },
    timeline: [{ time: timestamp, type: 'persona', label: 'cv-writer', detail: 'Prepared a demo CV', status: 'done' }],
  };
}
