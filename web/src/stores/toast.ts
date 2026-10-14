import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  tone: "neutral" | "danger";
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, tone?: Toast["tone"]) => void;
  dismiss: (id: number) => void;
}

let next = 1;

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (message, tone = "neutral") => {
    const id = next++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone }] }));
    window.setTimeout(() => get().dismiss(id), 3600);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Shorthand for components that only need to post a message. */
export const toast = (message: string, tone?: Toast["tone"]) => useToasts.getState().show(message, tone);
