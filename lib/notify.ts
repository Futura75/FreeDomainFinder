import Swal, { SweetAlertIcon } from "sweetalert2";

let darkMode = false;

export function setNotifyTheme(dark: boolean) {
  darkMode = dark;
}

const surface = () => (darkMode ? "#2F3349" : "#FFFFFF");
const text = () => (darkMode ? "#CFD3EC" : "#4B4A5C");
const border = () => (darkMode ? "#3F4460" : "#DBDADE");

function themed(params: Record<string, unknown>) {
  return {
    background: surface(),
    color: text(),
    confirmButtonColor: "#1E6FCC",
    ...params,
  };
}

/** Transient toast notification (top-right, auto-dismiss). */
export function toast(
  icon: SweetAlertIcon,
  title: string,
  opts: { timer?: number } = {}
) {
  const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: opts.timer ?? 3500,
    timerProgressBar: true,
    didOpen: (el) => {
      el.addEventListener("mouseenter", Swal.stopTimer);
      el.addEventListener("mouseleave", Swal.resumeTimer);
    },
  });
  return Toast.fire(themed({ icon, title }));
}

/** Centered popup for important moments (e.g. verification complete). */
export function popup(
  icon: SweetAlertIcon,
  title: string,
  text?: string,
  opts: { confirmText?: string } = {}
) {
  return Swal.fire(
    themed({
      icon,
      title,
      text,
      confirmButtonText: opts.confirmText ?? "OK",
    })
  );
}

/** Confirmation dialog with confirm/cancel. */
export function confirm(
  title: string,
  text: string,
  opts: { confirmText?: string; cancelText?: string; danger?: boolean } = {}
) {
  return Swal.fire(
    themed({
      title,
      text,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: opts.confirmText ?? "Conferma",
      cancelButtonText: opts.cancelText ?? "Annulla",
      confirmButtonColor: opts.danger ? "#EA5455" : "#1E6FCC",
      cancelButtonColor: border(),
    })
  ).then((r) => r.isConfirmed);
}
