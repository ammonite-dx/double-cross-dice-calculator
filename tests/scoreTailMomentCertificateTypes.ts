import type {
  AnalyticScoreTailMomentCertificate,
  FiniteSupportScoreTailMomentCertificate,
  ScoreTailMomentCertificate,
} from '../src/domain/ScoreResultTypes'

const finiteCertificate = {
  version: 1,
  kind: 'score-tail-moment-certificate',
  model: 'finite-support',
  modeledMax: 10,
  massUpperBound: 0,
  firstMomentUpperBound: 0,
} satisfies FiniteSupportScoreTailMomentCertificate

const analyticCertificate = {
  version: 1,
  kind: 'score-tail-moment-certificate',
  model: 'dx-max-tail',
  modeledMax: 100,
  massUpperBound: 0.01,
  firstMomentUpperBound: 2,
  boundaryContributionUpperBound: 1,
  residualUpperBound: 0.5,
  skillContributionUpperBound: 0.5,
} satisfies AnalyticScoreTailMomentCertificate

function firstMomentAttribution(certificate: ScoreTailMomentCertificate) {
  if (certificate.model === 'finite-support') {
    return certificate.firstMomentUpperBound
  }
  return certificate.boundaryContributionUpperBound
    + certificate.residualUpperBound
    + certificate.skillContributionUpperBound
}

void firstMomentAttribution(finiteCertificate)
void firstMomentAttribution(analyticCertificate)
