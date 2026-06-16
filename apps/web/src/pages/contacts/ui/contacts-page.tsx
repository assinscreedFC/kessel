import { useState } from "react";
import { Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { ContactDialog } from "@/features/create-contact/ui/contact-dialog";
import { CsvImportDialog } from "@/features/csv-import/ui/csv-import-dialog";
import { useContacts } from "@/entities/contact/api";
import type { Contact } from "@/entities/contact/model";

// Page Contacts (couche `pages`). Couvre CRM-01 côté front : table dense (02-UI-SPEC) avec ses
// 4 états obligatoires (loading skeleton / empty+CTA / error+retry / populated) + Dialog create/edit.
// Le clic sur une ligne ouvre le Dialog en mode édition ; le CTA en-tête en mode création.
// CRM-09 : bouton "Importer des contacts" (variant outline) déclenche CsvImportDialog.

const SKELETON_ROWS = 5;

export function ContactsPage() {
  const { data: contacts, isPending, isError, refetch } = useContacts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (contact: Contact) => {
    setEditing(contact);
    setDialogOpen(true);
  };

  return (
    <div>
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Contacts</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCsvDialogOpen(true)}>
            Importer des contacts
          </Button>
          <Button onClick={openCreate}>Nouveau contact</Button>
        </div>
      </header>

      <TableContainer>
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : contacts.length === 0 ? (
          <EmptyState onCreate={openCreate} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Organisation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  className="h-11 cursor-pointer hover:bg-slate-50"
                  onClick={() => openEdit(contact)}
                >
                  <TableCell className="font-medium">{contact.name}</TableCell>
                  <TableCell className="text-slate-500">{contact.email}</TableCell>
                  <TableCell className="text-slate-500">
                    {contact.organizationName ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <ContactDialog open={dialogOpen} onOpenChange={setDialogOpen} contact={editing} />
      <CsvImportDialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen} />
    </div>
  );
}

function LoadingState() {
  return (
    <div>
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <div
          key={i}
          className="flex h-11 items-center gap-4 border-b border-slate-100 px-4 last:border-0"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Users className="h-10 w-10 text-slate-300" />
      <h2 className="text-base font-semibold text-slate-900">Aucun contact pour l'instant</h2>
      <p className="max-w-sm text-sm text-slate-500">
        Créez votre premier contact pour commencer à suivre vos prospects.
      </p>
      <Button onClick={onCreate} className="mt-1">
        Nouveau contact
      </Button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm font-semibold text-red-600">Impossible de charger les données.</p>
      <p className="text-sm text-slate-500">Vérifiez votre connexion et réessayez.</p>
      <Button variant="outline" onClick={onRetry} className="mt-1">
        Réessayer
      </Button>
    </div>
  );
}
