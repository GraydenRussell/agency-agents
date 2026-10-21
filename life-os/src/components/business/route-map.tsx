"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type P = { lat: number; lng: number; label: string };

/** Leaflet + OpenStreetMap tiles. Numbered stops, home base, straight connecting lines (not road paths). */
export function RouteMap({ base, stops }: { base: P; stops: P[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
      map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(map);
      const pin = (html: string, cls: string) => L.divIcon({ className: "", html: `<div class="${cls}">${html}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
      const homeCls = "flex size-7 items-center justify-center rounded-full border-2 border-white bg-zinc-800 text-xs font-bold text-white shadow";
      const stopCls = "flex size-7 items-center justify-center rounded-full border-2 border-white bg-[#007ACE] text-xs font-bold text-white shadow";
      L.marker([base.lat, base.lng], { icon: pin("⌂", homeCls), title: base.label }).bindTooltip(base.label).addTo(map);
      stops.forEach((s, i) => L.marker([s.lat, s.lng], { icon: pin(String(i + 1), stopCls), title: s.label }).bindTooltip(`${i + 1}. ${s.label}`).addTo(map!));
      const path: Array<[number, number]> = [[base.lat, base.lng], ...stops.map((s) => [s.lat, s.lng] as [number, number]), [base.lat, base.lng]];
      L.polyline(path, { color: "#66DDFA", weight: 3, opacity: 0.85, dashArray: "6 6" }).addTo(map);
      map.fitBounds(L.latLngBounds(path), { padding: [30, 30], maxZoom: 14 });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [base, stops]);
  return <div ref={el} role="img" aria-label={`Map of ${stops.length} stops starting and ending at ${base.label}`} className="h-[420px] w-full overflow-hidden rounded-xl border border-border bg-muted" data-testid="route-map" />;
}
