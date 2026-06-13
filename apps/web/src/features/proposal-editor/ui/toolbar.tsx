import { useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
} from "lucide-react";
import { Toggle } from "@/shared/ui/toggle";
import { Separator } from "@/shared/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

// Toolbar de l'éditeur Tiptap (03-UI-SPEC §Tiptap Toolbar). 7 contrôles groupés par Separator :
// H1/H2 · Gras/Italique · Liste/Liste numérotée · Lien. Chaque bouton = Toggle dont `pressed` reflète
// editor.isActive(...) (état du DOCUMENT -> actif bg-slate-900) ; Tooltip FR. Lien = Popover (Input URL
// + Lien/Retirer). Sticky, aligné sur la mesure du canvas (max-w-3xl).

interface ToolbarProps {
  editor: Editor | null;
}

interface ToolButtonProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolButton({ label, icon: Icon, isActive, disabled, onClick }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          pressed={isActive}
          disabled={disabled}
          onPressedChange={onClick}
          aria-label={label}
        >
          <Icon className="h-4 w-4" />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Toolbar({ editor }: ToolbarProps) {
  if (!editor) return null;
  return (
    <TooltipProvider delayDuration={300}>
      <div className="sticky top-16 z-10 mx-auto mb-4 flex h-10 max-w-3xl items-center gap-1 rounded-lg border border-slate-200 bg-white px-2">
        <ToolButton
          label="Titre"
          icon={Heading1}
          isActive={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolButton
          label="Sous-titre"
          icon={Heading2}
          isActive={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <Separator orientation="vertical" className="mx-1" />
        <ToolButton
          label="Gras"
          icon={Bold}
          isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolButton
          label="Italique"
          icon={Italic}
          isActive={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <Separator orientation="vertical" className="mx-1" />
        <ToolButton
          label="Liste à puces"
          icon={List}
          isActive={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolButton
          label="Liste numérotée"
          icon={ListOrdered}
          isActive={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <Separator orientation="vertical" className="mx-1" />
        <LinkControl editor={editor} />
      </div>
    </TooltipProvider>
  );
}

// Affordance Lien : Popover avec Input URL + bouton "Lien" (applique) et "Retirer" (si lien existant).
// URL vide/invalide => no-op (pas de toast, faible enjeu — 03-UI-SPEC).
function LinkControl({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const isActive = editor.isActive("link");

  const openPopover = (next: boolean) => {
    if (next) {
      // Pré-remplir avec l'URL du lien courant si la sélection en a un.
      setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
    }
    setOpen(next);
  };

  const apply = () => {
    const trimmed = url.trim();
    if (trimmed === "") {
      setOpen(false);
      return; // no-op sur URL vide
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    setOpen(false);
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={openPopover}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Toggle pressed={isActive} aria-label="Lien">
              <LinkIcon className="h-4 w-4" />
            </Toggle>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Lien</TooltipContent>
      </Tooltip>
      <PopoverContent>
        <div className="flex flex-col gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            onKeyDown={(e) => e.key === "Enter" && apply()}
            autoFocus
          />
          <div className="flex items-center justify-between">
            {isActive ? (
              <button
                type="button"
                onClick={remove}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Retirer
              </button>
            ) : (
              <span />
            )}
            <Button size="sm" onClick={apply}>
              Lien
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
