# Roadmap

- [x] Download noorbazaar repo from GitHub and copy source into project
- [x] Enable Lovable Cloud (new backend) and install dependencies
- [x] Apply database schema (store: profiles, user_roles, products, reviews, orders, site_settings)
- [ ] Create product-images storage bucket
- [x] Turn on login (email/password + Google) and verify sign-in flow
- [x] Build public API endpoint (/api/public/admin-dashboard) that serves admin panel data (orders + details) for the user's separate multi-admin dashboard, secured with an API key secret
- [x] Verify end-to-end: home page loads, test order placed (reference 1A6E16E7), order lands in database
- [ ] Save ADMIN_DASHBOARD_API_KEY secret (form rejected once — re-request) and verify API returns data with the key
- [ ] Ask user for data exports (products/orders) from old backend to import

