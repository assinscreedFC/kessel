import type { ColumnType } from "kysely";
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export const VatRegime = {
    FRANCHISE: "FRANCHISE",
    NORMAL: "NORMAL",
    INTRACOM: "INTRACOM"
} as const;
export type VatRegime = (typeof VatRegime)[keyof typeof VatRegime];
export const DealStatus = {
    LEAD: "LEAD",
    PROPOSAL_SENT: "PROPOSAL_SENT",
    WON: "WON",
    LOST: "LOST"
} as const;
export type DealStatus = (typeof DealStatus)[keyof typeof DealStatus];
export const ActivityType = {
    NOTE: "NOTE",
    CALL: "CALL",
    EMAIL: "EMAIL",
    MEETING: "MEETING"
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];
export const ProposalStatus = {
    DRAFT: "DRAFT",
    SENT: "SENT",
    SIGNED: "SIGNED"
} as const;
export type ProposalStatus = (typeof ProposalStatus)[keyof typeof ProposalStatus];
export const ProposalEventType = {
    SENT: "SENT",
    OPENED: "OPENED",
    VIEWED: "VIEWED"
} as const;
export type ProposalEventType = (typeof ProposalEventType)[keyof typeof ProposalEventType];
export const OutcomeKind = {
    WON: "WON",
    LOST: "LOST"
} as const;
export type OutcomeKind = (typeof OutcomeKind)[keyof typeof OutcomeKind];
export const ProjectStatus = {
    ACTIVE: "ACTIVE",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED"
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];
export const PaymentKind = {
    DEPOSIT: "DEPOSIT",
    BALANCE: "BALANCE"
} as const;
export type PaymentKind = (typeof PaymentKind)[keyof typeof PaymentKind];
export const PaymentStatus = {
    PENDING: "PENDING",
    PAID: "PAID",
    FAILED: "FAILED"
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];
export const DeliveryStatus = {
    PENDING: "PENDING",
    DELIVERED: "DELIVERED",
    FAILED: "FAILED"
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];
export type ApiKey = {
    id: string;
    orgId: string;
    name: string;
    keyHash: string;
    prefix: string;
    revokedAt: Timestamp | null;
    createdAt: Generated<Timestamp>;
};
export type ClientOrg = {
    id: string;
    orgId: string;
    name: string;
    createdAt: Generated<Timestamp>;
};
export type Contact = {
    id: string;
    orgId: string;
    name: string;
    email: string;
    organizationName: string | null;
    clientOrgId: string | null;
    createdAt: Generated<Timestamp>;
    updatedAt: Timestamp;
};
export type Deal = {
    id: string;
    orgId: string;
    contactId: string;
    title: string;
    status: Generated<DealStatus>;
    amount: string | null;
    position: Generated<number>;
    clientOrgId: string | null;
    createdAt: Generated<Timestamp>;
    updatedAt: Timestamp;
};
export type DealActivity = {
    id: string;
    dealId: string;
    type: ActivityType;
    content: string;
    createdAt: Generated<Timestamp>;
};
export type Organization = {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    metadata: string | null;
    createdAt: Generated<Timestamp>;
    defaultDepositPercent: Generated<number>;
    vatRegime: Generated<VatRegime>;
    vatNumber: string | null;
    country: Generated<string>;
    defaultLocale: Generated<string>;
    brandColor: string | null;
};
export type OrgNote = {
    id: string;
    orgId: string;
    body: string;
    meta: unknown | null;
    createdAt: Generated<Timestamp>;
};
export type Payment = {
    id: string;
    orgId: string;
    projectId: string;
    stripePaymentIntentId: string;
    kind: Generated<PaymentKind>;
    status: Generated<PaymentStatus>;
    amountCents: number;
    currency: Generated<string>;
    paymentTokenHash: string | null;
    createdAt: Generated<Timestamp>;
    updatedAt: Timestamp;
};
export type PortalFile = {
    id: string;
    orgId: string;
    contactId: string;
    filename: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    uploadedAt: Generated<Timestamp>;
};
export type PortalSession = {
    id: string;
    contactId: string;
    tokenHash: string;
    expiresAt: Timestamp;
    usedAt: Timestamp | null;
    createdAt: Generated<Timestamp>;
};
export type PricingItem = {
    id: string;
    orgId: string;
    name: string;
    unitPrice: string;
    unit: string | null;
    createdAt: Generated<Timestamp>;
    updatedAt: Timestamp;
};
export type ProcessedStripeEvent = {
    id: string;
    eventId: string;
    type: string;
    createdAt: Generated<Timestamp>;
};
export type Project = {
    id: string;
    orgId: string;
    dealId: string;
    proposalId: string;
    title: string;
    status: Generated<ProjectStatus>;
    budgetSnapshot: unknown;
    createdAt: Generated<Timestamp>;
    updatedAt: Timestamp;
};
export type Proposal = {
    id: string;
    orgId: string;
    dealId: string;
    title: string;
    bodyJson: unknown;
    status: Generated<ProposalStatus>;
    shareTokenHash: string | null;
    depositPercent: number | null;
    sentAt: Timestamp | null;
    signedAt: Timestamp | null;
    createdAt: Generated<Timestamp>;
    updatedAt: Timestamp;
};
export type ProposalEvent = {
    id: string;
    proposalId: string;
    type: ProposalEventType;
    occurredAt: Generated<Timestamp>;
    meta: unknown | null;
};
export type ProposalOutcome = {
    id: string;
    proposalId: string;
    outcome: OutcomeKind;
    decidedAt: Generated<Timestamp>;
    reason: string | null;
    context: unknown;
};
export type ProposalTemplate = {
    id: string;
    orgId: string;
    name: string;
    bodyJson: unknown;
    createdAt: Generated<Timestamp>;
    updatedAt: Timestamp;
};
export type QuoteLine = {
    id: string;
    proposalId: string;
    description: string;
    quantity: Generated<string>;
    unitPrice: string;
    vatRate: Generated<string>;
    position: number;
};
export type Signature = {
    id: string;
    proposalId: string;
    signerName: string;
    signerEmail: string;
    signedAt: Generated<Timestamp>;
    documentHash: string;
    signedPdfKey: string;
    auditTrail: unknown | null;
};
export type Task = {
    id: string;
    projectId: string;
    title: string;
    done: Generated<boolean>;
    position: number;
    createdAt: Generated<Timestamp>;
    updatedAt: Timestamp;
};
export type WebhookDelivery = {
    id: string;
    webhookEndpointId: string;
    event: string;
    payload: unknown;
    status: Generated<DeliveryStatus>;
    responseCode: number | null;
    attemptCount: Generated<number>;
    deliveredAt: Timestamp | null;
    createdAt: Generated<Timestamp>;
};
export type WebhookEndpoint = {
    id: string;
    orgId: string;
    url: string;
    secret: string;
    events: string[];
    active: Generated<boolean>;
    createdAt: Generated<Timestamp>;
    updatedAt: Timestamp;
};
export type DB = {
    ApiKey: ApiKey;
    ClientOrg: ClientOrg;
    Contact: Contact;
    Deal: Deal;
    DealActivity: DealActivity;
    organization: Organization;
    OrgNote: OrgNote;
    Payment: Payment;
    PortalFile: PortalFile;
    PortalSession: PortalSession;
    PricingItem: PricingItem;
    ProcessedStripeEvent: ProcessedStripeEvent;
    Project: Project;
    Proposal: Proposal;
    ProposalEvent: ProposalEvent;
    ProposalOutcome: ProposalOutcome;
    ProposalTemplate: ProposalTemplate;
    QuoteLine: QuoteLine;
    Signature: Signature;
    Task: Task;
    WebhookDelivery: WebhookDelivery;
    WebhookEndpoint: WebhookEndpoint;
};
