import type { ColumnType } from "kysely";
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type Organization = {
    id: string;
    name: string;
    createdAt: Generated<Timestamp>;
};
export type OrgNote = {
    id: string;
    orgId: string;
    body: string;
    meta: unknown | null;
    createdAt: Generated<Timestamp>;
};
export type DB = {
    organization: Organization;
    OrgNote: OrgNote;
};
