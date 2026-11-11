const TEXT_PATTERNS = [
  /unusual activity/i,
  /quick security check/i,
  /verify (that )?you(?:'re| are) (?:a )?human/i,
  /confirm you are a human/i,
  /security check/i,
  /captcha/i,
  /ungew(?:ö|oe)hnliche aktivit(?:ä|ae)t/i,
  /sicherheits(?:ü|ue)berpr(?:ü|ue)fung/i,
  /best(?:ä|ae)tigen sie, dass sie ein mensch sind/i,
  /zu viele versuche/i,
];

export function detectChallenge({ text = '', foundSelectors = [] } = {}) {
  const hits = [];
  for (const re of TEXT_PATTERNS) {
    if (re.test(text)) hits.push(`text:${re.source}`);
  }
  for (const s of foundSelectors) hits.push(`dom:${s}`);
  return { detected: hits.length > 0, hits };
}

export class ChallengeError extends Error {
  constructor(hits) {
    super(`Halted: LinkedIn challenge detected (${hits.join(', ')}). Nothing else was touched.`);
    this.name = 'ChallengeError';
    this.code = 'CHALLENGE';
    this.hits = hits;
  }
}

export function assertNoChallenge(signals) {
  const result = detectChallenge(signals);
  if (result.detected) throw new ChallengeError(result.hits);
  return result;
}
