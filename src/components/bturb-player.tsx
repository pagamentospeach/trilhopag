"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import DOMPurify from "isomorphic-dompurify";

/**
 * Player Bturb — 100% CUSTOM, sem controles nativos do browser.
 *
 * Filosofia:
 *  - `controls` do <video> NUNCA é true (sem player do Chrome/Safari).
 *  - Toda UI (play/pause/seek/volume/fullscreen/CTA) é nossa, estilizada
 *    com a primaryColor que o seller escolhe.
 *  - O seller pode esconder TUDO via toggle `hideControls` (modo VSL puro
 *    sem possibilidade de pause/skip) ou mostrar a barra inferior limpa.
 *  - Suporta thumbnail no início, pause e fim (overlays clicáveis).
 *  - Fake progress bar (engana o cérebro do espectador) ou barra real.
 *
 * Usado em:
 *  - /v/[id] (público — vídeo pra tráfego, com analytics ativos)
 *  - /dashboard/bturb/[id] (preview ao vivo, sem analytics)
 *
 * previewMode={true} desliga: tracking, pixels FB/TT, navegação do CTA.
 */

export type BturbPlayerVideo = {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  thumbnailPauseUrl: string | null;
  thumbnailEndUrl: string | null;
  smartAutoplay: boolean;
  autoplayMuted: boolean;
  silentAutoplay: boolean;
  turboSpeed: boolean;
  showProgress: boolean;
  fakeProgressBar: boolean;
  fakeProgressTotalSeconds: number | null;
  loop: boolean;
  hideControls: boolean;
  blockRightClick: boolean;
  downloadProtection: boolean;
  primaryColor: string;
  ctaDelaySeconds: number | null;
  ctaText: string | null;
  ctaUrl: string | null;
  ctaPlacement: string;
  ctaCustomHtml: string | null;
  fbPixelId: string | null;
  tiktokPixelId: string | null;
  conversionKey: string | null;
};

