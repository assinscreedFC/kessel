import { useEditor, EditorContent } from "@tiptap/react";
import { PROPOSAL_EXTENSIONS } from "@kessel/shared";
import { Toolbar } from "./toolbar";

// Éditeur Tiptap du corps de proposition (PROP-01). Consomme PROPOSAL_EXTENSIONS — la MÊME liste que
// le serveur PDF (generateHTML) -> fidélité éditeur->PDF par construction (Plan 01/03).
//
// Pitfall 2 (uncontrolled) : le `content` est initialisé UNE SEULE fois (au montage via la valeur
// initiale passée à useEditor). On NE re-set JAMAIS le contenu à chaque render (le curseur sauterait).
// `onUpdate` remonte le JSON ProseMirror courant à l'appelant (page éditeur) qui le passe à l'autosave.

interface ProposalEditorProps {
  // Document ProseMirror initial (depuis la DB). Lu une fois au montage.
  initialContent: unknown;
  // Appelé à chaque édition avec le JSON courant -> l'appelant schedule l'autosave (argument, pas closure).
  onChange: (bodyJson: unknown) => void;
}

export function ProposalEditor({ initialContent, onChange }: ProposalEditorProps) {
  const editor = useEditor({
    extensions: PROPOSAL_EXTENSIONS,
    // Initialisé UNE fois : Tiptap est uncontrolled, on ne pousse pas `content` à chaque render.
    content: (initialContent as object | null) ?? undefined,
    editorProps: {
      attributes: {
        // Canvas typographie 03-UI-SPEC : reading measure max-w-3xl, prose slate, placeholder géré
        // par le style .is-editor-empty (CSS global) ; ici on contraint la mesure de lecture.
        class:
          "tiptap prose-editor mx-auto max-w-3xl text-sm leading-relaxed text-slate-900 focus:outline-none min-h-[50vh]",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });

  return (
    <div>
      <Toolbar editor={editor} />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
