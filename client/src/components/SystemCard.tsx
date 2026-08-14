import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { LifeBuoy, Loader2, MessageSquare, Pencil, Sparkles, Trash2, Users, Wrench } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

type BridgeChannel = { id: string; name: string; type: number };
type BridgeRole = { id: string; name: string; color: string };
type BridgeDetail = {
  botPresent: boolean;
  categories: BridgeChannel[];
  textChannels: BridgeChannel[];
  voiceChannels: BridgeChannel[];
  roles?: BridgeRole[];
};
type DestekStatus = {
  active: boolean;
  kategoriId?: string | null;
  kanalId?: string | null;
  rolId?: string | null;
  talepSayaci?: number;
};
type KulupStatus = {
  active: boolean;
  kategoriId?: string | null;
  metinKanalId?: string | null;
  sesliKanalId?: string | null;
};
type Props =
  | { kind: "destek"; guildId: string; status: DestekStatus; detail: BridgeDetail; onChanged: () => void }
  | { kind: "kulup"; guildId: string; status: KulupStatus; detail: BridgeDetail; onChanged: () => void };

const META = {
  destek: {
    title: "Destek Sistemi",
    icon: LifeBuoy,
    desc: "Üyelerin talep (ticket) açabileceği destek kanalını ve yetkili rolünü oluşturur.",
  },
  kulup: {
    title: "Kulüp Sistemi",
    icon: Users,
    desc: "Üyelere özel sesli oda açan kulüp altyapısını oluşturur.",
  },
} as const;

