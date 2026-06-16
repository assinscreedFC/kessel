import { randomBytes, createHash } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { forOrg } from "@kessel/db";

// ApiKeyService (API-01) — génération + révocation + liste de clés API.
//
// Sécurité :
//  - T-5-apikey : la clé brute est retournée UNE seule fois au moment de la génération ;
//    seul le hash SHA-256 (keyHash) est persisté en base, jamais la clé brute.
//  - listKeys exclut keyHash de la sélection — seuls prefix/name/dates sont exposés.
//  - revokeKey est scopé via forOrg(orgId) : l'org-A ne peut pas révoquer une clé de l'org-B.

@Injectable()
export class ApiKeyService {
  /**
   * Génère une clé API `ksl_live_<32hex>` pour l'org.
   * Retourne { id, key, prefix } — `key` brute retournée UNE SEULE FOIS, jamais stockée/loggée.
   */
  async generateKey(
    orgId: string,
    name: string,
  ): Promise<{ id: string; key: string; prefix: string }> {
    const rand = randomBytes(16).toString("hex"); // 32 hex chars
    const key = `ksl_live_${rand}`;
    const keyHash = createHash("sha256").update(key).digest("hex");
    const prefix = `ksl_live_${rand.slice(0, 8)}`;

    const row = await forOrg(orgId).apiKey.create({
      data: { name, keyHash, prefix } as never,
    });

    // key brute UNIQUEMENT dans la valeur retournée — jamais loggée (T-5-apikey).
    return { id: row.id, key, prefix };
  }

  /**
   * Liste les clés de l'org sans jamais exposer le keyHash ni la clé brute.
   */
  async listKeys(orgId: string): Promise<
    Array<{
      id: string;
      name: string;
      prefix: string;
      createdAt: Date;
      revokedAt: Date | null;
    }>
  > {
    return forOrg(orgId).apiKey.findMany({
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Révoque une clé par id pour l'org (anti-IDOR : forOrg scoping).
   * Lance NotFoundException si la clé est introuvable ou déjà révoquée.
   */
  async revokeKey(orgId: string, id: string): Promise<void> {
    const result = await forOrg(orgId).apiKey.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException("API key not found or already revoked");
    }
  }
}
