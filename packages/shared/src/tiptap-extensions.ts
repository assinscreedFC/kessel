import StarterKit from "@tiptap/starter-kit";

// PROPOSAL_EXTENSIONS : source UNIQUE de la liste d'extensions Tiptap, consommée par l'éditeur web
// (useEditor) ET par le serveur (generateHTML pour le PDF) — garantit la fidélité éditeur->PDF par
// construction (PROP-07 : le PDF rend le MÊME HTML que l'éditeur, zéro dérive).
//
// FRAMEWORK-AGNOSTIQUE — ce fichier n'importe QUE @tiptap/core via StarterKit, jamais le binding UI :
// il doit rester importable côté Node (generateHTML serveur). EditorContent/useEditor vivent côté web.
//
// StarterKit v3 bundle DÉJÀ Link / Underline / ListKeymap : NE PAS installer @tiptap/extension-link
// séparément (warning "duplicate extension"). On configure Link via StarterKit.configure({ link }).
// Heading limité aux niveaux 1-3 (l'UI n'expose que H1/H2/H3).
export const PROPOSAL_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer nofollow" } },
  }),
];