export default function SystemCard(props: Props) {
  const { kind, guildId, detail, onChanged } = props;
  const meta = META[kind];
  const Icon = meta.icon;
  const active = props.status.active;
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const utils = trpc.useUtils();

  // Manuel kurulum alanları
  const [kategoriId, setKategoriId] = useState("");
  const [kanalId, setKanalId] = useState("");
  const [rolId, setRolId] = useState("");
  const [metinKanalId, setMetinKanalId] = useState("");
  const [sesliKanalId, setSesliKanalId] = useState("");

  // Aktif sistem düzenleme
  const [editingRol, setEditingRol] = useState(false);
  const [editingMetinKanal, setEditingMetinKanal] = useState(false);
  const [yeniRolId, setYeniRolId] = useState("");
  const [yeniMetinKanalId, setYeniMetinKanalId] = useState("");

  const destekSetup = trpc.discord.destekSetup.useMutation();
  const destekDelete = trpc.discord.destekDelete.useMutation();
  const kulupSetup = trpc.discord.kulupSetup.useMutation();
  const kulupDelete = trpc.discord.kulupDelete.useMutation();
  const destekRolGuncelle = trpc.discord.destekRolGuncelle.useMutation();
  const kulupMetinKanalGuncelle = trpc.discord.kulupMetinKanalGuncelle.useMutation();

  const isPending =
    destekSetup.isPending || destekDelete.isPending || kulupSetup.isPending || kulupDelete.isPending ||
    destekRolGuncelle.isPending || kulupMetinKanalGuncelle.isPending;

  const refresh = () => {
    utils.discord.guildDetail.invalidate({ guildId });
    utils.discord.ownerGuildDetail.invalidate({ guildId });
    onChanged();
  };

  const handleSetup = async () => {
    try {
      if (kind === "destek") {
        if (mode === "manual" && (!kategoriId || !kanalId)) {
          toast.error("Manuel kurulum için kategori ID ve kanal ID gereklidir.");
          return;
        }
        await destekSetup.mutateAsync(
          mode === "manual"
            ? { guildId, mode, kategoriId, kanalId }
            : { guildId, mode }
        );
      } else {
        if (mode === "manual" && (!kategoriId || !metinKanalId || !sesliKanalId)) {
          toast.error("Manuel kurulum için kategori ID, metin kanalı ID ve sesli kanal ID gereklidir.");
          return;
        }
        await kulupSetup.mutateAsync(
          mode === "manual"
            ? { guildId, mode, kategoriId, metinKanalId, sesliKanalId }
            : { guildId, mode }
        );
      }
      toast.success(`${meta.title} ${mode === "auto" ? "otomatik" : "manuel"} olarak kuruldu.`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "İşlem başarısız oldu.");
    }
  };

  const handleDelete = async () => {
    try {
      if (kind === "destek") await destekDelete.mutateAsync({ guildId });
      else await kulupDelete.mutateAsync({ guildId });
      toast.success(`${meta.title} devre dışı bırakıldı.`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "İşlem başarısız oldu.");
    }
  };

  const handleRolGuncelle = async () => {
    if (!yeniRolId) return;
    try {
      await destekRolGuncelle.mutateAsync({ guildId, rolId: yeniRolId });
      toast.success("Destek rolü güncellendi.");
      setEditingRol(false);
      setYeniRolId("");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Rol güncellenemedi.");
    }
  };

  const handleMetinKanalGuncelle = async () => {
    if (!yeniMetinKanalId) return;
    try {
      await kulupMetinKanalGuncelle.mutateAsync({ guildId, metinKanalId: yeniMetinKanalId });
      toast.success("Metin kanalı güncellendi. Yeni kanala bilgi mesajı gönderildi.");
      setEditingMetinKanal(false);
      setYeniMetinKanalId("");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Metin kanalı güncellenemedi.");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card/70 overflow-hidden">
      {/* Başlık */}
      <div className="flex items-start gap-3 p-5">
        <div className="grid place-items-center h-11 w-11 rounded-lg bg-primary/15 text-primary shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">{meta.title}</h3>
            {active ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15">
                Aktif
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-muted-foreground">Pasif</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{meta.desc}</p>
        </div>
      </div>

      {/* İçerik */}
      <div className="border-t border-border/70 p-5">
        {active ? (
          <ActiveSummary
            kind={kind}
            guildId={guildId}
            status={props.status}
            detail={detail}
            onDelete={handleDelete}
            isPending={isPending}
            editingRol={editingRol}
            setEditingRol={setEditingRol}
            yeniRolId={yeniRolId}
            setYeniRolId={setYeniRolId}
            onRolGuncelle={handleRolGuncelle}
            editingMetinKanal={editingMetinKanal}
            setEditingMetinKanal={setEditingMetinKanal}
            yeniMetinKanalId={yeniMetinKanalId}
            setYeniMetinKanalId={setYeniMetinKanalId}
            onMetinKanalGuncelle={handleMetinKanalGuncelle}
          />
        ) : (
          <div>
            <Tabs value={mode} onValueChange={v => setMode(v as "auto" | "manual")}>
              <TabsList className="bg-background/60">
                <TabsTrigger value="auto" className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Otomatik Kurulum
                </TabsTrigger>
                <TabsTrigger value="manual" className="gap-1.5">
                  <Wrench className="h-3.5 w-3.5" />
                  Manuel Kurulum
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {mode === "auto" ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Gerekli kategori ve kanallar bot tarafından otomatik olarak oluşturulur. Hiçbir ID girmenize gerek yoktur.
                </p>
                {/* Otomatik kurulumda da rol seçimi (destek için) */}
                {kind === "destek" && (detail.roles?.length ?? 0) > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Destek Takımı Rolü (opsiyonel)</Label>
                    <p className="text-xs text-muted-foreground/70 mb-1">Boş bırakırsanız "Destek Takımı" adında yeni bir rol oluşturulur.</p>
                    <RoleField
                      label=""
                      value={rolId}
                      onChange={setRolId}
                      roles={detail.roles ?? []}
                      placeholder="Rol seçin (opsiyonel)"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <Field
                  label="Kategori ID"
                  value={kategoriId}
                  onChange={setKategoriId}
                  channels={detail.categories}
                  placeholder="Kategori seçin veya ID girin"
                />
                {kind === "destek" ? (
                  <>
                    <Field
                      label="Destek Kanalı ID (metin)"
                      value={kanalId}
                      onChange={setKanalId}
                      channels={detail.textChannels}
                      placeholder="Metin kanalı seçin veya ID girin"
                    />
                    {/* Destek rol seçimi */}
                    <RoleField
                      label="Destek Takımı Rolü (opsiyonel)"
                      value={rolId}
                      onChange={setRolId}
                      roles={detail.roles ?? []}
                      placeholder="Rol seçin veya boş bırakın"
                    />
                  </>
                ) : (
                  <>
                    <Field
                      label="Metin Kanalı ID"
                      value={metinKanalId}
                      onChange={setMetinKanalId}
                      channels={detail.textChannels}
                      placeholder="Metin kanalı seçin veya ID girin"
                    />
                    <Field
                      label="Sesli Kanal ID"
                      value={sesliKanalId}
                      onChange={setSesliKanalId}
                      channels={detail.voiceChannels}
                      placeholder="Sesli kanal seçin veya ID girin"
                    />
                  </>
                )}
              </div>
            )}
            <div className="flex justify-end mt-5">
              <Button
                onClick={handleSetup}
                disabled={isPending || !detail.botPresent}
                className="bg-primary hover:bg-primary/90 active:scale-[0.98] transition-transform"
              >
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Sistemi Kur
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveSummary({
  kind, guildId, status, detail, onDelete, isPending,
  editingRol, setEditingRol, yeniRolId, setYeniRolId, onRolGuncelle,
  editingMetinKanal, setEditingMetinKanal, yeniMetinKanalId, setYeniMetinKanalId, onMetinKanalGuncelle,
}: {
  kind: "destek" | "kulup";
  guildId: string;
  status: DestekStatus | KulupStatus;
  detail: BridgeDetail;
  onDelete: () => void;
  isPending: boolean;
  editingRol: boolean;
  setEditingRol: (v: boolean) => void;
  yeniRolId: string;
  setYeniRolId: (v: string) => void;
  onRolGuncelle: () => void;
  editingMetinKanal: boolean;
  setEditingMetinKanal: (v: boolean) => void;
  yeniMetinKanalId: string;
  setYeniMetinKanalId: (v: string) => void;
  onMetinKanalGuncelle: () => void;
}) {
  const nameOf = (id?: string | null) => {
    if (!id) return "—";
    const all = [...detail.categories, ...detail.textChannels, ...detail.voiceChannels];
    const found = all.find(c => c.id === id);
    return found ? found.name : id;
  };
  const roleNameOf = (id?: string | null) => {
    if (!id) return "—";
    const found = (detail.roles ?? []).find(r => r.id === id);
    return found ? found.name : id;
  };

  return (
    <div>
      <dl className="grid gap-2 text-sm">
        {kind === "destek" ? (
          <>
            <Row label="Kategori" value={nameOf((status as DestekStatus).kategoriId)} />
            <Row label="Destek Kanalı" value={nameOf((status as DestekStatus).kanalId)} />
            {/* Destek Rolü - düzenlenebilir */}
            <div className="flex items-center justify-between gap-3 rounded-lg bg-background/50 px-3 py-2">
              <dt className="text-muted-foreground text-sm">Destek Rolü</dt>
              <div className="flex items-center gap-2">
                <dd className="font-medium truncate text-sm">{roleNameOf((status as DestekStatus).rolId)}</dd>
                <button
                  type="button"
                  onClick={() => setEditingRol(!editingRol)}
                  className="text-primary hover:text-primary/80 transition-colors"
                  title="Rolü değiştir"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {editingRol && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Yeni destek rolünü seçin:</p>
                <RoleField
                  label=""
                  value={yeniRolId}
                  onChange={setYeniRolId}
                  roles={detail.roles ?? []}
                  placeholder="Rol seçin"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setEditingRol(false)}>İptal</Button>
                  <Button size="sm" onClick={onRolGuncelle} disabled={!yeniRolId || isPending}>
                    {isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                    Kaydet
                  </Button>
                </div>
              </div>
            )}
            {(status as DestekStatus).talepSayaci !== undefined && (
              <Row label="Toplam Talep" value={String((status as DestekStatus).talepSayaci)} />
            )}
          </>
        ) : (
          <>
            <Row label="Kategori" value={nameOf((status as KulupStatus).kategoriId)} />
            {/* Metin Kanalı - düzenlenebilir */}
            <div className="flex items-center justify-between gap-3 rounded-lg bg-background/50 px-3 py-2">
              <dt className="text-muted-foreground text-sm">Metin Kanalı</dt>
              <div className="flex items-center gap-2">
                <dd className="font-medium truncate text-sm">{nameOf((status as KulupStatus).metinKanalId)}</dd>
                <button
                  type="button"
                  onClick={() => setEditingMetinKanal(!editingMetinKanal)}
                  className="text-primary hover:text-primary/80 transition-colors"
                  title="Metin kanalını değiştir"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {editingMetinKanal && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Yeni metin kanalını seçin (seçtiğinizde kanala bilgi mesajı gönderilir):</p>
                <Field
                  label=""
                  value={yeniMetinKanalId}
                  onChange={setYeniMetinKanalId}
                  channels={detail.textChannels}
                  placeholder="Metin kanalı seçin"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setEditingMetinKanal(false)}>İptal</Button>
                  <Button size="sm" onClick={onMetinKanalGuncelle} disabled={!yeniMetinKanalId || isPending}>
                    {isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                    Kaydet
                  </Button>
                </div>
              </div>
            )}
            <Row label="Sesli Kanal" value={nameOf((status as KulupStatus).sesliKanalId)} />
          </>
        )}
      </dl>
      <div className="flex justify-end items-center gap-2 mt-5">
        {kind === "destek" && (
          <Link href={`/servers/${guildId}/loglar`}>
            <Button variant="outline" className="bg-card/60 active:scale-[0.98] transition-transform">
              <MessageSquare className="h-4 w-4 mr-2" />
              Talep Logları
            </Button>
          </Link>
        )}
        <Button variant="destructive" onClick={onDelete} disabled={isPending} className="active:scale-[0.98] transition-transform">
          {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
          Sistemi Kapat
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-background/50 px-3 py-2">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="font-medium truncate text-sm">{value}</dd>
    </div>
  );
}

function Field({
  label, value, onChange, channels, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  channels: BridgeChannel[];
  placeholder: string;
}) {
  const valueInList = channels.some(c => c.id === value);
  const [idMode, setIdMode] = useState(false);
  const useId = idMode || channels.length === 0;
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          {channels.length > 0 && (
            <button type="button" onClick={() => setIdMode(m => !m)} className="text-[11px] text-primary hover:underline">
              {useId ? "Listeden seç" : "ID gir"}
            </button>
          )}
        </div>
      )}
      {!useId ? (
        <Select value={valueInList ? value : undefined} onValueChange={onChange}>
          <SelectTrigger className="mt-1 bg-background/60">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {channels.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={value}
          onChange={e => onChange(e.target.value.trim())}
          placeholder="Örn: 1520055221865156769"
          inputMode="numeric"
          className="mt-1 bg-background/60 font-mono text-sm"
        />
      )}
    </div>
  );
}

function RoleField({
  label, value, onChange, roles, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  roles: BridgeRole[];
  placeholder: string;
}) {
  const valueInList = roles.some(r => r.id === value);
  const [idMode, setIdMode] = useState(false);
  const useId = idMode || roles.length === 0;
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          {roles.length > 0 && (
            <button type="button" onClick={() => setIdMode(m => !m)} className="text-[11px] text-primary hover:underline">
              {useId ? "Listeden seç" : "ID gir"}
            </button>
          )}
        </div>
      )}
      {!useId ? (
        <Select value={valueInList ? value : undefined} onValueChange={onChange}>
          <SelectTrigger className="mt-1 bg-background/60">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {roles.map(r => (
              <SelectItem key={r.id} value={r.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: r.color !== "#000000" ? r.color : "#6b7280" }}
                  />
                  {r.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={value}
          onChange={e => onChange(e.target.value.trim())}
          placeholder="Rol ID girin"
          inputMode="numeric"
          className="mt-1 bg-background/60 font-mono text-sm"
        />
      )}
    </div>
  );
}