type Props = {
  video: BturbPlayerVideo;
  /** Modo dev/preview: desabilita analytics, pixels e navegação. */
  previewMode?: boolean;
};

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function BturbPlayer({ video: v, previewMode = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visitorIdRef = useRef<string>("");
  const milestonesSentRef = useRef<Set<number>>(new Set());

  const [muted, setMuted] = useState(v.autoplayMuted);
  const [volume, setVolume] = useState(1);
  const [played, setPlayed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [ctaTriggered, setCtaTriggered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Visibilidade do CTA
  const ctaShouldShowFromStart =
    (v.ctaDelaySeconds ?? null) === null || v.ctaDelaySeconds === 0;
  const showCta = ctaShouldShowFromStart || ctaTriggered;
  const ctaVisible = showCta && (!!v.ctaText || !!v.ctaCustomHtml);
  const ctaBelow = v.ctaPlacement === "below" && ctaVisible;

  // Hint pra desmutar (apenas após primeiro play e se silentAutoplay ligado)
  const showUnmuteHint = v.silentAutoplay && muted && played;

  // Estados derivados pra UI
  const isPaused = played && !playing && !ended;
  const showOverlayThumb = ended
    ? v.thumbnailEndUrl
    : isPaused
      ? v.thumbnailPauseUrl
      : null;
  const showBigPlayButton = !played && !v.hideControls && !v.smartAutoplay;

  const track = useCallback(
    async (type: string, positionSeconds?: number) => {
      if (previewMode) return;
      try {
        const params = new URLSearchParams(window.location.search);
        await fetch("/api/bturb/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId: v.id,
            type,
            visitorId: visitorIdRef.current,
            positionSeconds,
            utmSource: params.get("utm_source"),
            utmCampaign: params.get("utm_campaign"),
            utmMedium: params.get("utm_medium"),
            utmContent: params.get("utm_content"),
          }),
          keepalive: true,
        });
      } catch {
        /* silent */
      }
    },
    [previewMode, v.id],
  );

  // VisitorId + view + pixels (só em produção)
  useEffect(() => {
    if (previewMode) return;
    let vid = localStorage.getItem("bturb_vid");
    if (!vid) {
      vid = "v" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("bturb_vid", vid);
    }
    visitorIdRef.current = vid;
    track("view");
    if (v.fbPixelId) loadFbPixel(v.fbPixelId);
    if (v.tiktokPixelId) loadTiktokPixel(v.tiktokPixelId);
  }, [previewMode, track, v.fbPixelId, v.tiktokPixelId]);

  // Bloquear clique direito SÓ no container do player
  useEffect(() => {
    if (previewMode || !v.blockRightClick) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, [previewMode, v.blockRightClick]);

  // Smart autoplay
  useEffect(() => {
    if (!v.smartAutoplay) return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = v.autoplayMuted;
    el.play().catch(() => {
      /* autoplay bloqueado — sem problema */
    });
  }, [v.smartAutoplay, v.autoplayMuted, v.videoUrl]);

  // Turbo speed (1.25x até primeiro click no container)
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (v.turboSpeed) {
      Object.assign(el, { playbackRate: 1.25 });
    } else {
      Object.assign(el, { playbackRate: 1 });
    }
  }, [v.turboSpeed]);

  // Sincroniza muted/volume do DOM com state
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    el.volume = volume;
  }, [muted, volume]);

  // Listener de fullscreen
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Tracking timestamp + buffered + CTA delay + milestones
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => {
      const t = el.currentTime;
      setCurrentTime(t);
      // Buffered (% da parte já baixada)
      try {
        if (el.buffered.length > 0) {
          const end = el.buffered.end(el.buffered.length - 1);
          const dur = el.duration || 1;
          setBuffered(Math.min(100, (end / dur) * 100));
        }
      } catch {
        /* noop */
      }
      // CTA delay
      if (v.ctaDelaySeconds && t >= v.ctaDelaySeconds && !ctaShouldShowFromStart) {
        setCtaTriggered((prev) => prev || true);
      }
      // Retention milestones
      if (duration > 0) {
        const pct = (t / duration) * 100;
        for (const m of [25, 50, 75]) {
          if (pct >= m && !milestonesSentRef.current.has(m)) {
            milestonesSentRef.current.add(m);
            track(`milestone_${m}`, Math.round(t));
          }
        }
      }
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("progress", onTime);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("progress", onTime);
    };
  }, [v.ctaDelaySeconds, ctaShouldShowFromStart, duration, track]);

  // Auto-hide controls após 3s sem mouse
  const showControlsTransient = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (playing && !v.hideControls) {
      controlsTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  }, [playing, v.hideControls]);

  useEffect(() => {
    // Inicia o timer assim que entra em play (sem chamar setState sync no effect)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (playing && !v.hideControls) {
      controlsTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [playing, v.hideControls]);

  // ===== Event handlers do <video> =====

  const handlePlay = useCallback(() => {
    setPlaying(true);
    setEnded(false);
    setPlayed((prev) => {
      if (!prev) track("play");
      return true;
    });
  }, [track]);

  const handlePause = useCallback(() => {
    setPlaying(false);
    track("pause", Math.round(videoRef.current?.currentTime ?? 0));
  }, [track]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    setEnded(true);
    track("complete", Math.round(duration));
  }, [duration, track]);

  const handleLoadedMeta = useCallback(() => {
    setDuration(videoRef.current?.duration ?? 0);
  }, []);

  // ===== Controles custom =====

  const togglePlayPause = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused || el.ended) {
      if (el.ended) el.currentTime = 0;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
    // Turbo: primeiro click desliga turbo
    if (v.turboSpeed && el.playbackRate !== 1) {
      Object.assign(el, { playbackRate: 1 });
    }
  }, [v.turboSpeed]);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const next = !el.muted;
    el.muted = next;
    setMuted(next);
  }, []);

  const handleVolumeChange = useCallback((newVol: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = newVol;
    setVolume(newVol);
    if (newVol === 0) {
      el.muted = true;
      setMuted(true);
    } else if (el.muted) {
      el.muted = false;
      setMuted(false);
    }
  }, []);

  const handleSeek = useCallback(
    (pctOrSeconds: number, isPct = true) => {
      const el = videoRef.current;
      if (!el || !duration) return;
      const target = isPct ? (pctOrSeconds / 100) * duration : pctOrSeconds;
      el.currentTime = Math.max(0, Math.min(target, duration));
    },
    [duration],
  );

  const toggleFullscreen = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    if (!document.fullscreenElement) {
      c.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleCtaClick = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.preventDefault();
      track("cta_click", Math.round(currentTime));
      if (previewMode) return;
      if (!v.ctaUrl) return;
      try {
        const url = new URL(v.ctaUrl);
        if (v.conversionKey) url.searchParams.set("bturb_key", v.conversionKey);
        if (visitorIdRef.current)
          url.searchParams.set("bturb_vid", visitorIdRef.current);
        const params = new URLSearchParams(window.location.search);
        for (const key of [
          "utm_source",
          "utm_campaign",
          "utm_medium",
          "utm_content",
          "utm_term",
        ]) {
          const val = params.get(key);
          if (val && !url.searchParams.has(key)) url.searchParams.set(key, val);
        }
        window.location.href = url.toString();
      } catch {
        window.location.href = v.ctaUrl;
      }
    },
    [currentTime, previewMode, v.ctaUrl, v.conversionKey, track],
  );

  // ===== Computed visuais =====

  const fakeTotal = v.fakeProgressTotalSeconds || duration || 1;
  const fakeProgress = v.fakeProgressBar
    ? Math.min(100, (currentTime / fakeTotal) * 100)
    : 0;
  const realProgress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const progressPct = v.fakeProgressBar ? fakeProgress : realProgress;

  // Botão CTA renderizado
  const ctaButton = useMemo(
    () =>
      v.ctaCustomHtml ? (
        <div
          onClick={handleCtaClick}
          // SANITIZADO: ctaCustomHtml é HTML livre do seller. DOMPurify
          // remove <script>, handlers on*, javascript:/data: — bloqueia XSS
          // armazenado no domínio do seller (com PII do cliente no DOM).
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(v.ctaCustomHtml),
          }}
        />
      ) : (
        <button
          type="button"
          onClick={handleCtaClick}
          style={{
            background: v.primaryColor,
            color: "#000",
            border: 0,
            padding: "12px 26px",
            borderRadius: 999,
            fontSize: 15,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: `0 10px 30px ${v.primaryColor}55`,
            letterSpacing: -0.3,
            maxWidth: "92%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {v.ctaText ?? "Continuar"}
        </button>
      ),
    [v.ctaCustomHtml, v.ctaText, v.primaryColor, handleCtaClick],
  );

  // ===== Render =====

  // Quando hideControls=true, esconde a barra de controles inteira
  // (mantém só fake/real progress bar slim no rodapé, sem interatividade).
  // Quando false, mostra a barra completa custom.
  const showControlsUI = !v.hideControls;
  const showOnlySlimBar = v.hideControls && (v.showProgress || v.fakeProgressBar);

  return (
    <div
      ref={containerRef}
      className="bturb-player-root"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "#000",
        userSelect: v.downloadProtection ? "none" : "auto",
        WebkitUserSelect: v.downloadProtection ? "none" : "auto",
        overflow: "hidden",
      }}
      onMouseMove={showControlsTransient}
      onMouseLeave={() => {
        if (playing && !v.hideControls) setControlsVisible(false);
      }}
      onContextMenu={(e) => {
        if (v.blockRightClick && !previewMode) e.preventDefault();
      }}
    >
      {/* Área do vídeo (deixa espaço pra CTA below quando ativo) */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: ctaBelow ? "calc(100% - 72px)" : "100%",
          background: "#000",
        }}
      >
        <video
          ref={videoRef}
          src={v.videoUrl}
          poster={v.thumbnailUrl ?? undefined}
          playsInline
          loop={v.loop}
          muted={muted}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onLoadedMetadata={handleLoadedMeta}
          onClick={togglePlayPause}
          controlsList="nodownload noremoteplayback noplaybackrate"
          disablePictureInPicture={v.downloadProtection}
          /* IMPORTANTE: NUNCA usa controles nativos do browser */
          controls={false}
          onContextMenu={(e) =>
            v.blockRightClick && !previewMode && e.preventDefault()
          }
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "#000",
            cursor: "pointer",
            pointerEvents: showOverlayThumb ? "none" : "auto",
          }}
        >
          <track kind="captions" />
        </video>

        {/* Overlay clicável (pause/end) — só aparece com thumb custom */}
        {showOverlayThumb && (
          <button
            type="button"
            onClick={togglePlayPause}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              padding: 0,
              border: 0,
              background: "transparent",
              cursor: "pointer",
            }}
            aria-label={ended ? "Assistir novamente" : "Retomar"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={showOverlayThumb}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <PlayIcon size={28} color={v.primaryColor} />
            </div>
          </button>
        )}

        {/* Big play button quando não autoplay e nunca tocou */}
        {showBigPlayButton && !showOverlayThumb && (
          <button
            type="button"
            onClick={togglePlayPause}
            aria-label="Reproduzir vídeo"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 92,
              height: 92,
              borderRadius: "50%",
              border: `3px solid ${v.primaryColor}`,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              backdropFilter: "blur(8px)",
              boxShadow: `0 0 40px ${v.primaryColor}55`,
              padding: 0,
              zIndex: 6,
            }}
          >
            <PlayIcon size={32} color={v.primaryColor} />
          </button>
        )}

        {/* Click-to-unmute hint */}
        {showUnmuteHint && (
          <button
            type="button"
            onClick={toggleMute}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "rgba(0,0,0,.75)",
              color: "#fff",
              border: 0,
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 600,
              boxShadow: "0 4px 16px rgba(0,0,0,.4)",
              zIndex: 7,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <VolumeOffIcon size={14} color="#fff" /> Clique pra ativar o som
          </button>
        )}

        {/* Badge de Turbo (preview) */}
        {previewMode && v.turboSpeed && (
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(255, 80, 0, 0.85)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.5,
              pointerEvents: "none",
              zIndex: 7,
            }}
          >
            ⚡ TURBO 1.25x
          </div>
        )}

        {/* CTA overlay no meio do vídeo */}
        {v.ctaPlacement === "overlay" && ctaVisible && (
          <div
            style={{
              position: "absolute",
              bottom: showControlsUI ? 80 : 24,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              padding: 14,
              pointerEvents: "none",
              zIndex: 6,
            }}
          >
            <div style={{ pointerEvents: "auto" }}>{ctaButton}</div>
          </div>
        )}

        {/* SLIM progress bar quando hideControls=true */}
        {showOnlySlimBar && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 4,
              background: "rgba(255,255,255,.15)",
              pointerEvents: "none",
              zIndex: 4,
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                background: v.primaryColor,
                transition: "width 250ms linear",
                boxShadow: `0 0 12px ${v.primaryColor}`,
              }}
            />
          </div>
        )}

        {/* BARRA DE CONTROLES CUSTOM */}
        {showControlsUI && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "32px 14px 10px 14px",
              background:
                "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 100%)",
              transform: controlsVisible
                ? "translateY(0)"
                : "translateY(100%)",
              opacity: controlsVisible ? 1 : 0,
              transition: "transform 220ms ease, opacity 220ms ease",
              zIndex: 5,
              pointerEvents: controlsVisible ? "auto" : "none",
            }}
          >
            {/* Linha 1: scrubber */}
            <Scrubber
              progressPct={progressPct}
              bufferedPct={buffered}
              primaryColor={v.primaryColor}
              fake={v.fakeProgressBar}
              onSeek={(pct) => {
                // Fake progress não permite seek (rola só com o tempo real do vídeo)
                if (v.fakeProgressBar) return;
                handleSeek(pct, true);
              }}
            />

            {/* Linha 2: botões */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 8,
                color: "#fff",
              }}
            >
              <CtrlButton
                onClick={togglePlayPause}
                ariaLabel={playing ? "Pausar" : "Reproduzir"}
              >
                {playing ? (
                  <PauseIcon size={18} color="#fff" />
                ) : (
                  <PlayIcon size={18} color="#fff" />
                )}
              </CtrlButton>

              <CtrlButton
                onClick={toggleMute}
                ariaLabel={muted ? "Ativar som" : "Silenciar"}
              >
                {muted || volume === 0 ? (
                  <VolumeOffIcon size={18} color="#fff" />
                ) : (
                  <VolumeOnIcon size={18} color="#fff" />
                )}
              </CtrlButton>

              {!muted && (
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) =>
                    handleVolumeChange(parseFloat(e.target.value))
                  }
                  style={{
                    width: 72,
                    accentColor: v.primaryColor,
                  }}
                  aria-label="Volume"
                />
              )}

              {!v.fakeProgressBar && (
                <span
                  style={{
                    fontSize: 12,
                    fontVariantNumeric: "tabular-nums",
                    color: "#d4d4d8",
                    marginLeft: 4,
                  }}
                >
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              )}

              <div style={{ flex: 1 }} />

              <CtrlButton
                onClick={toggleFullscreen}
                ariaLabel={isFullscreen ? "Sair de tela cheia" : "Tela cheia"}
              >
                {isFullscreen ? (
                  <FullscreenExitIcon size={18} color="#fff" />
                ) : (
                  <FullscreenIcon size={18} color="#fff" />
                )}
              </CtrlButton>
            </div>
          </div>
        )}
      </div>

      {/* CTA below — barra fixa abaixo do vídeo */}
      {ctaBelow && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            background: "#0a0a0a",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {ctaButton}
        </div>
      )}
    </div>
  );
}

