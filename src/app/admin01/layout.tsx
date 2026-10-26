import "@/app/globals.css";

export const metadata = {
  title: "Trilho Admin",
  robots: "noindex, nofollow",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-black text-zinc-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
