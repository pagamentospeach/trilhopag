export default function VideoNotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <p className="text-7xl font-black leading-none bg-gradient-to-b from-cyan-300 to-cyan-600/30 bg-clip-text text-transparent tracking-tighter">
          404
        </p>
        <h1 className="mt-2 text-xl font-bold text-white tracking-tight">
          Vídeo não encontrado
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          O vídeo que você tentou acessar não existe ou foi removido.
        </p>
      </div>
    </div>
  );
}
