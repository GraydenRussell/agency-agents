export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,rgba(0,122,206,0.25),transparent_60%)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-primary font-display text-2xl text-white">L</div>
          <h1 className="font-heading text-4xl tracking-wider">Life OS</h1>
        </div>
        {children}
      </div>
    </main>
  );
}
