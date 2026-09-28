# Planned loan features

These items are planned, not implemented. The current design work covers the existing application, document review, and administration flows.

## Income-based eligibility

- Define configurable monthly-income conditions that determine available loan amounts and repayment periods.
- Show applicants how their income and existing commitments affect available options.
- Keep final calculations and eligibility enforcement in the Spring Boot service layer.
- Agree the policy thresholds and boundary cases before implementation; do not assume lending rules.

## AI-assisted loan simulation

- Provide an administrator workflow for generating thousands of synthetic loan scenarios for evaluation and retrieval.
- Choose a structured dataset format such as JSONL or CSV; PDF is optional where a document export is useful.
- Plan dataset versioning, retrieval, and an LLM-assisted explanation workflow grounded in approved loan policies and scenario data.
- Distinguish synthetic examples from real customer records and enforce access controls on any datasets.
- Keep monetary calculations and eligibility decisions deterministic; define the LLM’s scope before implementation.

The data schema, model/provider, retrieval approach, generation limits, and evaluation criteria remain to be agreed.
