import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/admin-dashboard")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) => {
        const provided = request.headers.get("x-api-key") ?? "";
        const expected = process.env["ADMIN_DASHBOARD_API_KEY"] ?? "";
        if (!expected || !provided || !timingSafeEqual(provided, expected)) {
          return json({ error: "Unauthorized" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [orders, products, reviews, settings] = await Promise.all([
          supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false }).limit(1000),
          supabaseAdmin.from("products").select("*").order("id"),
          supabaseAdmin.from("reviews").select("*").order("created_at", { ascending: false }).limit(1000),
          supabaseAdmin.from("site_settings").select("data").eq("id", 1).maybeSingle(),
        ]);

        if (orders.error || products.error || reviews.error) {
          return json(
            { error: "Failed to load admin data", details: [orders.error?.message, products.error?.message, reviews.error?.message].filter(Boolean) },
            500,
          );
        }

        const allOrders = orders.data ?? [];
        const pending = allOrders.filter((o) => o.status === "pending");
        const revenue = allOrders
          .filter((o) => o.status !== "cancelled")
          .reduce((sum, o) => sum + (o.total ?? 0), 0);

        return json({
          generated_at: new Date().toISOString(),
          stats: {
            total_orders: allOrders.length,
            pending_orders: pending.length,
            total_revenue: revenue,
            total_products: (products.data ?? []).length,
            total_reviews: (reviews.data ?? []).length,
          },
          orders: allOrders,
          products: products.data ?? [],
          reviews: reviews.data ?? [],
          site_settings: settings.data ?? null,
        });
      },
    },
  },
});
