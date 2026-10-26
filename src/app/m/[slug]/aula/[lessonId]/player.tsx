"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

type Lesson = {
  id: string;
  type: string;
  contentUrl: string | null;
  contentHtml: string | null;
};

export function LessonPlayer({
  lesson,
  courseId,
  memberId,
  primaryColor,
}: {
  lesson: Lesson;
  courseId: string;
  memberId: string | null;
  primaryColor: string;
}) {
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!memberId) return;
    // Marca como assistida ao montar (visualização)
    fetch("/api/member-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId,
        courseId,
        lessonId: lesson.id,
        watchedSeconds: 0,
        completed: false,
      }),
    }).catch(() => {});
  }, [memberId, courseId, lesson.id]);

  function markComplete() {
    if (!memberId) return;
    fetch("/api/member-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId,
        courseId,
        lessonId: lesson.id,
        completed: true,
      }),
    });
    setCompleted(true);
  }

  let body: React.ReactNode;
  if (lesson.type === "video" && lesson.contentUrl) {
    // YouTube/Vimeo embed detection
    const isYoutube = /youtube\.com|youtu\.be/.test(lesson.contentUrl);
    const isVimeo = /vimeo\.com/.test(lesson.contentUrl);
    if (isYoutube) {
      const id = extractYouTubeId(lesson.contentUrl);
      body = (
        <iframe
          src={`https://www.youtube.com/embed/${id}?rel=0`}
          style={{ width: "100%", aspectRatio: "16/9", border: 0, borderRadius: 12 }}
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
        />
      );
    } else if (isVimeo) {
      const id = lesson.contentUrl.split("/").pop()?.split("?")[0] ?? "";
      body = (
        <iframe
          src={`https://player.vimeo.com/video/${id}`}
          style={{ width: "100%", aspectRatio: "16/9", border: 0, borderRadius: 12 }}
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      );
    } else {
      body = (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={lesson.contentUrl}
          controls
          style={{ width: "100%", aspectRatio: "16/9", borderRadius: 12, background: "#000" }}
        />
      );
    }
  } else if (lesson.type === "audio" && lesson.contentUrl) {
    body = (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <audio src={lesson.contentUrl} controls style={{ width: "100%" }} />
    );
  } else if (lesson.type === "pdf" && lesson.contentUrl) {
    body = (
      <iframe
        src={lesson.contentUrl}
        style={{ width: "100%", height: "70vh", border: 0, borderRadius: 12 }}
      />
    );
  } else if (lesson.type === "text" && lesson.contentHtml) {
    body = (
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: 12,
          padding: 24,
          fontSize: 15,
          lineHeight: 1.7,
        }}
        dangerouslySetInnerHTML={{ __html: lesson.contentHtml }}
      />
    );
  } else if (lesson.type === "embed" && lesson.contentUrl) {
    body = (
      <iframe
        src={lesson.contentUrl}
        style={{ width: "100%", aspectRatio: "16/9", border: 0, borderRadius: 12 }}
        allow="autoplay; fullscreen"
        allowFullScreen
      />
    );
  } else {
    body = (
      <div
        style={{
          padding: 60,
          textAlign: "center",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 12,
          opacity: 0.6,
        }}
      >
        Conteúdo dessa aula ainda não foi adicionado.
      </div>
    );
  }

  return (
    <div>
      {body}
      {memberId && (
        <button
          type="button"
          onClick={markComplete}
          disabled={completed}
          style={{
            marginTop: 16,
            background: completed ? "rgba(132,204,22,0.2)" : primaryColor,
            color: completed ? "#22d3ee" : "#000",
            border: completed ? "1px solid rgba(132,204,22,0.4)" : 0,
            borderRadius: 999,
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 600,
            cursor: completed ? "default" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <CheckCircle2 style={{ width: 14, height: 14 }} />
          {completed ? "Aula concluída" : "Marcar como concluída"}
        </button>
      )}
    </div>
  );
}

function extractYouTubeId(url: string): string {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}
