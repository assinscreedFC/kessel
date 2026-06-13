import type { ColumnType } from "kysely";
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export const DealStatus = {
    LEAD: "LEAD",
    PROPOSAL_SENT: "PROPOSAL_SENT",
    WON: "WON",
    LOST: "LOST"
} as const;
export type DealStatus = (typeof DealStatus)[keyof typeof DealStatus];
export const ProposalStatus = {
    DRAFT: "DRAFT"
} as const;
export type ProposalStatus = (typeof ProposalStatus)[keyof typeof ProposalStatus];
export type Contact = {
    id: string;
    orgId: string;
    name: string;
    email: string;
    organizationName: string | null;
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
    createdAt: Generated<Timestamp>;
    updatedAt: Timestamp;
};
export type Organization = {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    metadata: string | null;
    createdAt: Generated<Timestamp>;
};
export type OrgNote = {
    id: string;
    orgId: string;
    body: string;
    meta: unknown | null;
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
export type Proposal = {
    id: string;
    orgId: string;
    dealId: string;
    title: string;
    bodyJson: unknown;
    status: Generated<ProposalStatus>;
    createdAt: Generated<Timestamp>;
    updatedAt: Timestamp;
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
    position: number;
};
export type DB = {
    Contact: Contact;
    Deal: Deal;
    organization: Organization;
    OrgNote: OrgNote;
    PricingItem: PricingItem;
    Proposal: Proposal;
    ProposalTemplate: ProposalTemplate;
    QuoteLine: QuoteLine;
};