/* ============ Componentes auxiliares ============ */

function CtrlButton({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        background: "transparent",
        border: 0,
        padding: 6,
        borderRadius: 6,
        cursor: "pointer",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function Scrubber({
  progressPct,
  bufferedPct,
  primaryColor,
  fake,
  onSeek,
}: {
  progressPct: number;
  bufferedPct: number;
  primaryColor: string;
  fake: boolean;
  onSeek: (pct: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (fake) return;
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(
      0,
      Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
    );
    onSeek(pct);
  };

  return (
    <div
      ref={barRef}
      onClick={handleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        position: "relative",
        height: hovering ? 8 : 5,
        borderRadius: 999,
        background: "rgba(255,255,255,.18)",
        cursor: fake ? "default" : "pointer",
        transition: "height 120ms",
        overflow: "hidden",
      }}
    >
      {/* Buffered */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${bufferedPct}%`,
          background: "rgba(255,255,255,0.30)",
          transition: "width 200ms",
        }}
      />
      {/* Progress */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${progressPct}%`,
          background: primaryColor,
          transition: "width 200ms linear",
          boxShadow: `0 0 10px ${primaryColor}`,
        }}
      />
      {/* Thumb (handle visual) — só não-fake */}
      {!fake && (
        <div
          style={{
            position: "absolute",
            left: `${progressPct}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: hovering ? 14 : 0,
            height: hovering ? 14 : 0,
            borderRadius: "50%",
            background: primaryColor,
            boxShadow: "0 0 6px rgba(0,0,0,0.4)",
            transition: "width 120ms, height 120ms",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

/* ============ Icons (SVG inline, sem dependência de fonte) ============ */

function PlayIcon({ size = 18, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ size = 18, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}

function VolumeOnIcon({ size = 18, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05a4.5 4.5 0 0 0 2.5-4.02zM14 3.23v2.06A6.99 6.99 0 0 1 19 12a6.99 6.99 0 0 1-5 6.71v2.06A8.99 8.99 0 0 0 21 12a8.99 8.99 0 0 0-7-8.77z" />
    </svg>
  );
}

function VolumeOffIcon({ size = 18, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.96 8.96 0 0 0 21 12a8.99 8.99 0 0 0-7-8.77v2.06A6.99 6.99 0 0 1 19 12zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.17v2.06a8.94 8.94 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
    </svg>
  );
}

function FullscreenIcon({ size = 18, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}

function FullscreenExitIcon({
  size = 18,
  color = "#fff",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    </svg>
  );
}

/* ============ Pixels ============ */

function loadFbPixel(id: string) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { fbq?: (...a: unknown[]) => void };
  if (w.fbq) return;
  const script = document.createElement("script");
  script.innerHTML = `
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init','${id}');fbq('track','PageView');
  `;
  document.head.appendChild(script);
}

function loadTiktokPixel(id: string) {
  if (typeof window === "undefined") return;
  const script = document.createElement("script");
  script.innerHTML = `
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load('${id}');ttq.page();
    }(window, document, 'ttq');
  `;
  document.head.appendChild(script);
}
