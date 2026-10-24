# Roadmap

- [x] Download noorbazaar repo from GitHub and copy source into project
- [x] Enable Lovable Cloud (new backend) and install dependencies
- [x] Apply database schema (store: profiles, user_roles, products, reviews, orders, site_settings)
- [x] Create product-images storage bucket
- [x] Turn on login (email/password + Google) and verify sign-in flow
- [x] Build public API endpoint (/api/public/admin-dashboard) that serves admin panel data (orders + details) for the user's separate multi-admin dashboard, secured with an API key secret
- [x] Verify end-to-end: home page loads, test order placed (reference 1A6E16E7), order lands in database
- [x] Admin panel: CSV upload/import for products (parser + upsert, tests added, DB write path smoke-tested)
- [ ] Save ADMIN_DASHBOARD_API_KEY secret — pending user: API returns 401 until they fill the secure form (asked twice, declined; reopen only on their request)
- [ ] Import old backend data (products/orders) — waiting on CSV/JSON exports from the user or "Skip for now"
