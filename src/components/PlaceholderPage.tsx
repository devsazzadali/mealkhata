import { Construction } from "lucide-react";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="rounded-2xl border bg-card p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center mb-3">
          <Construction className="w-7 h-7 text-primary" />
        </div>
        <h3 className="font-semibold">Coming in the next phase</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
          The database is ready. Full editing flows for this section are being built next.
        </p>
      </div>
    </div>
  );
}
