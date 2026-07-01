# PROJECT_VISION

_Downstream: PRODUCT_REQUIREMENTS.md, BUSINESS_RULES.md, MODULES.md._

## 1. One-line vision

**SchoolOS is the operating system for Indian schools** — a multi-tenant SaaS that lets a school run admissions, academics, fees, attendance, communication, transport, and reporting from a single modern dashboard, while we (the platform operator) onboard, bill, and support hundreds to thousands of such schools from one Super Admin console.

## 2. The problem

Indian schools (especially in Tier-2 and Tier-3 cities) operate on a patchwork of:

- WhatsApp groups for parent communication
- Excel sheets for fees, marks, and attendance
- Paper registers for visitors, transport, library
- Locally-installed Windows ERPs that are 10–15 years old, ugly, and cannot be accessed from a phone

The pain points:

- **Fee collection is leaky.** Receipts are paper, dues tracking is manual, defaulters are forgotten.
- **Parent communication is noisy.** WhatsApp groups conflate official school comms with chatter.
- **Marks and report cards** are rebuilt every term in Word/Excel.
- **Transport, hostel, library, inventory** are not digitized at all.
- **The principal has no live view** of fee collection, attendance, or staff performance.
- **Existing ERP vendors** charge enterprise prices, lock data into their server, and require IT visits to do anything.

## 3. Our positioning

| Axis                     | Most Indian ERPs            | Modern SaaS (Stripe/Linear)  | **SchoolOS**                                      |
| ------------------------ | --------------------------- | ---------------------------- | ------------------------------------------------- |
| UX                       | 2010-era Bootstrap admin    | Premium, opinionated         | Premium, opinionated, school-domain-aware         |
| Pricing                  | One-time + AMC, opaque      | Transparent SaaS subscription| Transparent INR/student/month, free trial         |
| Tenancy                  | Per-school server installs  | Multi-tenant cloud           | Multi-tenant cloud, India-region                  |
| Mobile                   | Afterthought                | First-class                  | Responsive web v1, native parent app v2           |
| Communications           | Email only or none          | Email + push                 | SMS + WhatsApp + Email + Push (India-first)       |
| Compliance / billing     | Manual                      | Stripe                       | Razorpay + GST e-invoicing                        |

We compete on **product quality + price** in Tier-2/3 schools, not on enterprise features for elite international schools.

## 4. Target customer

**Primary ICP for the first 50 schools:**

- Private CBSE / ICSE / State Board schools
- 200–2000 students
- Located in Tier-2 / Tier-3 Indian cities
- Currently using Excel + WhatsApp + a local ERP they hate
- Owner-operated or trustee-run (decision-maker is the Principal or Director, not a CIO)
- Willing to do a free trial, will pay if value is shown within one term

**Secondary ICP (year 2+):** small school chains (3–10 branches), tutoring institutes, pre-schools.

**Out of scope (v1):** universities, government schools (different procurement), single-teacher tuition centres.

## 5. Business model

- **Free trial:** 60–90 days, full feature access, no payment information required at signup.
- **Subscription:** per-student-per-month, billed annually or quarterly, in INR. See BILLING_AND_SUBSCRIPTIONS.md for the plan matrix.
- **Plans gate features**, not data. A school that downgrades keeps its data; flagged-off modules become read-only or hidden.
- **Add-ons:** SMS credits, WhatsApp credits, premium support, AI features (future).
- **No per-seat licensing** for staff — students are the meter.

The unit economics target: payback within 1 academic term, gross margin > 75%, churn < 5% annually after the first year.

## 6. Strategic bets

1. **Multi-tenant from day one.** No "we will refactor later." Every table, every API, every UI screen is tenant-scoped.
2. **Communications is a feature, not a hand-off.** Parents want updates on WhatsApp; we own that channel inside the product.
3. **Feature flags > forks.** We never fork the codebase per school. Per-tenant configuration handles 95% of customization; modules behind flags handle the rest.
4. **Audit and observability are platform features**, not optional.
5. **Mobile-friendly web before native apps.** Native apps come once we know which 5 screens parents actually use.
6. **Operator console (Super Admin) is a real product**, not a SQL prompt. We will run support for 1000 schools through it.

## 7. Anti-goals (what we will not do)

- We will not build a generic admin panel that "any business can use." It is a school product.
- We will not let any user from one school read or write data of another school. Ever.
- We will not ship modules without per-tenant feature flags.
- We will not store PII (Aadhaar, raw marks, medical data) without an explicit business reason and access control.
- We will not let the codebase grow per-school branches — every customization is configuration.

## 8. Success metrics (north stars)

- **Activation:** % of trial schools that complete onboarding (school profile + ≥1 class + ≥10 students + ≥1 fee structure) within 14 days.
- **Conversion:** % of trial schools that subscribe within 90 days. Target: 30%+ after PMF.
- **Retention:** logo retention by year. Target: 95% by year 2.
- **NPS** from principals and class teachers, separately.
- **Tenant safety incidents:** target zero. Any cross-tenant leak is a P0.

## 9. The 12-month picture

By month 12, we expect:

- 50–150 paying schools
- 25,000–75,000 active students
- Stable Razorpay subscriptions, GST-compliant invoicing
- A native parent app in beta
- The first AI feature (likely fee-defaulter prediction or auto-generated report card comments) shipped behind a flag

## 10. Three-year picture

- 1000+ schools, 100,000+ students, multiple branches per chain
- Vernacular-language UI (Hindi + 2 regional languages)
- A marketplace for third-party integrations (transport GPS, biometrics, exam boards)
- AI as a paid tier, not a gimmick
- Platform-as-a-service: trustees/chains run their own sub-tenant hierarchies

This vision drives every architectural decision in the rest of this folder.
