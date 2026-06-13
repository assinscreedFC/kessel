import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/utils";
import { usePricingItems } from "@/entities/pricing-item/api";
import type { PricingItem } from "@/entities/pricing-item/model";
import type { QuoteLine, Proposal } from "@/entities/proposal/model";
import {
  useAddQuoteLine,
  useDeleteQuoteLine,
  useReorderQuoteLines,
  useUpdateQuoteLine,
} from "@/entities/proposal/api";
import { formatEur, formatGrandTotal, formatLineTotal } from "../lib/totals";

// Quote builder (03-UI-SPEC §Quote Builder, PROP-03). Table éditable de lignes de devis dans une card,
// colonne droite de l'éditeur. Ajout : "Depuis la grille de tarifs" (SNAPSHOT — copie name/unitPrice du
// PricingItem, AUCUNE FK envoyée) ou "Ligne libre". Édition qty/prix/description -> PATCH onBlur.
// Réordonnancement par SWAP (chevrons monter/descendre — pas de drag-and-drop au v0, YAGNI). Suppression
// inline (pas de confirm). Grand total live (autorité serveur grandTotal, optimiste pendant l'édition).

const FREE_LINE_DESCRIPTION = "Nouvelle ligne"; // description @IsNotEmpty serveur : une ligne libre démarre avec un libellé.

interface QuoteBuilderProps {
  proposal: Proposal;
}

export function QuoteBuilder({ proposal }: QuoteBuilderProps) {
  const lines = proposal.lines;
  const addLine = useAddQuoteLine(proposal.id);
  const reorder = useReorderQuoteLines(proposal.id);
  const [pickerOpen, setPickerOpen] = useState(false);

  const addFreeLine = () => {
    addLine.mutate({
      description: FREE_LINE_DESCRIPTION,
      quantity: 1,
      unitPrice: 0,
      position: lines.length,
    });
  };

  // Snapshot depuis la grille : on copie name -> description, unitPrice -> unitPrice (Number).
  // AUCUNE référence d'item de grille n'est envoyée (le serveur n'a pas de FK ; le devis ne mute
  // jamais si la grille change — T-3-web-snapshot).
  const addFromGrid = (item: PricingItem) => {
    addLine.mutate({
      description: item.name,
      quantity: 1,
      unitPrice: Number(item.unitPrice),
      position: lines.length,
    });
    setPickerOpen(false);
  };

  // Swap de positions : déplace la ligne `index` vers `index + dir`, puis envoie l'ordre des ids.
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= lines.length) return;
    const ids = lines.map((l) => l.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex h-10 items-center justify-between border-b border-slate-200 px-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Devis</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Ajouter une ligne
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setPickerOpen(true)}>
              Depuis la grille de tarifs
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={addFreeLine}>Ligne libre</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {lines.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500">
          Aucune ligne. Ajoutez une prestation pour chiffrer.
        </div>
      ) : (
        <div>
          {lines.map((line, index) => (
            <QuoteLineRow
              key={line.id}
              proposalId={proposal.id}
              line={line}
              isFirst={index === 0}
              isLast={index === lines.length - 1}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
            />
          ))}
        </div>
      )}

      <div className="flex h-12 items-center justify-between border-t-2 border-slate-200 bg-slate-50 px-4">
        <span className="text-sm font-semibold text-slate-900">Total</span>
        <span className="text-base font-semibold tabular-nums text-slate-900">
          {/* Autorité serveur (grandTotal decimal.js) quand dispo ; optimiste si l'édition n'a pas
              encore été persistée (le cache est mis à jour avec la réponse serveur après chaque mutation). */}
          {lines.length === 0 ? formatEur(proposal.grandTotal) : formatGrandTotal(lines)}
        </span>
      </div>

      <PricingPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={addFromGrid}
      />
    </div>
  );
}

interface QuoteLineRowProps {
  proposalId: string;
  line: QuoteLine;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

// Une ligne éditable : description (input borderless) / Qté / Prix unit. / Total (read-only) / actions.
// Édition locale puis PATCH onBlur (évite un PATCH par frappe). Le total ligne est optimiste (live).
function QuoteLineRow({
  proposalId,
  line,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: QuoteLineRowProps) {
  const update = useUpdateQuoteLine(proposalId);
  const remove = useDeleteQuoteLine(proposalId);

  const [description, setDescription] = useState(line.description);
  const [quantity, setQuantity] = useState(line.quantity);
  const [unitPrice, setUnitPrice] = useState(line.unitPrice);

  const commitDescription = () => {
    const next = description.trim();
    if (next !== "" && next !== line.description) {
      update.mutate({ lineId: line.id, patch: { description: next } });
    } else if (next === "") {
      setDescription(line.description); // description @IsNotEmpty : on restaure si vidée
    }
  };
  const commitQuantity = () => {
    if (quantity !== line.quantity && quantity !== "") {
      update.mutate({ lineId: line.id, patch: { quantity: Number(quantity) } });
    }
  };
  const commitUnitPrice = () => {
    if (unitPrice !== line.unitPrice && unitPrice !== "") {
      update.mutate({ lineId: line.id, patch: { unitPrice: Number(unitPrice) } });
    }
  };

  return (
    <div className="flex h-11 items-center gap-2 border-b border-slate-100 px-2 hover:bg-slate-50">
      <div className="flex flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label="Monter"
          className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label="Descendre"
          className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={commitDescription}
        placeholder="Description"
        className="h-9 flex-1 border-0 px-1 focus-visible:ring-1"
      />
      <Input
        type="number"
        min={0}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        onBlur={commitQuantity}
        className="h-9 w-16 px-1 text-right tabular-nums"
      />
      <Input
        type="number"
        min={0}
        value={unitPrice}
        onChange={(e) => setUnitPrice(e.target.value)}
        onBlur={commitUnitPrice}
        className="h-9 w-24 px-1 text-right tabular-nums"
      />
      <span className="w-24 text-right text-sm tabular-nums text-slate-900">
        {formatLineTotal(quantity || "0", unitPrice || "0")}
      </span>
      <button
        type="button"
        onClick={() => remove.mutate(line.id)}
        aria-label="Supprimer la ligne"
        className="text-slate-400 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// Picker "Depuis la grille de tarifs" : Select des PricingItem -> au choix, insère un SNAPSHOT.
interface PricingPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: PricingItem) => void;
}

function PricingPicker({ open, onOpenChange, onPick }: PricingPickerProps) {
  const { data: items } = usePricingItems();
  const [selectedId, setSelectedId] = useState("");

  const confirm = () => {
    const item = (items ?? []).find((i) => i.id === selectedId);
    if (item) onPick(item);
    setSelectedId("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Depuis la grille de tarifs</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col">
          <Label htmlFor="pricing-item" className="mb-1.5">
            Prestation
          </Label>
          <Select value={selectedId || undefined} onValueChange={setSelectedId}>
            <SelectTrigger id="pricing-item">
              <SelectValue placeholder="Choisir une prestation" />
            </SelectTrigger>
            <SelectContent>
              {(items ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} — {formatEur(item.unitPrice)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={confirm} disabled={selectedId === ""} className={cn()}>
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
