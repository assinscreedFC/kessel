import { NavLink, Outlet } from "react-router-dom";
import { Briefcase, Users } from "lucide-react";
import { cn } from "@/shared/lib/utils";

// App-shell — couche `widgets` de la FSD. Layout unique (02-UI-SPEC) réutilisé par toutes les
// pages : sidebar fixe 240px (bg-white border-r) + zone content slate-50. Posé ici une fois ;
// la page Deals (Plan 04) le réutilise tel quel.

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

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="px-4 py-5 text-base font-semibold tracking-tight">Kessel</div>
        <nav className="flex flex-col gap-1 px-2">
          <NavItem to="/" icon={Users} label="Contacts" />
          <NavItem to="/deals" icon={Briefcase} label="Deals" />
        </nav>
      </aside>
      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
