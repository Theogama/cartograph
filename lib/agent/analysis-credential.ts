import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 5 * 60 * 1000;

function getCredentialSecret(): string {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error("Missing required environment variable: CLERK_SECRET_KEY");
  }
  return secret;
}

export interface AnalysisCredentialPayload {
  analysisId: string;
  organizationId: string;
  exp: number;
}

export function mintAnalysisCredential(
  analysisId: string,
  organizationId: string,
): string {
  const secret = getCredentialSecret();
  const payload: AnalysisCredentialPayload = {
    analysisId,
    organizationId,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyAnalysisCredential(
  credential: string,
): AnalysisCredentialPayload {
  const [encoded, signature] = credential.split(".");
  if (!encoded || !signature) {
    throw new Error("Malformed analysis credential.");
  }

  const secret = getCredentialSecret();
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const expectedBuffer = Buffer.from(expected, "ascii");
  const actualBuffer = Buffer.from(signature, "ascii");
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Invalid analysis credential signature.");
  }

  let payload: AnalysisCredentialPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AnalysisCredentialPayload;
  } catch {
    throw new Error("Invalid analysis credential payload.");
  }

  if (!payload.analysisId || !payload.organizationId || typeof payload.exp !== "number") {
    throw new Error("Credential does not name a valid analysis.");
  }
  if (Date.now() > payload.exp) {
    throw new Error("Analysis credential has expired.");
  }

  return payload;
}
