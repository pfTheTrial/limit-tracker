export type DevinLimitScope = "enterprise" | "org" | "user";

export interface DevinAcuLimit {
  scope: DevinLimitScope;
  orgId: string | null;
  userId: string | null;
  /** ACUs allowed per billing cycle at this scope. */
  cycleAcuLimit: number;
}

export interface DevinProductAcus {
  devin: number;
  cascade: number;
  terminal: number;
  review: number;
}

export interface DevinUsage {
  /** Current billing cycle bounds, epoch ms. */
  cycleStartMs: number;
  cycleEndMs: number;
  /** Org-level Devin ACU limits for the enterprise (any scope). */
  limits: DevinAcuLimit[];
  /** ACUs consumed this cycle, enterprise-wide, all products. */
  totalAcus: number;
  /** Cycle consumption attributed to the Devin product. */
  devinAcus: number;
  byProduct: DevinProductAcus;
}

export interface DevinError {
  type: "not_configured" | "unauthorized" | "forbidden" | "network_error" | "parse_error" | "unknown";
  message: string;
}
