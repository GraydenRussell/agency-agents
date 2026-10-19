/** "12 min", "3 h 5 min", "2 days" (client-safe). */
export const formatWait = (mins: number) => (mins < 60 ? `${mins} min` : mins < 48 * 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ""}` : `${Math.floor(mins / 1440)} days`);
