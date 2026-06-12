let localIdCounter = 0;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export const createNotificationId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  localIdCounter += 1;
  return `notification-${Date.now().toString(16)}-${localIdCounter}`;
};

export const createLocalTransactionHash = () => {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return `0x${toHex(bytes)}`;
  }

  localIdCounter += 1;
  return `0x${`${Date.now().toString(16)}${localIdCounter.toString(16)}`.padStart(64, '0').slice(-64)}`;
};

export const createAppraisalEvidenceUri = (assetId: string) =>
  `urn:pawnshop:staff-appraisal:${encodeURIComponent(assetId)}`;
