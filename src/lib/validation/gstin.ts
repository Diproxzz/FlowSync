const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isValidGstinFormat(gstin: string): boolean {
  if (!gstin) return false;
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

export function isValidGstinChecksum(gstin: string): boolean {
  const g = gstin.trim().toUpperCase();
  if (!isValidGstinFormat(g)) return false;

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const code = GSTIN_CHARS.indexOf(g[i]);
    if (code === -1) return false;

    const weight = i % 2 === 0 ? 1 : 2;
    const product = code * weight;
    const factor = Math.floor(product / 36) + (product % 36);
    sum += factor;
  }

  const remainder = sum % 36;
  const checkDigitIndex = (36 - remainder) % 36;
  return GSTIN_CHARS[checkDigitIndex] === g[14];
}

export function validateGstin(
  gstin: string | null | undefined,
  companyGstin: string
): { isValid: boolean; code?: string; message?: string } {
  if (!gstin || !gstin.trim()) {
    return {
      isValid: false,
      code: "GSTIN_MISSING",
      message: "Customer GSTIN is missing (unregistered buyer)",
    };
  }

  const g = gstin.trim().toUpperCase();

  if (companyGstin && g === companyGstin.trim().toUpperCase()) {
    return {
      isValid: false,
      code: "GSTIN_IS_COMPANY",
      message: "Customer GSTIN matches company's own issuer GSTIN",
    };
  }

  if (!isValidGstinFormat(g)) {
    return {
      isValid: false,
      code: "GSTIN_FORMAT",
      message: "Invalid GSTIN format. Expected 15 characters (e.g. 19AAACR6862N1ZP)",
    };
  }

  if (!isValidGstinChecksum(g)) {
    return {
      isValid: false,
      code: "GSTIN_CHECKSUM",
      message: "GSTIN checksum verification failed (check digit mismatch)",
    };
  }

  return { isValid: true };
}
