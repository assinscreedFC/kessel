import { Body, Controller, Post } from "@nestjs/common";
import { OrgRoles, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { forOrg } from "@kessel/db";

// POST /settings — action OWNER-ONLY (FOUND-03 / T-1-02 : escalade de privilège bloquée).
//
// RBAC DOUBLE (CLAUDE.md : pas seulement au contrôleur) :
//   1. CONTRÔLEUR : @OrgRoles(["owner"]) — un member reçoit 403 avant d'atteindre le handler.
//   2. ORM : l'écriture passe par forOrg(session.activeOrganizationId) — l'orgId scopé à l'ORM
//      est EXACTEMENT l'activeOrganizationId de la session (même source canonique Better Auth que
//      @OrgRoles). Un seul espace d'id : pas d'isolation fantôme (T-1-10).
@Controller("settings")
export class SettingsController {
  @OrgRoles(["owner"])
  @Post()
  async updateSettings(
    @Session() session: UserSession<typeof auth>,
    @Body() body: { note?: string },
  ): Promise<{ orgId: string; noteId: string }> {
    // activeOrganizationId = id canonique de l'org active (Better Auth). C'est CET id qui alimente
    // forOrg — donc l'orgId filtré/écrit à l'ORM === l'orgId vérifié par @OrgRoles au contrôleur.
    const orgId = session.session.activeOrganizationId;
    if (!orgId) {
      throw new Error("No active organization in session (activeOrganizationId missing).");
    }

    const created = await forOrg(orgId).orgNote.create({
      data: { body: body?.note ?? "settings updated" } as never,
    });

    return { orgId, noteId: created.id };
  }
}
