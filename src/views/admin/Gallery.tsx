import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { isMonitorOnly } from "@/components/layout/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export default function Gallery() {
  const { profile, user, roles } = useAuthStore();
  const messId = profile?.mess_id;
  // Server rule (api-server.ts): a read-only mess_monitor may not write GalleryItems.
  const readOnly = isMonitorOnly(roles);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["gallery", messId],
    enabled: !!messId,
    queryFn: async () => {
      return apiGet<any[]>("gallery-items", { mess_id: messId!, order: "created_at.desc" });
    },
  });

  const upload = async () => {
    if (!file || !messId || !user) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", "chat-images");
      const { url } = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
      await apiPost("gallery-items", {
        mess_id: messId,
        uploaded_by: user.id,
        image_url: url,
        caption: caption || null,
      });
    } catch (e: any) {
      setUploading(false);
      return toast.error(e.message);
    }
    setUploading(false);
    toast.success("ছবি যোগ হয়েছে");
    setFile(null);
    setCaption("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["gallery", messId] });
  };

  const remove = async (id: string) => {
    try {
      await apiDelete("gallery-items", id);
    } catch (e: any) {
      return toast.error(e.message);
    }
    qc.invalidateQueries({ queryKey: ["gallery", messId] });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">গ্যালারি</h1>
          <p className="text-sm text-muted-foreground mt-1">মেসের ছবি ও মুহূর্তগুলো রাখুন</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          {!readOnly && (
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> ছবি যোগ করুন</Button>
          </DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader><DialogTitle>নতুন ছবি</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>ছবি</Label>
                <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="space-y-1.5">
                <Label>ক্যাপশন (optional)</Label>
                <Input value={caption} onChange={(e) => setCaption(e.target.value)} />
              </div>
              <Button onClick={upload} disabled={!file || uploading} className="w-full">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "আপলোড"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <ImageIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">এখনো কোনো ছবি নেই</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.map((g: any) => (
            <div key={g.id} className="relative group rounded-2xl overflow-hidden border bg-card">
              <img src={g.image_url} alt={g.caption ?? ""} className="w-full aspect-square object-cover" />
              {g.caption && <p className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs p-2 truncate">{g.caption}</p>}
              {!readOnly && (
              <Button size="icon" variant="destructive" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition" onClick={() => remove(g.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
