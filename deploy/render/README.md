# Render temporary portfolio demo

This Blueprint creates two **free web services** and one **free PostgreSQL database** in Oregon. The database expires 30 days after creation. Free services sleep after 15 idle minutes; cold starts are slow. The gateway permits a two-minute API startup window. Free instance hours (750/month), bandwidth and build minutes are shared with other workspace services. Review billing limits before applying: bandwidth/build overages can be charged when a payment method exists. This is a fictional-data demo, not production lending infrastructure.

The Java API is public because free web services cannot receive private-network traffic. Its authenticated business routes retain their existing authorization. PostgreSQL blocks external connections. The gateway reaches the API over HTTPS. Render generates and persists two independent secrets; do not rotate them while retaining the database without a data migration. Credentials are never committed. Existing services are not adopted.

Automatic deploys and Blueprint automatic sync are intentionally disabled for this initial rollout. Review any future plan before applying. Configure an administrator separately using managed secrets only if portal administration is wanted; the public calculator needs no administrator. Do not upload real identity or financial documents.

Validate with `render blueprints validate render.yaml` when Render CLI is available. The public JSON schema and shell syntax/wiring tests are checked locally, but Docker build and end-to-end hosting must still be verified by the deployment. The Docker build runs Maven verify; the Node build uses the locked production dependencies.

After applying, monitor both specific deployment records to live, then check the public `/health`, calculator load, a repayment calculation, monthly/annual views, and CSV. Confirm failure/retry behavior. Do not call the app live merely because resources were created.
