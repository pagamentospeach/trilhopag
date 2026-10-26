import { redirect } from "next/navigation";

export default async function RedirectToBuilderPage({
  params,
}: {
  params: Promise<{ checkoutId: string }>;
}) {
  const { checkoutId } = await params;
  redirect(`/dashboard/checkout-builder/${checkoutId}`);
}
