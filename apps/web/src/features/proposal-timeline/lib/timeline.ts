import type { ProposalEventType, ProposalStatus } from "@kessel/shared";

// Logique PURE de la timeline (Suivi, DELIV-02) — testable sans rendu. 05-UI-SPEC §Tracking Timeline.
//
// Le serveur n'émet que des events SENT/OPENED/VIEWED (l'enum ProposalEventType, Plan 05-01). La
// transition SIGNED n'est PAS un event : elle est portée par Proposal.status. `buildRows` ajoute donc
// une ligne terminale SIGNED dérivée du statut. signerName n'est porté que si un event l'expose
// (champ optionnel) — sinon la ligne "Signée" s'affiche sans nom (jamais de fabrication).

export type TimelineRowType = ProposalEventType | "SIGNED";

// Forme minimale d'un event consommé (sous-ensemble de ProposalEventDto).
export interface ProposalEventLike {
  id: string;
  type: ProposalEventType;
  occurredAt: string;
  signerName?: string | null;
}

export interface TimelineRow {
  key: string;
  type: TimelineRowType;
  occurredAt: string;
  signerName?: string | null;
}

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// Horodatage "dd MMM yyyy à HH:mm" (fr-FR). Intl rend "13 juin 2026, 09:10" -> on remplace la virgule.
export function formatTimestamp(iso: string): string {
  return dateTimeFormatter.format(new Date(iso)).replace(",", " à");
}

// Construit les lignes chronologiques (récent en bas). Les events serveur sont déjà triés par
// occurredAt ; on ajoute la ligne SIGNED dérivée du statut (le serveur n'émet pas d'event SIGNED).
export function buildRows(events: ProposalEventLike[], status: ProposalStatus): TimelineRow[] {
  const rows: TimelineRow[] = events.map((e) => ({
    key: e.id,
    type: e.type,
    occurredAt: e.occurredAt,
    signerName: e.signerName ?? null,
  }));

  if (status === "SIGNED") {
    const signedName = events.find((e) => e.signerName)?.signerName ?? null;
    const lastAt =
      events.length > 0 ? events[events.length - 1].occurredAt : new Date().toISOString();
    rows.push({ key: "signed", type: "SIGNED", occurredAt: lastAt, signerName: signedName });
  }

  return rows;
}

// Sépare les lignes visibles des consultations excédentaires repliées (05-UI-SPEC : ~8 max, récent gardé).
export function splitOverflow(
  rows: TimelineRow[],
  maxVisible: number,
): { visible: TimelineRow[]; overflow: number } {
  if (rows.length <= maxVisible) {
    return { visible: rows, overflow: 0 };
  }
  const overflow = rows.length - maxVisible;
  return { visible: rows.slice(overflow), overflow };
}
