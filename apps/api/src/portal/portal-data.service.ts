import { Inject, Injectable } from "@nestjs/common";
import { db } from "@kessel/db";
import { StorageService } from "@kessel/proposals";
import type { PortalProposalDto } from "./dto/portal-proposals.dto";
import type { PortalProjectDto, PortalTaskDto } from "./dto/portal-project.dto";
import type { PortalPaymentDto } from "./dto/portal-payments.dto";
import type { PortalFileDto } from "./dto/portal-files.dto";

// PortalDataService — agrégation cross-domaine pour le portail client (FOUND-05).
//
// ISOLATION (T-4-iso-org + T-4-iso-contact, non négociable) :
//  - Chaque requête est scopée DOUBLEMENT : Deal.contactId (cross-contact) ET orgId (cross-org).
//  - Les propositions n'ont PAS de Proposal.contactId direct — le join via Deal est OBLIGATOIRE (Pitfall 4).
//  - Les paiements sont scopés projectId + orgId (double WHERE = isolation prouvée T-4-iso-dash).
//
// LECTURE SEULE : aucune écriture ici, zéro Prisma mutation (T-4-write).

@Injectable()
export class PortalDataService {
  // @Inject explicite (esbuild n'émet pas design:paramtypes — CLAUDE.md pattern).
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  // PORT-02 : propositions du contact via son deal.
  // innerJoin Deal WHERE Deal.contactId = contactId AND Proposal.orgId = orgId.
  // JAMAIS de WHERE Proposal.contactId (n'existe pas — Pitfall 4).
  async listProposals(contactId: string, orgId: string): Promise<PortalProposalDto[]> {
    const rows = await db
      .selectFrom("Proposal")
      .innerJoin("Deal", "Deal.id", "Proposal.dealId")
      .where("Deal.contactId", "=", contactId)
      .where("Proposal.orgId", "=", orgId)
      .select(["Proposal.id", "Proposal.title", "Proposal.status", "Proposal.createdAt"])
      .orderBy("Proposal.createdAt", "desc")
      .execute();

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status as "DRAFT" | "SENT" | "SIGNED",
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }));
  }

  // PORT-03 : projet le plus récent du contact (innerJoin Deal WHERE contactId + orgId).
  // Pas de Project.contactId direct (Pitfall 4) — join obligatoire via Deal.
  // Retourne null si aucun projet pour ce contact dans cet org (cross-contact/cross-org safe).
  async getProjectWithTasks(contactId: string, orgId: string): Promise<PortalProjectDto> {
    const project = await this.resolveProject(contactId, orgId);
    if (!project) return null;

    const taskRows = await db
      .selectFrom("Task")
      .where("Task.projectId", "=", project.id)
      .orderBy("Task.position", "asc")
      .select(["Task.id", "Task.title", "Task.done"])
      .execute();

    const tasks: PortalTaskDto[] = taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      done: Boolean(t.done),
    }));

    return {
      id: project.id,
      title: project.title,
      status: project.status as "ACTIVE" | "COMPLETED" | "CANCELLED",
      tasks,
    };
  }

  // PORT-04 : paiements du contact via son projet (double-scope orgId + projectId — T-4-iso-dash).
  // Si le contact n'a pas de projet dans cet org → retourne [] (cross-contact/cross-org safe).
  async getPayments(contactId: string, orgId: string): Promise<PortalPaymentDto[]> {
    const project = await this.resolveProject(contactId, orgId);
    if (!project) return [];

    const rows = await db
      .selectFrom("Payment")
      .where("Payment.projectId", "=", project.id)
      .where("Payment.orgId", "=", orgId)
      .orderBy("Payment.createdAt", "asc")
      .select(["Payment.id", "Payment.kind", "Payment.status", "Payment.amountCents", "Payment.currency"])
      .execute();

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as "DEPOSIT" | "BALANCE",
      status: row.status as "PENDING" | "PAID" | "FAILED",
      amountCents: row.amountCents,
      currency: row.currency,
    }));
  }

  // PORT-05 : fichiers portail du contact (double WHERE contactId + orgId — T-8-idor).
  // JAMAIS forOrg ici (Pitfall 3 RESEARCH) — isolation par double WHERE Kysely uniquement.
  // URL présignée générée pour chaque fichier (TTL 300s) — JAMAIS loggée (T-8-presign).
  async listFiles(contactId: string, orgId: string): Promise<PortalFileDto[]> {
    const rows = await db
      .selectFrom("PortalFile")
      .where("contactId", "=", contactId)
      .where("orgId", "=", orgId)
      .orderBy("uploadedAt", "desc")
      .selectAll()
      .execute();

    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        contactId: row.contactId,
        orgId: row.orgId,
        filename: row.filename,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        uploadedAt: row.uploadedAt instanceof Date ? row.uploadedAt.toISOString() : String(row.uploadedAt),
        presignedUrl: await this.storage.presignedGetObject(row.objectKey),
      })),
    );
  }

  // Méthode privée partagée : résoudre le projet le plus récent d'un contact dans un org.
  // innerJoin Deal WHERE Deal.contactId + Project.orgId — double isolation (T-4-iso).
  private async resolveProject(contactId: string, orgId: string) {
    return db
      .selectFrom("Project")
      .innerJoin("Deal", "Deal.id", "Project.dealId")
      .where("Deal.contactId", "=", contactId)
      .where("Project.orgId", "=", orgId)
      .orderBy("Project.createdAt", "desc")
      .select(["Project.id", "Project.title", "Project.status"])
      .executeTakeFirst();
  }
}
