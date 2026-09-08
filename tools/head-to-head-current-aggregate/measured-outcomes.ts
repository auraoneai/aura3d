export interface DeployMeasurements {
  aura: { javascriptBytes: number; totalDeployBytes: number };
  three: { javascriptBytes: number; totalDeployBytes: number };
}
export function measuredDeployOutcome(value: unknown) {
  const measurements = value as DeployMeasurements | undefined;
  if (!measurements || ![measurements.aura?.javascriptBytes, measurements.aura?.totalDeployBytes, measurements.three?.javascriptBytes, measurements.three?.totalDeployBytes].every(n => Number.isSafeInteger(n) && Number(n) > 0)) throw new Error('Missing actual scaffold deployment byte measurements');
  const javascriptBytesSmaller = measurements.three.javascriptBytes - measurements.aura.javascriptBytes;
  const totalBytesSmaller = measurements.three.totalDeployBytes - measurements.aura.totalDeployBytes;
  return {
    verdict: javascriptBytesSmaller < 0 || totalBytesSmaller < 0 ? 'loss' : javascriptBytesSmaller === 0 && totalBytesSmaller === 0 ? 'parity' : 'win',
    aura: { javascriptBytes: measurements.aura.javascriptBytes, totalBytes: measurements.aura.totalDeployBytes },
    three: { javascriptBytes: measurements.three.javascriptBytes, totalBytes: measurements.three.totalDeployBytes },
    magnitude: { javascriptBytesSmaller, javascriptPercentSmaller: javascriptBytesSmaller / measurements.three.javascriptBytes * 100, totalBytesSmaller, totalPercentSmaller: totalBytesSmaller / measurements.three.totalDeployBytes * 100 },
  };
}
