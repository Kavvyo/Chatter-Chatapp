import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, FileArchive, ImagePlus, Plus, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { useStickerStore } from "../store/useStickerStore";

function StickerPicker({ onSelectSticker }) {
  const {
    packs,
    recentStickers,
    isImporting,
    hydrateStickers,
    importFiles,
    deletePack,
  } = useStickerStore();

  const [selectedTab, setSelectedTab] = useState("recent");
  const [showImportMenu, setShowImportMenu] = useState(false);

  const archiveInputRef = useRef(null);
  const imagesInputRef = useRef(null);

  useEffect(() => {
    hydrateStickers();
  }, [hydrateStickers]);

  useEffect(() => {
    if (selectedTab === "recent" && recentStickers.length === 0 && packs.length > 0) {
      setSelectedTab(packs[0].id);
    } else if (selectedTab !== "recent" && !packs.some((p) => p.id === selectedTab)) {
      setSelectedTab(recentStickers.length > 0 ? "recent" : packs[0]?.id || "recent");
    }
  }, [packs, recentStickers.length, selectedTab]);

  const activePack = useMemo(
    () => packs.find((p) => p.id === selectedTab) || null,
    [packs, selectedTab]
  );

  const visibleStickers = useMemo(() => {
    if (selectedTab === "recent") return recentStickers;
    return activePack?.stickers || [];
  }, [selectedTab, recentStickers, activePack]);

  const handleFilesSelected = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const res = await importFiles(fileList);
    if (res.ok) {
      toast.success(res.message);
      if (res.pack?.id) setSelectedTab(res.pack.id);
      setShowImportMenu(false);
    } else {
      toast.error(res.message);
    }
  };

  const showingImportView =
    showImportMenu || (packs.length === 0 && recentStickers.length === 0);

  return (
    <div
      className="mb-2.5 rounded-[22px] bg-base-200 border border-base-300/80 shadow-sm overflow-hidden animate-in fade-in duration-150"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer?.files?.length) {
          handleFilesSelected(e.dataTransfer.files);
        }
      }}
    >
      {/* Hidden File Inputs */}
      <input
        ref={archiveInputRef}
        type="file"
        accept=".wastickers,.zip"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={imagesInputRef}
        type="file"
        accept="image/webp,image/png,image/gif,.webp,.png,.gif"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Top Tray Switcher */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-base-300/60">
        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {recentStickers.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectedTab("recent");
                setShowImportMenu(false);
              }}
              className={`size-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                selectedTab === "recent" && !showingImportView
                  ? "bg-primary/15 text-primary"
                  : "hover:bg-base-300/70 text-base-content/70"
              }`}
              title="Recent stickers"
              aria-label="Recent stickers"
            >
              <Clock className="size-4" />
            </button>
          )}

          {packs.map((pack) => {
            const active = selectedTab === pack.id && !showingImportView;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => {
                  setSelectedTab(pack.id);
                  setShowImportMenu(false);
                }}
                className={`size-9 rounded-xl p-1 flex items-center justify-center shrink-0 transition-colors ${
                  active ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-base-300/70"
                }`}
                title={pack.name}
              >
                {pack.trayUri ? (
                  <img
                    src={pack.trayUri}
                    alt={pack.name}
                    className="w-7 h-7 object-contain pointer-events-none"
                  />
                ) : (
                  <span className="text-xs font-semibold">
                    {pack.name?.slice(0, 2) || "SP"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowImportMenu((prev) => !prev)}
          className={`size-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
            showingImportView
              ? "bg-primary text-primary-content"
              : "bg-base-300/70 text-base-content/80 hover:bg-base-300"
          }`}
          title={showingImportView ? "Close import panel" : "Install stickers"}
          aria-label="Install stickers"
        >
          {showingImportView ? <X className="size-4" /> : <Plus className="size-4" />}
        </button>
      </div>

      {/* Body Area */}
      {isImporting ? (
        <div className="h-52 flex flex-col items-center justify-center gap-2 text-sm text-base-content/70">
          <span className="loading loading-spinner loading-md text-primary" />
          <span>Installing stickers locally...</span>
        </div>
      ) : showingImportView ? (
        <div className="p-3.5 max-h-60 overflow-y-auto space-y-2.5">
          <div>
            <p className="text-sm font-semibold">Install WhatsApp Stickers Locally</p>
            <p className="text-xs text-base-content/60">
              Stored privately in your browser & sent P2P with zero server upload. Or drag files here.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => archiveInputRef.current?.click()}
              className="flex items-center gap-3 p-3 rounded-2xl bg-base-100 border border-base-300/80 hover:border-primary/50 text-left transition-colors"
            >
              <div className="size-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <FileArchive className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Import .wastickers / .zip</p>
                <p className="text-[11px] text-base-content/60 truncate">
                  Unpack WhatsApp pack archives
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => imagesInputRef.current?.click()}
              className="flex items-center gap-3 p-3 rounded-2xl bg-base-100 border border-base-300/80 hover:border-primary/50 text-left transition-colors"
            >
              <div className="size-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <ImagePlus className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Pick .webp / PNG Files</p>
                <p className="text-[11px] text-base-content/60 truncate">
                  Static or animated WebP stickers
                </p>
              </div>
            </button>
          </div>
        </div>
      ) : (
        <div className="h-56 flex flex-col">
          {activePack && (
            <div className="flex items-center justify-between px-3.5 pt-2 pb-1 text-xs text-base-content/60">
              <span className="truncate font-medium">
                {activePack.name} • {activePack.stickers.length} stickers
              </span>
              <button
                type="button"
                onClick={() => deletePack(activePack.id)}
                className="inline-flex items-center gap-1 text-error/80 hover:text-error transition-colors shrink-0 ml-2"
                title={`Remove "${activePack.name}"`}
              >
                <Trash2 className="size-3.5" />
                <span>Remove</span>
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-3 py-2 grid grid-cols-4 sm:grid-cols-6 gap-2 content-start">
            {visibleStickers.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSticker(item)}
                className="aspect-square rounded-2xl p-1.5 flex items-center justify-center hover:bg-base-300/60 active:scale-90 transition-transform"
              >
                {item.uri && (
                  <img
                    src={item.uri}
                    alt="Sticker"
                    loading="lazy"
                    className="w-full h-full object-contain pointer-events-none select-none"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default StickerPicker;
