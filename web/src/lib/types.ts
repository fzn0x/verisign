export type DocumentStatus = "pending" | "issued" | "revoked";

export interface Issuer {
  organization: string;
  signatory: string;
  role: string;
  url: string;
}

export interface Stamp {
  page: number;
  /** Top-left corner as a fraction of the visible page width. */
  x: number;
  /** Top-left corner as a fraction of the visible page height. */
  y: number;
  sizeMm: number;
}

export interface PublicDocument {
  id: string;
  serial: string;
  status: DocumentStatus;
  title: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  issuer: Issuer;
  issuedAt: string | null;
  revokedAt: string | null;
  revocationReason?: string;
  verifyUrl: string;
}

export interface StudioDocument extends PublicDocument {
  sha512?: string;
  stamp: Stamp | null;
  createdAt: string;
}

export interface VerifyResult {
  match: boolean;
  status: DocumentStatus;
  checkedAt: string;
  recordedSha512?: string;
  suppliedSha512: string;
}

export interface Session {
  authenticated: boolean;
  signInAvailable: boolean;
}

export interface DocumentList {
  documents: StudioDocument[];
  counts: Record<DocumentStatus, number>;
  nextCursor?: string;
}

export interface StudioIssuer extends Issuer {
  saved: boolean;
}

export interface Draft {
  title: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
}

export interface Finalization {
  sha512: string;
  fileSize: number;
  stamp: Stamp;
}
