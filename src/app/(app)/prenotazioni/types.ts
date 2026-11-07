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
  createdAt: number;
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
  medianResponseMinutes: number | null;
  bySource: [string, number][];
};
