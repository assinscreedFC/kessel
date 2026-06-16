import { Calendar, Mail, MessageSquare, Phone } from "lucide-react";
import type { DealActivityDto } from "@/entities/deal-activity/model";

// TimelineItem — entrée de la timeline d'activité d'un deal (CRM-08, UI-SPEC).
// Icône dans cercle h-8 w-8 bg-slate-100, couleur slate-500.
// Mapping type → icône lucide :
//   NOTE    → MessageSquare
//   CALL    → Phone
//   EMAIL   → Mail
//   MEETING → Calendar

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function ActivityIcon({ type }: { type: DealActivityDto["type"] }) {
  const cls = "h-4 w-4 text-slate-500";
  switch (type) {
    case "NOTE":
      return <MessageSquare className={cls} />;
    case "CALL":
      return <Phone className={cls} />;
    case "EMAIL":
      return <Mail className={cls} />;
    case "MEETING":
      return <Calendar className={cls} />;
  }
}

interface TimelineItemProps {
  activity: DealActivityDto;
}

export function TimelineItem({ activity }: TimelineItemProps) {
  return (
    <div className="flex gap-3">
      {/* Icône type dans cercle */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
        <ActivityIcon type={activity.type} />
      </div>

      {/* Contenu + timestamp */}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{activity.content}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {dateFormatter.format(new Date(activity.createdAt))}
        </p>
      </div>
    </div>
  );
}
