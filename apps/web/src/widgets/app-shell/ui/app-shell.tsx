import { NavLink, Outlet } from "react-router-dom";
import { Brain, Briefcase, FileText, LayoutTemplate, Tag, Users } from "lucide-react";
import { cn } from "@/shared/lib/utils";

// App-shell — couche `widgets` de la FSD. Layout unique (02-UI-SPEC) réutilisé par toutes les
// pages : sidebar fixe 240px (bg-white border-r) + zone content slate-50.
//
// Deux variantes de zone content partageant la MÊME sidebar :
// - AppShell (par défaut) : content capé `max-w-6xl` (pages CRUD denses).
// - WideAppShell : content pleine largeur (éditeur de proposition — 03-UI-SPEC : la page éditeur
//   échappe au cap pour afficher éditeur + quote builder côte à côte).

interface NavItemProps {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

function NavItem({ to, icon: Icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          "flex h-9 items-center gap-2 rounded-md px-3 text-sm",
          isActive
            ? "bg-slate-100 font-semibold text-slate-900"
            : "text-slate-600 hover:bg-slate-50",
        )
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  );
}

function Sidebar() {
  return (
    <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
      <div className="px-4 py-5 text-base font-semibold tracking-tight">Kessel</div>
      <nav className="flex flex-col gap-1 px-2">
        <NavItem to="/" icon={Users} label="Contacts" />
        <NavItem to="/deals" icon={Briefcase} label="Deals" />
        <NavItem to="/proposals" icon={FileText} label="Propositions" />
        <NavItem to="/dataset" icon={Brain} label="Dataset IA" />
        <NavItem to="/pricing" icon={Tag} label="Tarifs" />
        <NavItem to="/templates" icon={LayoutTemplate} label="Templates" />
      </nav>
    </aside>
  );
}

// Layout capé (pages CRUD denses) : content px-8 py-8 + cap max-w-6xl centré.
export function AppShell() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar />
      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// Layout pleine largeur (éditeur de proposition) : pas de cap, pas de padding (la page éditeur gère
// son header sticky et son body en pleine largeur — 03-UI-SPEC §Proposal Editor page).
export function WideAppShell() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
