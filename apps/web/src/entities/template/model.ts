import type { ProposalTemplateDto } from "@kessel/shared";

// Modèle de l'entité Template côté web (couche `entities`).
//
// Le TYPE vient du contrat partagé @kessel/shared (source de vérité unique — anti-drift front/back).
// `Template` est un alias de `ProposalTemplateDto` (bodyJson = document ProseMirror, typé unknown).
// Pas de schéma de formulaire ici : la création/édition du corps passe par l'éditeur Tiptap (Plan 05) ;
// le seul champ saisi en Phase 3-04 est le `name` (rename), validé inline dans la page.

export type Template = ProposalTemplateDto;

// Document ProseMirror vide pour un nouveau template (la vraie édition du corps arrive Plan 05).
export const EMPTY_BODY_JSON = { type: "doc", content: [] } as const;
