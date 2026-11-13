import type { BookingStatus } from "@/lib/booking/rules";

// Una richiesta come la vede la pagina (date in millisecondi: si passano al client così come sono).
export type BookingItem = {
  id: string;
  code: string;
  status: BookingStatus;
  day: string;
  time: string;
  startsAt: number;
  people: number;
  name: string;
  phone: string;
  email: string | null;
  contact: string;
  note: string | null;
  allergies: boolean;
  source: string | null;
  promoTitle: string | null;
  proposedTime: string | null;
  proposedStartsAt: number | null;
  staffMessage: string | null;
  handledAt: number | null;
  handledBy: string | null;
  cancelledBy: string | null;
  arrivedAt: number | null;
  noShowAt: number | null;
  isTest: boolean;
  // Agenda: tavolo, chi l'ha segnata (null = online dal cliente), segnata a mano.
  table: string | null;
  createdBy: string | null;
  manual: boolean;
  // Dati ancora da definire (ora: time "", persone: people 0) e menù scelto.
  timeUnknown: boolean;
  peopleUnknown: boolean;
  menu: string | null;
  createdAt: number;
  // Per la modifica: se nel frattempo qualcun altro l'ha cambiata, non si sovrascrive.
  updatedAt: number;
  statusUrl: string;
  log: { at: number; actor: string; kind: string; message: string | null }[];
};

export type BookingStatsData = {
  total: number;
  confirmed: number;
  declined: number;
  cancelled: number;
  noShow: number;
  people: number;
  manual: { total: number; confirmed: number; people: number; cancelled: number };
  medianResponseMinutes: number | null;
  bySource: [string, number][];
};
